from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from starlette.middleware.sessions import SessionMiddleware

from app.auth import KeycloakJWTMiddleware
from app.config import APP_NAME, DEBUG, SECRET_KEY
from app.database import Base, engine
from app.routers import auth, automations, sectors, users
from app.seed import seed_initial_data

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Application startup/shutdown lifecycle."""
    Base.metadata.create_all(bind=engine)

    # Lightweight migration guard for existing databases.
    try:
        db_inspector = inspect(engine)

        with engine.connect() as conn:
            def add_column_if_missing(table_name: str, column_name: str, column_type: str) -> None:
                columns = {col["name"] for col in db_inspector.get_columns(table_name)}
                if column_name not in columns:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
                    conn.commit()

            add_column_if_missing("users", "role", "VARCHAR(50) DEFAULT 'user'")
            add_column_if_missing("users", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            add_column_if_missing("users", "preferences", "TEXT")
            add_column_if_missing("automations", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            add_column_if_missing("automations", "config", "TEXT")
    except Exception as exc:
        print(f"Schema migration warning: {exc}")

    seed_initial_data()
    yield


def resolve_static_dir() -> Path:
    """Resolve frontend build folder in container and local development."""
    backend_root = Path(__file__).resolve().parents[1]  # /app in container, /.../backend local
    repo_root = backend_root.parent

    candidates = [
        backend_root / "static",  # Dockerfile default: COPY dist -> /app/static
        backend_root / "dist",  # fallback for deployments that place dist at /app/dist
        repo_root / "frontend" / "dist",  # local development
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


def build_cors_origins() -> list[str]:
    domain = os.getenv("DOMAIN", "auto.logtudo.com.br")
    return [
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:8000",
        "https://auto.logtudo.com.br",
        f"https://{domain}",
    ]


def create_app() -> FastAPI:
    app = FastAPI(
        title=APP_NAME,
        description="Portal de Automações Corporativas - API",
        version="1.0.0",
        debug=DEBUG,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=build_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Content-Type", "Authorization"],
    )

    # Middleware order matters in Starlette/FastAPI (last added runs first).
    # SessionMiddleware must run before KeycloakJWTMiddleware.
    app.add_middleware(KeycloakJWTMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=SECRET_KEY,
        https_only=not DEBUG,
        same_site="lax",
        max_age=60 * 60 * 8,
    )

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(automations.router, prefix=API_PREFIX)
    app.include_router(users.router, prefix=API_PREFIX)
    app.include_router(sectors.router, prefix=API_PREFIX)

    static_dir = resolve_static_dir()
    assets_dir = static_dir / "assets"
    if assets_dir.exists() and assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        return {"status": "healthy"}

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api"):
            return JSONResponse(
                status_code=404,
                content={
                    "error": f"Endpoint de API não encontrado: /{full_path}",
                    "method": request.method,
                },
            )

        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))

        index_path = static_dir / "index.html"
        if index_path.exists() and index_path.is_file():
            return FileResponse(str(index_path), headers={"Cache-Control": "no-store"})

        return JSONResponse(status_code=404, content={"error": "Frontend files not found."})

    return app


app = create_app()

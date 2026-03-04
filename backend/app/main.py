from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager
import os
from sqlalchemy import text

from app.auth import KeycloakJWTMiddleware
from app.config import APP_NAME, DEBUG, SECRET_KEY
from app.database import engine, Base
from app.routers import auth, automations, users, sectors
from app.seed import seed_initial_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for the application"""
    # Startup: Create tables and seed data
    Base.metadata.create_all(bind=engine)
    
    # --- MIGRATION FIX: Atualiza tabelas existentes ---
    try:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        
        with engine.connect() as conn:
            # Helper to add column if it doesn't exist
            def add_column_if_missing(table_name, column_name, column_type):
                columns = [c['name'] for c in inspector.get_columns(table_name)]
                if column_name not in columns:
                    print(f"Adding column {column_name} to {table_name}...")
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
                    conn.commit()

            add_column_if_missing("users", "role", "VARCHAR(50) DEFAULT 'user'")
            add_column_if_missing("users", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            add_column_if_missing("users", "preferences", "TEXT")
            add_column_if_missing("automations", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            add_column_if_missing("automations", "config", "TEXT")
            
            print("✓ Schema migrations checked/applied")
    except Exception as e:
        print(f"Schema migration warning: {e}")
        
    seed_initial_data()
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title=APP_NAME,
    description="Portal de Automações Corporativas - API",
    version="1.0.0",
    debug=DEBUG,
    lifespan=lifespan
)

# CORS Configuration
# Precisamos definir as origens explicitamente para que cookies/tokens funcionem
origins = [
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:8000",
    "https://auto.logtudo.com.br",
    f"https://{os.getenv('DOMAIN', 'auto.logtudo.com.br')}"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization"],
)
app.add_middleware(KeycloakJWTMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    https_only=not DEBUG,
    same_site="lax",  # Necessário para o redirect do OIDC funcionar corretamente
    max_age=60 * 60 * 8,  # 8 horas
)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(automations.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(sectors.router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

# --- CONFIGURAÇÃO DE ARQUIVOS ESTÁTICOS (FRONTEND) ---
# Prioriza caminhos de build em produção/container e mantém fallback para desenvolvimento local.
backend_root = Path(__file__).resolve().parents[1]  # /app (container) ou /.../backend (local)
repo_root = backend_root.parent
static_candidates = [
    backend_root / "static",       # Dockerfile atual copia para /app/static
    backend_root / "dist",         # fallback caso deploy coloque em /app/dist
    repo_root / "frontend" / "dist",  # desenvolvimento local
]
static_dir_path = next((candidate for candidate in static_candidates if candidate.exists()), backend_root / "static")
static_dir = str(static_dir_path)

# 1. Monta a pasta de assets (CSS/JS gerados pelo Vite/React)
assets_dir = os.path.join(static_dir, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# 2. Rota Catch-All para SPA (Single Page Application)
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
async def serve_spa(request: Request, full_path: str):
    # Se a rota começar com "api", é uma falha na API real (não deve retornar index.html)
    if full_path.startswith("api"):
        return JSONResponse(
            status_code=404, 
            content={
                "error": f"Endpoint de API não encontrado: /{full_path}",
                "method": request.method
            }
        )

    # 1. Tenta encontrar o arquivo no diretório estático (ex: favicon.ico, robot.svg)
    # Se full_path for "assets/index.js", ele procura em "static/assets/index.js"
    file_path = os.path.join(static_dir, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    # 2. Fallback para index.html (SPA) para permitir navegação no frontend
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return JSONResponse(
        status_code=404,
        content={"error": "Frontend files not found."}
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
    f"https://{os.getenv('DOMAIN', 'automacao.logtudo.com.br')}"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    https_only=not DEBUG, 
    same_site="lax", # Necessário para o redirect do OIDC funcionar corretamente
    max_age=60 * 60 * 8, # 8 horas
)
app.add_middleware(KeycloakJWTMiddleware)

# --- CONFIGURAÇÃO DE ARQUIVOS ESTÁTICOS (FRONTEND) ---
# Define o caminho absoluto para a pasta estática
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
assets_dir = os.path.join(static_dir, "assets")

# Include routers - Registramos os roteadores ANTES do catch-all do SPA
# Usamos prefixos claros para evitar conflitos
app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(automations.router, prefix="/api/v1/automations")
app.include_router(users.router, prefix="/api/v1/users")
app.include_router(sectors.router, prefix="/api/v1/sectors")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

# 1. Monta a pasta de assets (CSS/JS gerados pelo Vite/React)
# Montamos em /assets para que as referências do index.html funcionem
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# 2. Rota Catch-All para SPA (Single Page Application)
# Qualquer rota não encontrada na API ou nos Assets será direcionada para o index.html
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
async def serve_spa(full_path: str):
    # Se a rota começar com "api", é uma falha na API (não deve retornar index.html)
    if full_path.startswith("api"):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=404, 
            content={"error": f"Endpoint de API não encontrado: /{full_path}"}
        )

    # Verifica se o arquivo solicitado existe na raiz estática (ex: favicon.ico, robot.svg)
    file_path = os.path.join(static_dir, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    # Caso contrário, retorna o index.html para o React Router assumir
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=404,
        content={"error": f"Arquivo não encontrado e index.html ausente em {static_dir}"}
    )

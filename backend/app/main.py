from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import APP_NAME, DEBUG
from app.database import engine, Base
from app.routers import auth, automations, users, sectors
from app.seed import seed_initial_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for the application"""
    # Startup: Create tables and seed data
    Base.metadata.create_all(bind=engine)
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(automations.router)
app.include_router(users.router)
app.include_router(sectors.router)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "name": APP_NAME,
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

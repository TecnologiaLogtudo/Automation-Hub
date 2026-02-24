from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

from app.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    # pool_pre_ping: Testa a conexão antes de usá-la. 
    # Resolve problemas de "Gateway Timeout" por conexões mortas.
    pool_pre_ping=True,
    
    # pool_size: Mantém 5 conexões abertas prontas para uso.
    pool_size=5,
    
    # max_overflow: Permite abrir até 10 conexões extras em picos de tráfego.
    max_overflow=10,
    
    # pool_recycle: Fecha e recria conexões a cada 1 hora para evitar que 
    # o firewall ou o banco matem a conexão por inatividade.
    pool_recycle=300,
    
    connect_args={
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
    
    echo=False
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

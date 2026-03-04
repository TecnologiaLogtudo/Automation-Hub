import os

from dotenv import load_dotenv

load_dotenv()

# Database
# Se DATABASE_URL estiver definida (como no Docker), usa ela. 
# Caso contrário, monta uma para desenvolvimento local.
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres") # Senha padrão local
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "automacao_db")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Session/Auth
SECRET_KEY = os.getenv("SECRET_KEY", "sua-chave-secreta-muito-segura-aqui")

# Keycloak OIDC
KEYCLOAK_BASE_URL = os.getenv("KEYCLOAK_BASE_URL", "https://sso.logtudo.com.br")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "logtudo")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "hub-automacao")
KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET")
KEYCLOAK_REDIRECT_URI = os.getenv("KEYCLOAK_REDIRECT_URI", "https://automacao.logtudo.com.br/api/v1/auth/callback")
KEYCLOAK_SCOPE = os.getenv("KEYCLOAK_SCOPE", "openid profile email")
KEYCLOAK_AUDIENCE = os.getenv("KEYCLOAK_AUDIENCE")

KEYCLOAK_ISSUER = f"{KEYCLOAK_BASE_URL.rstrip('/')}/realms/{KEYCLOAK_REALM}"
KEYCLOAK_AUTHORIZATION_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/auth"
KEYCLOAK_TOKEN_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/token"
KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
KEYCLOAK_LOGOUT_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/logout"

# App
APP_NAME = os.getenv("APP_NAME", "Automation Hub")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

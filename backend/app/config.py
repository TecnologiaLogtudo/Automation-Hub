import os
from dotenv import load_dotenv

load_dotenv()

# App Configuration
APP_NAME = os.getenv("APP_NAME", "Automation Hub")
# Segurança: Padrão False para produção. Só é True se explicitamente definido.
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Database
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "auto_teste")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Session/Auth
SECRET_KEY = os.getenv("SECRET_KEY", "sua-chave-secreta-muito-segura-aqui")
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Mantido para compatibilidade, mas o TTL do Keycloak prevalece no OIDC

# Keycloak OIDC Configuration
KEYCLOAK_BASE_URL = os.getenv("KEYCLOAK_BASE_URL", "https://sso.logtudo.com.br")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "logtudo")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "hub-automacao")
KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET") # Obrigatório para client 'confidential'
KEYCLOAK_REDIRECT_URI = os.getenv("KEYCLOAK_REDIRECT_URI", "https://auto.logtudo.com.br/api/v1/auth/callback")
KEYCLOAK_SCOPE = os.getenv("KEYCLOAK_SCOPE", "openid profile email")
KEYCLOAK_AUDIENCE = os.getenv("KEYCLOAK_AUDIENCE") # Opcional, se o token tiver aud diferente do client_id

# Derived Keycloak URLs (Keycloak 26 Standard)
_KEYCLOAK_ISSUER_BASE = f"{KEYCLOAK_BASE_URL.rstrip('/')}/realms/{KEYCLOAK_REALM}"
KEYCLOAK_ISSUER = _KEYCLOAK_ISSUER_BASE
KEYCLOAK_AUTHORIZATION_URL = f"{_KEYCLOAK_ISSUER_BASE}/protocol/openid-connect/auth"
KEYCLOAK_TOKEN_URL = f"{_KEYCLOAK_ISSUER_BASE}/protocol/openid-connect/token"
KEYCLOAK_JWKS_URL = f"{_KEYCLOAK_ISSUER_BASE}/protocol/openid-connect/certs"
KEYCLOAK_LOGOUT_URL = f"{_KEYCLOAK_ISSUER_BASE}/protocol/openid-connect/logout"

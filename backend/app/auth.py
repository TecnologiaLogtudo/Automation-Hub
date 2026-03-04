import base64
import hashlib
import secrets
import threading
import time
from functools import wraps
from typing import Any, Callable, Optional
from urllib.parse import urlencode

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.config import (
    KEYCLOAK_AUDIENCE,
    KEYCLOAK_AUTHORIZATION_URL,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_ISSUER,
    KEYCLOAK_JWKS_URL,
    KEYCLOAK_SCOPE,
    KEYCLOAK_TOKEN_URL,
)
from app.models import User

# Contexto de senha mantido para compatibilidade com usuários locais legados, se houver
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Cache para as chaves públicas (JWKS) do Keycloak para evitar requests a cada validação
_jwks_cache: dict[str, Any] = {"value": None, "expires_at": 0.0}
_jwks_lock = threading.Lock()
_JWKS_TTL_SECONDS = 600  # 10 minutos de cache

# Store simples em memória para refresh tokens (em produção, usar Redis é recomendado)
_refresh_token_store: dict[str, str] = {}
_refresh_token_lock = threading.Lock()


class AuthenticatedUser(BaseModel):
    """Modelo unificado de usuário autenticado (via sessão ou token)"""
    subject: str  # ID do usuário no Keycloak (sub)
    id: Optional[int] = None  # ID local no banco (se sincronizado)
    email: Optional[str] = None
    full_name: str = ""
    roles: list[str] = Field(default_factory=list)
    role: str = "user"  # Role primária para lógica simplificada
    is_admin: bool = False
    sector_id: Optional[int] = None
    token_claims: dict[str, Any] = Field(default_factory=dict)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def generate_pkce_pair() -> tuple[str, str]:
    """Gera o par verifier e challenge para o fluxo PKCE"""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).decode("utf-8").rstrip("=")
    return verifier, challenge


def extract_roles(claims: dict[str, Any]) -> list[str]:
    """Extrai roles de realm e resource_access do token"""
    roles: set[str] = set()
    
    # 1. Realm Roles
    realm_roles = claims.get("realm_access", {}).get("roles", [])
    roles.update(realm_roles)

    # 2. Client Roles (resource_access)
    resource_access = claims.get("resource_access", {})
    if isinstance(resource_access, dict):
        # Tenta pegar roles específicas do nosso client, se existirem
        client_access = resource_access.get(KEYCLOAK_CLIENT_ID, {})
        if isinstance(client_access, dict):
            roles.update(client_access.get("roles", []))
            
    return sorted(list(roles))


def pick_primary_role(roles: list[str], fallback: str = "user") -> str:
    """Define uma role principal baseada em prioridade para lógica simples"""
    priority = ["admin", "realm-admin", "manager", "analyst", "user"]
    role_set = set(roles)
    for role in priority:
        if role in role_set:
            return role
    return fallback


def _fetch_jwks() -> dict[str, Any]:
    """Busca as chaves públicas do Keycloak com cache"""
    now = time.time()
    with _jwks_lock:
        if _jwks_cache["value"] and _jwks_cache["expires_at"] > now:
            return _jwks_cache["value"]

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(KEYCLOAK_JWKS_URL)
            response.raise_for_status()
            jwks = response.json()

        with _jwks_lock:
            _jwks_cache["value"] = jwks
            _jwks_cache["expires_at"] = time.time() + _JWKS_TTL_SECONDS
        return jwks
    except Exception as e:
        print(f"Erro ao buscar JWKS: {e}")
        # Se falhar e tiver cache antigo, tenta usar (opcional, aqui falha direto)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Auth service unavailable")


def _find_signing_key(token: str) -> dict[str, Any]:
    """Encontra a chave pública correta para o token baseada no header 'kid'"""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid JWT header")
        
    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWT without kid header")

    jwks = _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
            
    # Se não achou, força refresh do cache e tenta de novo (caso a chave tenha rotacionado)
    with _jwks_lock:
        _jwks_cache["expires_at"] = 0
    
    jwks = _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
            
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")


def validate_keycloak_jwt(token: str) -> dict[str, Any]:
    """Valida assinatura, expiração, issuer e audience do JWT"""
    signing_key = _find_signing_key(token)
    
    # Se KEYCLOAK_AUDIENCE não estiver definido, usa o Client ID como padrão
    # Keycloak muitas vezes coloca o 'account' como audience também, então verify_aud=True requer cuidado
    audience = KEYCLOAK_AUDIENCE or KEYCLOAK_CLIENT_ID
    
    try:
        return jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=audience,
            issuer=KEYCLOAK_ISSUER,
            options={
                "verify_aud": True,
                "verify_exp": True,
                "verify_iss": True
            },
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def build_authorization_url(state: str, code_challenge: str, redirect_uri: str) -> str:
    """Constrói a URL para redirecionar o usuário para o login do Keycloak"""
    query = urlencode(
        {
            "client_id": KEYCLOAK_CLIENT_ID,
            "response_type": "code",
            "scope": KEYCLOAK_SCOPE,
            "redirect_uri": redirect_uri,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{KEYCLOAK_AUTHORIZATION_URL}?{query}"


def exchange_code_for_tokens(code: str, code_verifier: str, redirect_uri: str) -> dict[str, Any]:
    """Troca o authorization code por tokens (Access, ID, Refresh)"""
    payload = {
        "grant_type": "authorization_code",
        "client_id": KEYCLOAK_CLIENT_ID,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    
    # Para clientes confidenciais, o secret é obrigatório
    if KEYCLOAK_CLIENT_SECRET:
        payload["client_secret"] = KEYCLOAK_CLIENT_SECRET

    with httpx.Client(timeout=10.0) as client:
        response = client.post(KEYCLOAK_TOKEN_URL, data=payload)
        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token exchange failed: {response.text}",
            )
        return response.json()


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    """Usa o refresh token para obter um novo access token"""
    payload = {
        "grant_type": "refresh_token",
        "client_id": KEYCLOAK_CLIENT_ID,
        "refresh_token": refresh_token,
    }
    if KEYCLOAK_CLIENT_SECRET:
        payload["client_secret"] = KEYCLOAK_CLIENT_SECRET

    with httpx.Client(timeout=10.0) as client:
        response = client.post(KEYCLOAK_TOKEN_URL, data=payload)
        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Refresh token failed: {response.text}",
            )
        return response.json()


# --- Gerenciamento de Sessão ---

def get_or_create_session_id(request: Request) -> str:
    sid = request.session.get("sid")
    if not sid:
        sid = secrets.token_urlsafe(32)
        request.session["sid"] = sid
    return sid


def set_refresh_token_for_session(sid: str, refresh_token: str) -> None:
    with _refresh_token_lock:
        _refresh_token_store[sid] = refresh_token


def get_refresh_token_for_session(sid: str) -> Optional[str]:
    with _refresh_token_lock:
        return _refresh_token_store.get(sid)


def clear_refresh_token_for_session(sid: Optional[str]) -> None:
    if not sid:
        return
    with _refresh_token_lock:
        _refresh_token_store.pop(sid, None)


def _claims_to_authenticated_user(claims: dict[str, Any], db: Session) -> AuthenticatedUser:
    """Converte claims do JWT em objeto AuthenticatedUser, mesclando com dados locais se existirem"""
    email = claims.get("email")
    subject = claims.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token without subject")

    keycloak_roles = extract_roles(claims)
    
    # Tenta vincular com usuário local pelo email para pegar preferências/setor
    local_user = db.query(User).filter(User.email == email).first() if email else None

    # Define role principal (prioridade para Keycloak, fallback para local)
    primary_role = pick_primary_role(keycloak_roles, fallback=(local_user.role if local_user else "user"))
    
    # Admin se tiver role 'admin' no Keycloak OU flag is_admin no banco local
    is_admin = "admin" in keycloak_roles or "realm-admin" in keycloak_roles or bool(local_user and local_user.is_admin)

    full_name = claims.get("name") or (local_user.full_name if local_user else "") or email or subject
    sector_id = claims.get("sector_id") or (local_user.sector_id if local_user else None)
    
    # ID local para relacionamentos de banco de dados
    local_id = local_user.id if local_user else None

    return AuthenticatedUser(
        subject=subject,
        id=local_id,
        email=email,
        full_name=full_name,
        roles=keycloak_roles,
        role=primary_role,
        is_admin=is_admin,
        sector_id=sector_id,
        token_claims=claims,
    )


def claims_to_authenticated_user(claims: dict[str, Any], db: Session) -> AuthenticatedUser:
    return _claims_to_authenticated_user(claims, db)


class KeycloakJWTMiddleware(BaseHTTPMiddleware):
    """
    Middleware que popula request.state.auth_user baseado na sessão.
    Não valida o JWT remotamente a cada request para performance, confia na sessão segura (cookie assinado).
    """
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        session_user_data = request.session.get("user") if "session" in request.scope else None
        if session_user_data:
            try:
                request.state.auth_user = AuthenticatedUser(**session_user_data)
            except Exception:
                # Se o modelo mudar ou dados corrompidos, limpa a sessão
                request.session.pop("user", None)
        
        return await call_next(request)


# --- Dependências para Rotas ---

def require_session_user(request: Request) -> AuthenticatedUser:
    """Dependência que exige usuário logado na sessão"""
    if hasattr(request.state, "auth_user") and request.state.auth_user:
        return request.state.auth_user

    # Se for API call, retorna 401. Se for navegação, o frontend deve redirecionar para login.
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


def get_current_user(current_user: AuthenticatedUser = Depends(require_session_user)) -> AuthenticatedUser:
    return current_user


def get_current_admin(current_user: AuthenticatedUser = Depends(require_session_user)) -> AuthenticatedUser:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def roles_required(*required_roles: str):
    """Decorator/Dependência para exigir roles específicas"""
    required_set = set(required_roles)

    def dependency(current_user: AuthenticatedUser = Depends(require_session_user)) -> AuthenticatedUser:
        user_roles = set(current_user.roles)
        # Verifica se tem pelo menos uma das roles requeridas (ou se é admin, que geralmente pode tudo)
        if not required_set.intersection(user_roles) and "admin" not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {sorted(required_set)}",
            )
        return current_user

    return dependency
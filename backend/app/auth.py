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
from starlette.responses import JSONResponse, RedirectResponse, Response

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
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

_jwks_cache: dict[str, Any] = {"value": None, "expires_at": 0.0}
_jwks_lock = threading.Lock()
_JWKS_TTL_SECONDS = 600

_refresh_token_store: dict[str, str] = {}
_refresh_token_lock = threading.Lock()


class AuthenticatedUser(BaseModel):
    subject: str
    id: Optional[int] = None
    email: Optional[str] = None
    full_name: str = ""
    roles: list[str] = Field(default_factory=list)
    role: str = "user"
    is_admin: bool = False
    sector_id: Optional[int] = None
    token_claims: dict[str, Any] = Field(default_factory=dict)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).decode("utf-8").rstrip("=")
    return verifier, challenge


def extract_roles(claims: dict[str, Any]) -> list[str]:
    roles: set[str] = set()
    realm_roles = claims.get("realm_access", {}).get("roles", [])
    roles.update(realm_roles)

    resource_access = claims.get("resource_access", {})
    if isinstance(resource_access, dict):
        for client_data in resource_access.values():
            if isinstance(client_data, dict):
                roles.update(client_data.get("roles", []))
    return sorted(roles)


def pick_primary_role(roles: list[str], fallback: str = "user") -> str:
    priority = ["admin", "realm-admin", "manager", "analyst", "user"]
    role_set = set(roles)
    for role in priority:
        if role in role_set:
            return role
    return fallback


def _fetch_jwks() -> dict[str, Any]:
    now = time.time()
    with _jwks_lock:
        if _jwks_cache["value"] and _jwks_cache["expires_at"] > now:
            return _jwks_cache["value"]

    with httpx.Client(timeout=10.0) as client:
        response = client.get(KEYCLOAK_JWKS_URL)
        response.raise_for_status()
        jwks = response.json()

    with _jwks_lock:
        _jwks_cache["value"] = jwks
        _jwks_cache["expires_at"] = time.time() + _JWKS_TTL_SECONDS
    return jwks


def _find_signing_key(token: str) -> dict[str, Any]:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWT without kid header")

    jwks = _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")


def validate_keycloak_jwt(token: str) -> dict[str, Any]:
    signing_key = _find_signing_key(token)
    verify_aud = bool(KEYCLOAK_AUDIENCE)
    audience = KEYCLOAK_AUDIENCE or KEYCLOAK_CLIENT_ID
    try:
        return jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=audience,
            issuer=KEYCLOAK_ISSUER,
            options={"verify_aud": verify_aud},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def build_authorization_url(state: str, code_challenge: str, redirect_uri: str) -> str:
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
    payload = {
        "grant_type": "authorization_code",
        "client_id": KEYCLOAK_CLIENT_ID,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
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
    email = claims.get("email")
    subject = claims.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token without subject")

    keycloak_roles = extract_roles(claims)
    local_user = db.query(User).filter(User.email == email).first() if email else None

    primary_role = pick_primary_role(keycloak_roles, fallback=(local_user.role if local_user else "user"))
    is_admin = "admin" in keycloak_roles or "realm-admin" in keycloak_roles or bool(local_user and local_user.is_admin)

    full_name = claims.get("name") or (local_user.full_name if local_user else "") or email or subject
    sector_id = claims.get("sector_id") or (local_user.sector_id if local_user else None)
    local_id = local_user.id if local_user else claims.get("local_user_id")
    if local_id is not None:
        try:
            local_id = int(local_id)
        except (TypeError, ValueError):
            local_id = None

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


def _get_bearer_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _is_excluded_path(path: str) -> bool:
    excluded_prefixes = (
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/assets",
        "/api/v1/auth/login",
        "/api/v1/auth/callback",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
    )
    return path.startswith(excluded_prefixes)


class KeycloakJWTMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        bearer = _get_bearer_token(request)

        if bearer:
            claims = validate_keycloak_jwt(bearer)
            request.state.token_claims = claims

        if path.startswith("/api/v1") and not _is_excluded_path(path):
            session_user_data = request.session.get("user") if "session" in request.scope else None
            if session_user_data:
                request.state.auth_user = AuthenticatedUser(**session_user_data)
            has_session_user = bool(session_user_data)
            has_claims = bool(getattr(request.state, "token_claims", None))
            if not has_session_user and not has_claims:
                accepts_html = "text/html" in request.headers.get("accept", "").lower()
                if accepts_html:
                    next_url = str(request.url)
                    return RedirectResponse(url=f"/api/v1/auth/login?next={next_url}", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Not authenticated", "login_url": "/api/v1/auth/login"},
                )

        return await call_next(request)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> AuthenticatedUser:
    claims = getattr(request.state, "token_claims", None)
    if claims:
        user = _claims_to_authenticated_user(claims, db)
        request.state.auth_user = user
        return user

    session_user = request.session.get("user") if "session" in request.scope else None
    if session_user:
        auth_user = AuthenticatedUser(**session_user)
        request.state.auth_user = auth_user
        return auth_user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_admin(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def require_roles(*required_roles: str):
    required_set = set(required_roles)

    def dependency(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if not required_set.intersection(set(current_user.roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {sorted(required_set)}",
            )
        return current_user

    return dependency


def roles_required(*required_roles: str):
    required_set = set(required_roles)

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = kwargs.get("request")
            if request is None:
                request = next((arg for arg in args if isinstance(arg, Request)), None)
            if request is None:
                raise RuntimeError("roles_required decorator needs Request in endpoint signature")

            auth_user = getattr(request.state, "auth_user", None)
            if not auth_user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
            if not required_set.intersection(set(auth_user.roles)):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Required roles: {sorted(required_set)}",
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator

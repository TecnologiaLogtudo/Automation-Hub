import secrets
from typing import Optional
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import KEYCLOAK_REDIRECT_URI, KEYCLOAK_CLIENT_ID, KEYCLOAK_LOGOUT_URL
from app.database import get_db
from app.auth import (
    AuthenticatedUser,
    build_authorization_url,
    exchange_code_for_tokens,
    generate_pkce_pair,
    validate_keycloak_jwt,
    claims_to_authenticated_user,
    get_or_create_session_id,
    set_refresh_token_for_session,
    clear_refresh_token_for_session,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _frontend_base_url() -> str:
    parsed = urlparse(KEYCLOAK_REDIRECT_URI)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return "https://auto.logtudo.com.br"


def _sanitize_redirect_url(redirect_url: Optional[str]) -> str:
    base_url = _frontend_base_url()
    default_target = f"{base_url}/"
    if not redirect_url:
        return default_target

    parsed = urlparse(redirect_url)
    if not parsed.scheme and not parsed.netloc:
        if not redirect_url.startswith("/"):
            return default_target
        return f"{base_url}{redirect_url}"

    absolute_origin = f"{parsed.scheme}://{parsed.netloc}"
    if parsed.scheme in {"http", "https"} and absolute_origin == base_url:
        path = parsed.path or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        fragment = f"#{parsed.fragment}" if parsed.fragment else ""
        return f"{base_url}{path}{query}{fragment}"

    return default_target


def _build_login_error_redirect(error_code: str) -> str:
    query = urlencode({"auth_error": error_code})
    return f"{_frontend_base_url()}/login?{query}"


@router.get("/login")
def login(request: Request, redirect_url: Optional[str] = None):
    """
    Inicia o fluxo de login OIDC.
    1. Gera PKCE (verifier/challenge) e State.
    2. Salva verifier e state na sessão.
    3. Redireciona usuário para o Keycloak.
    """
    # Gera par PKCE
    code_verifier, code_challenge = generate_pkce_pair()
    
    # Gera estado aleatório para prevenir CSRF
    state = secrets.token_urlsafe(16)
    
    # Salva na sessão para validar no callback
    request.session["oauth_state"] = state
    request.session["oauth_verifier"] = code_verifier
    request.session.pop("user", None)

    # Salva URL de retorno já sanitizada para evitar open redirect
    request.session["post_login_redirect"] = _sanitize_redirect_url(redirect_url)

    # Constrói URL de autorização
    auth_url = build_authorization_url(
        state=state,
        code_challenge=code_challenge,
        redirect_uri=KEYCLOAK_REDIRECT_URI
    )
    
    return RedirectResponse(auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/callback")
@router.get("/callback/")
def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Recebe o code do Keycloak, troca por tokens e cria a sessão.
    """
    target_url = request.session.get("post_login_redirect", _sanitize_redirect_url(None))
    session_state = request.session.get("oauth_state")
    code_verifier = request.session.get("oauth_verifier")

    if error:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("oidc_error"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # 1. Valida parâmetros e State (CSRF)
    if not code or not state:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("missing_callback_params"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    if not session_state or state != session_state:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("invalid_state"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # 2. Recupera PKCE Verifier
    if not code_verifier:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("missing_verifier"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # 3. Troca Code por Tokens
    try:
        token_data = exchange_code_for_tokens(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=KEYCLOAK_REDIRECT_URI
        )
    except HTTPException:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("token_exchange_failed"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    
    if not access_token:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("no_access_token"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # 4. Valida e Decodifica o Token
    try:
        claims = validate_keycloak_jwt(access_token)
    except HTTPException:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("invalid_token"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    # 5. Cria objeto de usuário autenticado (vincula com DB local se possível)
    try:
        auth_user = claims_to_authenticated_user(claims, db)
    except HTTPException:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_verifier", None)
        request.session.pop("post_login_redirect", None)
        return RedirectResponse(
            _build_login_error_redirect("user_mapping_failed"),
            status_code=status.HTTP_303_SEE_OTHER,
        )
    
    # 6. Persiste na Sessão
    # Limpa dados temporários de auth
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_verifier", None)
    
    # Salva usuário na sessão (serializado como dict)
    request.session["user"] = auth_user.model_dump()
    
    # Salva refresh token (em memória ou banco seguro, não no cookie)
    sid = get_or_create_session_id(request)
    if refresh_token:
        set_refresh_token_for_session(sid, refresh_token)

    # 7. Redireciona de volta para o HUB
    request.session.pop("post_login_redirect", None)
    
    return RedirectResponse(target_url, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/logout")
def logout(request: Request, redirect_url: Optional[str] = None):
    """
    Encerra a sessão local e redireciona para logout no Keycloak.
    """
    # 1. Limpa refresh token do store
    sid = request.session.get("sid")
    clear_refresh_token_for_session(sid)
    
    # 2. Limpa sessão local (cookie)
    request.session.clear()
    
    # 3. Monta URL de logout do Keycloak
    # Keycloak 18+ usa post_logout_redirect_uri + client_id
    logout_redirect = _sanitize_redirect_url(redirect_url)
    query = urlencode(
        {
            "client_id": KEYCLOAK_CLIENT_ID,
            "post_logout_redirect_uri": logout_redirect,
        }
    )
    keycloak_logout = f"{KEYCLOAK_LOGOUT_URL}?{query}"
    
    return RedirectResponse(keycloak_logout, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/me", response_model=AuthenticatedUser)
def get_current_user_info(current_user: AuthenticatedUser = Depends(get_current_user)):
    """Retorna informações do usuário logado (para o frontend)"""
    return current_user

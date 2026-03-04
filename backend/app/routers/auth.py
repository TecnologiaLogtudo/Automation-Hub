import secrets
from typing import Optional
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
    
    # Se o frontend mandou uma URL para voltar depois, salva também
    if redirect_url:
        request.session["post_login_redirect"] = redirect_url

    # Constrói URL de autorização
    auth_url = build_authorization_url(
        state=state,
        code_challenge=code_challenge,
        redirect_uri=KEYCLOAK_REDIRECT_URI
    )
    
    return RedirectResponse(auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/callback")
@router.get("/callback/")
def callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    """
    Recebe o code do Keycloak, troca por tokens e cria a sessão.
    """
    # 1. Valida State (CSRF)
    session_state = request.session.get("oauth_state")
    if not session_state or state != session_state:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    # 2. Recupera PKCE Verifier
    code_verifier = request.session.get("oauth_verifier")
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Missing code verifier")

    # 3. Troca Code por Tokens
    try:
        token_data = exchange_code_for_tokens(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=KEYCLOAK_REDIRECT_URI
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to exchange token: {str(e)}")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    
    if not access_token:
        raise HTTPException(status_code=401, detail="No access token received")

    # 4. Valida e Decodifica o Token
    try:
        claims = validate_keycloak_jwt(access_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token signature: {str(e)}")

    # 5. Cria objeto de usuário autenticado (vincula com DB local se possível)
    auth_user = claims_to_authenticated_user(claims, db)
    
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
    # Pega a URL que o usuário queria ir, ou vai para a raiz
    target_url = request.session.pop("post_login_redirect", "https://auto.logtudo.com.br/")
    
    return RedirectResponse(target_url)


@router.get("/logout")
def logout(request: Request):
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
    logout_redirect = "https://auto.logtudo.com.br"
    keycloak_logout = (
        f"{KEYCLOAK_LOGOUT_URL}?"
        f"client_id={KEYCLOAK_CLIENT_ID}&"
        f"post_logout_redirect_uri={logout_redirect}"
    )
    
    return RedirectResponse(keycloak_logout)


@router.get("/me", response_model=AuthenticatedUser)
def get_current_user_info(current_user: AuthenticatedUser = Depends(get_current_user)):
    """Retorna informações do usuário logado (para o frontend)"""
    return current_user

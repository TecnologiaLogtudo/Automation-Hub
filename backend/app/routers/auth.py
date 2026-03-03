import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import KEYCLOAK_LOGOUT_URL, KEYCLOAK_REDIRECT_URI
from app.database import get_db
from app.auth import (
    AuthenticatedUser,
    build_authorization_url,
    claims_to_authenticated_user,
    clear_refresh_token_for_session,
    exchange_code_for_tokens,
    generate_pkce_pair,
    get_current_user,
    get_or_create_session_id,
    get_refresh_token_for_session,
    refresh_access_token,
    roles_required,
    set_refresh_token_for_session,
    validate_keycloak_jwt,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
def login(request: Request, next: str = Query("/", description="URL to redirect after login")):
    state = secrets.token_urlsafe(32)
    code_verifier, code_challenge = generate_pkce_pair()
    request.session["oidc_state"] = state
    request.session["oidc_code_verifier"] = code_verifier
    request.session["post_login_redirect"] = next
    authorization_url = build_authorization_url(
        state=state,
        code_challenge=code_challenge,
        redirect_uri=KEYCLOAK_REDIRECT_URI,
    )
    return RedirectResponse(url=authorization_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/callback")
def callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    expected_state = request.session.get("oidc_state")
    code_verifier = request.session.get("oidc_code_verifier")

    if not expected_state or state != expected_state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")
    if not code_verifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PKCE verifier not found")

    token_payload = exchange_code_for_tokens(code=code, code_verifier=code_verifier, redirect_uri=KEYCLOAK_REDIRECT_URI)
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token from Keycloak")

    claims = validate_keycloak_jwt(access_token)
    auth_user = claims_to_authenticated_user(claims, db)

    sid = get_or_create_session_id(request)
    refresh_token = token_payload.get("refresh_token")
    if refresh_token:
        set_refresh_token_for_session(sid, refresh_token)

    request.session["user"] = auth_user.model_dump(exclude={"token_claims"})
    request.session["access_token"] = access_token
    request.session["access_token_expires_at"] = int(time.time()) + int(token_payload.get("expires_in", 300))
    request.session.pop("oidc_state", None)
    request.session.pop("oidc_code_verifier", None)

    redirect_target = request.session.pop("post_login_redirect", "/")
    return RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)


@router.post("/refresh")
def refresh(request: Request):
    sid = request.session.get("sid")
    if not sid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found")

    refresh_token = get_refresh_token_for_session(sid)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token not found")

    token_payload = refresh_access_token(refresh_token)
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token in refresh")

    if token_payload.get("refresh_token"):
        set_refresh_token_for_session(sid, token_payload["refresh_token"])

    request.session["access_token"] = access_token
    request.session["access_token_expires_at"] = int(time.time()) + int(token_payload.get("expires_in", 300))

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": token_payload.get("expires_in"),
    }


@router.post("/logout")
def logout(request: Request):
    sid = request.session.get("sid")
    clear_refresh_token_for_session(sid)
    request.session.clear()
    return {"logout_url": KEYCLOAK_LOGOUT_URL, "detail": "Session cleared"}


@router.get("/me", response_model=AuthenticatedUser)
def get_current_user_info(current_user: AuthenticatedUser = Depends(get_current_user)):
    return current_user


@router.get("/rbac-example")
@roles_required("admin", "manager")
async def rbac_example(request: Request):
    auth_user = request.state.auth_user
    return {"detail": "Access granted", "roles": auth_user.roles}

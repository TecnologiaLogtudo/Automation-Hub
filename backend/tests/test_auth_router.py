import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from app.auth import AuthenticatedUser, KeycloakJWTMiddleware
from app.database import get_db
from app.routers import auth as auth_router


def _fake_db_dependency():
    yield object()


class AuthRouterTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.add_middleware(KeycloakJWTMiddleware)
        app.add_middleware(
            SessionMiddleware,
            secret_key="test-secret",
            https_only=False,
            same_site="lax",
        )
        app.include_router(auth_router.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = _fake_db_dependency
        self.client = TestClient(app)
        self.app = app

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _perform_login(self):
        captured = {"state": None}

        def _fake_build_authorization_url(state, code_challenge, redirect_uri):
            captured["state"] = state
            return "https://sso.logtudo.com.br/auth"

        with patch("app.routers.auth.generate_pkce_pair", return_value=("verifier", "challenge")):
            with patch("app.routers.auth.build_authorization_url", side_effect=_fake_build_authorization_url):
                with patch("app.routers.auth.secrets.token_urlsafe", return_value="fixed-csrf"):
                    response = self.client.get("/api/v1/auth/login", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "https://sso.logtudo.com.br/auth")
        self.assertIsNotNone(captured["state"])
        return captured["state"]

    def test_callback_success_sets_session_and_me(self):
        state = self._perform_login()
        user = AuthenticatedUser(
            subject="sub-123",
            id=10,
            email="user@example.com",
            full_name="Example User",
            roles=["user"],
            role="user",
            is_admin=False,
            sector_id=1,
            token_claims={"sub": "sub-123"},
        )

        with patch("app.routers.auth.exchange_code_for_tokens", return_value={"access_token": "token", "refresh_token": "refresh"}):
            with patch("app.routers.auth.validate_keycloak_jwt", return_value={"sub": "sub-123"}):
                with patch("app.routers.auth.claims_to_authenticated_user", return_value=user):
                    callback_response = self.client.get(
                        "/api/v1/auth/callback",
                        params={"code": "auth-code", "state": state},
                        follow_redirects=False,
                    )

        self.assertEqual(callback_response.status_code, 303)
        self.assertEqual(callback_response.headers["location"], f"{auth_router._frontend_base_url()}/")

        me_response = self.client.get("/api/v1/auth/me")
        self.assertEqual(me_response.status_code, 200)
        payload = me_response.json()
        self.assertEqual(payload["email"], "user@example.com")
        self.assertEqual(payload["subject"], "sub-123")

    def test_callback_with_invalid_state_redirects_to_login_error(self):
        response = self.client.get(
            "/api/v1/auth/callback",
            params={"code": "auth-code", "state": "wrong-state"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 303)
        self.assertIn("/login?auth_error=invalid_state", response.headers["location"])

    def test_logout_clears_session(self):
        state = self._perform_login()
        user = AuthenticatedUser(
            subject="sub-123",
            id=10,
            email="user@example.com",
            full_name="Example User",
            roles=["user"],
            role="user",
            is_admin=False,
            sector_id=1,
            token_claims={"sub": "sub-123"},
        )

        with patch("app.routers.auth.exchange_code_for_tokens", return_value={"access_token": "token"}):
            with patch("app.routers.auth.validate_keycloak_jwt", return_value={"sub": "sub-123"}):
                with patch("app.routers.auth.claims_to_authenticated_user", return_value=user):
                    self.client.get(
                        "/api/v1/auth/callback",
                        params={"code": "auth-code", "state": state},
                        follow_redirects=False,
                    )

        me_response_before = self.client.get("/api/v1/auth/me")
        self.assertEqual(me_response_before.status_code, 200)

        logout_response = self.client.get("/api/v1/auth/logout", follow_redirects=False)
        self.assertEqual(logout_response.status_code, 303)
        expected = f"post_logout_redirect_uri={auth_router._frontend_base_url().replace(':', '%3A').replace('/', '%2F')}%2F"
        self.assertIn(expected, logout_response.headers["location"])

        me_response_after = self.client.get("/api/v1/auth/me")
        self.assertEqual(me_response_after.status_code, 401)

    def test_callback_can_use_signed_state_without_session(self):
        state = auth_router._encode_state_payload(
            csrf="csrf-1",
            code_verifier="verifier-from-state",
            redirect_url=f"{auth_router._frontend_base_url()}/",
        )
        user = AuthenticatedUser(
            subject="sub-123",
            id=10,
            email="user@example.com",
            full_name="Example User",
            roles=["user"],
            role="user",
            is_admin=False,
            sector_id=1,
            token_claims={"sub": "sub-123"},
        )

        with patch("app.routers.auth.exchange_code_for_tokens", return_value={"access_token": "token"}):
            with patch("app.routers.auth.validate_keycloak_jwt", return_value={"sub": "sub-123"}):
                with patch("app.routers.auth.claims_to_authenticated_user", return_value=user):
                    callback_response = self.client.get(
                        "/api/v1/auth/callback",
                        params={"code": "auth-code", "state": state},
                        follow_redirects=False,
                    )

        self.assertEqual(callback_response.status_code, 303)
        self.assertEqual(callback_response.headers["location"], f"{auth_router._frontend_base_url()}/")
        me_response = self.client.get("/api/v1/auth/me")
        self.assertEqual(me_response.status_code, 200)


if __name__ == "__main__":
    unittest.main()

"""Firebase ID-token verification, exposed to routes as the `CurrentUser` dependency."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Annotated, Any, Protocol

import firebase_admin
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    uid: str
    is_anonymous: bool
    email: str | None
    name: str | None = None


class InvalidTokenError(Exception):
    """The ID token is malformed, expired, revoked, or not issued for this project."""


class TokenVerifier(Protocol):
    def verify(self, id_token: str) -> AuthenticatedUser: ...


def user_from_claims(claims: Mapping[str, Any]) -> AuthenticatedUser:
    firebase_claims = claims.get("firebase") or {}
    email = claims.get("email")
    name = claims.get("name")
    return AuthenticatedUser(
        uid=str(claims["uid"]),
        is_anonymous=firebase_claims.get("sign_in_provider") == "anonymous",
        email=email if isinstance(email, str) else None,
        name=name if isinstance(name, str) and name.strip() else None,
    )


class FirebaseTokenVerifier:
    """Verifies tokens with the Firebase Admin SDK.

    Verification only needs the project ID and Google's public signing keys, so no
    service-account key is required. When `FIREBASE_AUTH_EMULATOR_HOST` is set, the SDK
    accepts tokens from the local Auth emulator instead.
    """

    def __init__(self, project_id: str) -> None:
        try:
            self._app = firebase_admin.get_app()
        except ValueError:
            self._app = firebase_admin.initialize_app(options={"projectId": project_id})

    def verify(self, id_token: str) -> AuthenticatedUser:
        try:
            claims = firebase_auth.verify_id_token(id_token, app=self._app)
        except (ValueError, firebase_auth.InvalidIdTokenError) as exc:
            raise InvalidTokenError from exc
        return user_from_claims(claims)


_bearer_scheme = HTTPBearer(auto_error=False)


def get_token_verifier(request: Request) -> TokenVerifier:
    verifier: TokenVerifier = request.app.state.token_verifier
    return verifier


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid ID token",
        headers={"WWW-Authenticate": "Bearer"},
    )


# Sync on purpose: FastAPI runs it in a worker thread, so the SDK's blocking
# key fetch never stalls the event loop.
def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> AuthenticatedUser:
    if credentials is None:
        raise _unauthorized()
    try:
        return verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        raise _unauthorized() from exc


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]

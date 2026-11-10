from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tripwise_api.auth import AuthenticatedUser, InvalidTokenError
from tripwise_api.config import Settings
from tripwise_api.main import create_app

ADA = AuthenticatedUser(uid="user-ada", is_anonymous=False, email="ada@example.com", name="Ada")
DEMO = AuthenticatedUser(uid="user-demo", is_anonymous=True, email=None)


class FakeTokenVerifier:
    """Maps fixed token strings to users; anything else is rejected like a bad Firebase token."""

    def __init__(self, users: dict[str, AuthenticatedUser]) -> None:
        self._users = users

    def verify(self, id_token: str) -> AuthenticatedUser:
        try:
            return self._users[id_token]
        except KeyError as exc:
            raise InvalidTokenError from exc


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="test", app_version="test-sha", firebase_project_id="demo-tripwise")


@pytest.fixture
def verifier() -> FakeTokenVerifier:
    return FakeTokenVerifier({"ada-token": ADA, "demo-token": DEMO})


@pytest.fixture
def client(settings: Settings, verifier: FakeTokenVerifier) -> Iterator[TestClient]:
    with TestClient(create_app(settings, verifier)) as test_client:
        yield test_client

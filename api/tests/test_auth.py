"""The `CurrentUser` dependency, exercised through a throwaway route.

No product route needs a user until phase 2, so the test mounts its own.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tripwise_api.auth import CurrentUser, user_from_claims
from tripwise_api.config import Settings
from tripwise_api.main import Overrides, create_app


@pytest.fixture
def auth_client(settings: Settings, overrides: Overrides) -> Iterator[TestClient]:
    app = create_app(settings, overrides)

    @app.get("/api/_whoami")
    def whoami(user: CurrentUser) -> dict[str, object]:
        return {"uid": user.uid, "anonymous": user.is_anonymous}

    with TestClient(app) as client:
        yield client


def test_valid_token_resolves_the_user(auth_client: TestClient) -> None:
    response = auth_client.get("/api/_whoami", headers={"Authorization": "Bearer ada-token"})

    assert response.status_code == 200
    assert response.json() == {"uid": "user-ada", "anonymous": False}


def test_anonymous_demo_user_is_flagged(auth_client: TestClient) -> None:
    response = auth_client.get("/api/_whoami", headers={"Authorization": "Bearer demo-token"})

    assert response.json() == {"uid": "user-demo", "anonymous": True}


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer forged"}, {"Authorization": "Basic ada-token"}],
)
def test_missing_or_bad_token_is_rejected(auth_client: TestClient, headers: dict[str, str]) -> None:
    response = auth_client.get("/api/_whoami", headers=headers)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_claims_mapping_ignores_blank_names_and_non_string_emails() -> None:
    user = user_from_claims(
        {"uid": "u1", "email": 42, "name": "  ", "firebase": {"sign_in_provider": "google.com"}}
    )

    assert user.uid == "u1"
    assert user.email is None
    assert user.name is None
    assert user.is_anonymous is False

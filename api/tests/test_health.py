from fastapi.testclient import TestClient

from tests.conftest import FakeTokenVerifier
from tripwise_api.config import Settings
from tripwise_api.main import create_app
from tripwise_api.schemas import HealthResponse


def test_health_reports_ok_and_version(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert HealthResponse.model_validate(response.json()) == HealthResponse(
        status="ok", version="test-sha"
    )


def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/api/health", headers={"Authorization": "Bearer junk"}).status_code == 200


def test_unknown_routes_return_404(client: TestClient) -> None:
    assert client.get("/api/nope").status_code == 404


def test_docs_are_served_outside_production(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200


def test_docs_are_hidden_in_production(verifier: FakeTokenVerifier) -> None:
    settings = Settings(environment="production", firebase_project_id="demo-tripwise")
    with TestClient(create_app(settings, verifier)) as client:
        assert client.get("/api/docs").status_code == 404
        assert client.get("/api/openapi.json").status_code == 404

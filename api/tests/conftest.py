from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.fakes import (
    FakeBilling,
    FakeTokenVerifier,
    InMemoryRepository,
    MemoryOnlyCache,
    counter_ids,
)
from tripwise_api.ai.client import AiClient
from tripwise_api.ai.fake import FakeProvider
from tripwise_api.auth import AuthenticatedUser
from tripwise_api.config import Settings
from tripwise_api.integrations.fake_geocoder import FakeGeocoder
from tripwise_api.integrations.routing import NoRouter
from tripwise_api.integrations.weather import FakeWeather
from tripwise_api.main import Overrides, create_app
from tripwise_api.schemas.trip_request import (
    BudgetLevel,
    Destination,
    GeoPoint,
    Interest,
    Pace,
    Party,
    Travelers,
    TripRequest,
)

NOW = datetime(2026, 11, 10, 9, 0, tzinfo=UTC)
ADA = AuthenticatedUser(uid="user-ada", is_anonymous=False, email="ada@example.com", name="Ada")
DEMO = AuthenticatedUser(uid="user-demo", is_anonymous=True, email=None)
BOB = AuthenticatedUser(uid="user-bob", is_anonymous=False, email="bob@example.com", name="Bob")
AS_ADA = {"Authorization": "Bearer ada-token"}
AS_DEMO = {"Authorization": "Bearer demo-token"}
AS_BOB = {"Authorization": "Bearer bob-token"}

LISBON = Destination(
    name="Lisbon",
    display_name="Lisbon, Portugal",
    country="Portugal",
    country_code="pt",
    location=GeoPoint(lat=38.7223, lng=-9.1393),
    days=3,
)


def trip_request(**changes: Any) -> TripRequest:
    base = TripRequest(
        destinations=[LISBON],
        start_date=date(2026, 11, 20),
        travelers=Travelers(party=Party.COUPLE, adults=2),
        budget_level=BudgetLevel.MODERATE,
        budget_amount=1000,
        currency="EUR",
        interests=[Interest.FOOD, Interest.HISTORY],
        pace=Pace.BALANCED,
    )
    return base.model_copy(update=changes)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        app_version="test-sha",
        firebase_project_id="demo-tripwise",
        places_provider="fake",
        ai_providers="fake",
        app_url="https://tripwise.example",
    )


@pytest.fixture
def verifier() -> FakeTokenVerifier:
    return FakeTokenVerifier({"ada-token": ADA, "demo-token": DEMO, "bob-token": BOB})


@pytest.fixture
def repository() -> InMemoryRepository:
    return InMemoryRepository()


@pytest.fixture
def billing() -> FakeBilling:
    return FakeBilling()


@pytest.fixture
def overrides(
    verifier: FakeTokenVerifier, repository: InMemoryRepository, billing: FakeBilling
) -> Overrides:
    return Overrides(
        token_verifier=verifier,
        repository=repository,
        ai=AiClient([FakeProvider()]),
        geocoder=FakeGeocoder(),
        router=NoRouter(),
        weather=FakeWeather(),
        billing=billing,
        cache=MemoryOnlyCache(),
        clock=lambda: NOW,
        new_id=counter_ids("t"),
    )


@pytest.fixture
def client(settings: Settings, overrides: Overrides) -> Iterator[TestClient]:
    with TestClient(create_app(settings, overrides)) as test_client:
        yield test_client


def create_trip(
    client: TestClient, request: TripRequest | None = None, headers: dict[str, str] = AS_ADA
) -> dict[str, Any]:
    client.post("/api/me", headers=headers)
    body = {"request": (request or trip_request()).model_dump(mode="json")}
    response = client.post("/api/trips", json=body, headers=headers)
    assert response.status_code == 201, response.text
    trip: dict[str, Any] = response.json()
    return trip


def generate_all(
    client: TestClient, trip_id: str, days: int, headers: dict[str, str] = AS_ADA
) -> dict[str, Any]:
    trip: dict[str, Any] = {}
    for first in range(0, days, 4):
        response = client.post(
            f"/api/trips/{trip_id}/generate",
            json={"firstDay": first, "dayCount": 4},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        trip = response.json()
    return trip

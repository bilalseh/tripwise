from fastapi.testclient import TestClient

from tests.conftest import AS_ADA, AS_DEMO, create_trip
from tests.fakes import InMemoryRepository


def test_first_sign_in_creates_an_empty_profile(
    client: TestClient, repository: InMemoryRepository
) -> None:
    profile = client.post("/api/me", headers=AS_ADA).json()

    assert profile["uid"] == "user-ada"
    assert profile["isDemo"] is False
    assert profile["preferences"] == {"language": "en", "homeCurrency": "USD", "units": "metric"}
    assert repository.trips.get("user-ada") is None


def test_demo_sign_in_seeds_two_sample_trips_once(
    client: TestClient, repository: InMemoryRepository
) -> None:
    client.post("/api/me", headers=AS_DEMO)
    client.post("/api/me", headers=AS_DEMO)

    trips = client.get("/api/trips", headers=AS_DEMO).json()
    assert [t["title"] for t in trips] == ["Lisbon city break", "Copenhagen family week"]
    assert all(t["status"] == "ready" and t["stops"] > 10 for t in trips)
    packing = client.get("/api/trips/demo-lisbon/packing", headers=AS_DEMO).json()
    assert any(item["checked"] for item in packing["items"])
    assert len(client.get("/api/packing-templates", headers=AS_DEMO).json()) == 1


def test_demo_places_are_real_seeded_places(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)
    trip = client.get("/api/trips/demo-lisbon", headers=AS_DEMO).json()

    stops = [s for d in trip["days"] for s in d["stops"]]
    assert all(s["place"]["source"] == "seed" for s in stops)
    assert any(s["locked"] for s in stops)


def test_usage_reports_ai_and_trip_allowances(client: TestClient) -> None:
    create_trip(client)

    usage = client.get("/api/me/usage", headers=AS_ADA).json()

    assert usage["aiUsed"] == 0
    assert usage["aiLimit"] == 20
    assert usage["trips"] == 1
    assert usage["tripLimit"] == 3
    assert usage["resetsAt"].startswith("2026-11-11T00:00:00")


def test_preferences_are_validated_and_saved(client: TestClient) -> None:
    client.post("/api/me", headers=AS_ADA)
    prefs = {"language": "ar", "homeCurrency": "EUR", "units": "imperial"}

    assert (
        client.put("/api/me/preferences", json=prefs, headers=AS_ADA).json()["preferences"] == prefs
    )
    bad = client.put("/api/me/preferences", json={**prefs, "homeCurrency": "euros"}, headers=AS_ADA)
    assert bad.status_code == 422


def test_deleting_the_account_erases_everything(
    client: TestClient, repository: InMemoryRepository
) -> None:
    client.post("/api/me", headers=AS_DEMO)
    client.post("/api/trips/demo-lisbon/share", headers=AS_DEMO)

    assert client.delete("/api/me", headers=AS_DEMO).status_code == 204
    assert "user-demo" not in repository.profiles
    assert not repository.trips.get("user-demo")
    assert not repository.shares


def test_every_account_route_needs_a_token(client: TestClient) -> None:
    for method, path in [("post", "/api/me"), ("get", "/api/me/usage"), ("get", "/api/trips")]:
        assert client.request(method, path).status_code == 401

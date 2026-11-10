from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import AS_ADA, AS_BOB, AS_DEMO, LISBON, create_trip, generate_all, trip_request
from tests.fakes import InMemoryRepository


def test_a_new_trip_starts_as_a_draft(client: TestClient) -> None:
    trip = create_trip(client)

    assert trip["status"] == "draft"
    assert trip["days"] == []
    assert trip["version"] == 0
    assert trip["title"] == "Lisbon"


def test_generation_builds_grounded_days_and_counts_ai_requests(client: TestClient) -> None:
    trip = create_trip(client)

    ready = generate_all(client, trip["id"], days=3)

    assert ready["status"] == "ready"
    assert len(ready["days"]) == 3
    assert all(d["stops"] for d in ready["days"])
    assert all(s["place"]["source"] == "fake" for d in ready["days"] for s in d["stops"])
    assert ready["report"]["dropped"] == [f"Invented Garden of Wonders {n}" for n in (1, 2, 3)]
    assert client.get("/api/me/usage", headers=AS_ADA).json()["aiUsed"] == 1


def test_long_trips_generate_in_batches(client: TestClient) -> None:
    long = trip_request(destinations=[LISBON.model_copy(update={"days": 6})])
    trip = create_trip(client, long)

    first = client.post(
        f"/api/trips/{trip['id']}/generate", json={"firstDay": 0, "dayCount": 4}, headers=AS_ADA
    ).json()
    assert first["status"] == "draft"
    assert len(first["days"]) == 4
    skipped = client.post(
        f"/api/trips/{trip['id']}/generate", json={"firstDay": 5, "dayCount": 1}, headers=AS_ADA
    )
    assert skipped.status_code == 409
    rest = client.post(
        f"/api/trips/{trip['id']}/generate", json={"firstDay": 4, "dayCount": 4}, headers=AS_ADA
    ).json()
    assert rest["status"] == "ready"
    assert len(rest["days"]) == 6


def _save(client: TestClient, trip: dict[str, Any], **changes: Any) -> Any:
    body = {
        "baseVersion": trip["version"],
        "title": trip["title"],
        "days": trip["days"],
        "overrides": trip["overrides"],
    }
    return client.put(f"/api/trips/{trip['id']}", json={**body, **changes}, headers=AS_ADA)


def test_saving_edits_bumps_the_version_and_refuses_stale_writes(client: TestClient) -> None:
    trip = generate_all(client, create_trip(client)["id"], days=3)
    days = trip["days"]
    moved = days[0]["stops"].pop(0)
    days[1]["stops"].append({**moved, "locked": True})

    saved = _save(client, trip, days=days)
    assert saved.status_code == 200
    assert saved.json()["version"] == trip["version"] + 1
    assert saved.json()["days"][1]["stops"][-1]["locked"] is True
    assert _save(client, trip).status_code == 409  # still on the old version


def test_saves_are_validated(client: TestClient) -> None:
    trip = generate_all(client, create_trip(client)["id"], days=3)
    duplicate = [dict(d) for d in trip["days"]]
    duplicate[1] = {**duplicate[1], "stops": [*duplicate[1]["stops"], duplicate[0]["stops"][0]]}
    wrong_destination = [{**trip["days"][0], "destinationIndex": 1}]

    assert _save(client, trip, days=duplicate).status_code == 422
    assert _save(client, trip, days=wrong_destination).status_code == 422
    assert _save(client, trip, days=[*trip["days"], trip["days"][0]]).status_code == 422
    overrides = [{"day": 0, "category": "food", "amount": -5}]
    assert _save(client, trip, overrides=overrides).status_code == 422


def test_free_accounts_keep_three_trips(client: TestClient) -> None:
    for _ in range(3):
        create_trip(client)
    response = client.post(
        "/api/trips", json={"request": trip_request().model_dump(mode="json")}, headers=AS_ADA
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "trip_limit_reached"


def test_daily_ai_limit_returns_429_with_the_reset_time(
    client: TestClient, repository: InMemoryRepository
) -> None:
    trip = create_trip(client)
    repository.usage[("user-ada", "2026-11-10")] = 20

    response = client.post(
        f"/api/trips/{trip['id']}/generate", json={"firstDay": 0, "dayCount": 3}, headers=AS_ADA
    )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "ai_limit_reached"


def test_trips_are_private_to_their_owner(client: TestClient) -> None:
    trip = create_trip(client)
    client.post("/api/me", headers=AS_BOB)

    assert client.get(f"/api/trips/{trip['id']}", headers=AS_BOB).status_code == 404
    assert client.delete(f"/api/trips/{trip['id']}", headers=AS_BOB).status_code == 404
    assert client.get("/api/trips", headers=AS_BOB).json() == []


def test_duplicating_a_trip_resets_checks_and_shifts_dates(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)

    copy = client.post(
        "/api/trips/demo-lisbon/duplicate",
        json={"title": "Lisbon again", "startDate": "2027-05-01"},
        headers=AS_DEMO,
    )

    assert copy.status_code == 201
    new = copy.json()
    assert new["title"] == "Lisbon again"
    assert new["request"]["startDate"] == "2027-05-01"
    assert new["shareToken"] is None
    assert len(new["days"]) == 3
    packing = client.get(f"/api/trips/{new['id']}/packing", headers=AS_DEMO).json()
    assert not any(item["checked"] for item in packing["items"])
    documents = client.get(f"/api/trips/{new['id']}/documents", headers=AS_DEMO).json()
    tickets = next(i for i in documents["checklist"]["items"] if i["id"] == "tickets")
    assert tickets["dueDate"] == "2027-04-24"
    assert tickets["done"] is False


def test_deleting_a_trip_removes_it(client: TestClient) -> None:
    trip = create_trip(client)

    assert client.delete(f"/api/trips/{trip['id']}", headers=AS_ADA).status_code == 204
    assert client.get(f"/api/trips/{trip['id']}", headers=AS_ADA).status_code == 404


def test_ai_edit_returns_a_proposal_without_saving(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)
    trip = client.get("/api/trips/demo-lisbon", headers=AS_DEMO).json()
    body = {"action": "relaxed", "dayIndex": 0, "day": trip["days"][0]}

    proposal = client.post("/api/trips/demo-lisbon/ai-edit", json=body, headers=AS_DEMO).json()

    assert proposal["action"] == "relaxed"
    assert proposal["summary"]
    assert len(proposal["day"]["stops"]) < len(trip["days"][0]["stops"])
    assert "lis-jeronimos" in [s["id"] for s in proposal["day"]["stops"]]  # locked
    assert (
        client.get("/api/trips/demo-lisbon", headers=AS_DEMO).json()["version"] == trip["version"]
    )


def test_ai_edit_checks_the_day_belongs_to_the_trip(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)
    trip = client.get("/api/trips/demo-lisbon", headers=AS_DEMO).json()

    far = client.post(
        "/api/trips/demo-lisbon/ai-edit",
        json={"action": "cheaper", "dayIndex": 9, "day": trip["days"][0]},
        headers=AS_DEMO,
    )

    assert far.status_code == 422

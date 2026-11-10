from fastapi.testclient import TestClient

from tests.conftest import AS_DEMO


def _share(client: TestClient) -> str:
    client.post("/api/me", headers=AS_DEMO)
    link = client.post("/api/trips/demo-lisbon/share", headers=AS_DEMO).json()
    assert link["path"] == f"/share/{link['token']}"
    token: str = link["token"]
    return token


def test_shared_trip_is_public_and_read_only(client: TestClient) -> None:
    token = _share(client)

    shared = client.get(f"/api/shared/{token}")

    assert shared.status_code == 200
    body = shared.json()
    assert body["title"] == "Lisbon city break"
    assert len(body["days"]) == 3
    assert set(body) == {"title", "destinations", "startDate", "travelers", "currency", "days"}
    assert shared.headers["X-Robots-Tag"] == "noindex"
    assert shared.headers["Cache-Control"] == "no-store"
    assert client.put("/api/trips/demo-lisbon", json={}).status_code == 401


def test_notes_never_leave_through_a_share_link(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)
    trip = client.get("/api/trips/demo-lisbon", headers=AS_DEMO).json()
    trip["days"][0]["stops"][0]["note"] = "Door code 4512"
    body = {
        "baseVersion": trip["version"],
        "title": trip["title"],
        "days": trip["days"],
        "overrides": [],
    }
    client.put("/api/trips/demo-lisbon", json=body, headers=AS_DEMO)
    token = client.post("/api/trips/demo-lisbon/share", headers=AS_DEMO).json()["token"]

    shared = client.get(f"/api/shared/{token}").text

    assert "4512" not in shared


def test_sharing_again_returns_the_same_link(client: TestClient) -> None:
    token = _share(client)

    assert client.post("/api/trips/demo-lisbon/share", headers=AS_DEMO).json()["token"] == token


def test_revoked_and_unknown_links_are_404(client: TestClient) -> None:
    token = _share(client)

    assert client.delete("/api/trips/demo-lisbon/share", headers=AS_DEMO).status_code == 204
    assert client.get(f"/api/shared/{token}").status_code == 404
    assert client.get("/api/shared/not-a-real-token-at-all").status_code == 404
    assert client.get("/api/shared/x").status_code == 404

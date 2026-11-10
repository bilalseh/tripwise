from datetime import date

from fastapi.testclient import TestClient

from tests.conftest import AS_ADA, AS_DEMO, create_trip, trip_request


def test_packing_list_is_generated_then_saved(client: TestClient) -> None:
    trip = create_trip(client)
    fresh = client.get(f"/api/trips/{trip['id']}/packing", headers=AS_ADA).json()
    assert {"passport", "toothbrush"} <= {i["id"] for i in fresh["items"]}

    items = [
        {**fresh["items"][0], "checked": True},
        {
            "id": "custom1",
            "label": "Camera",
            "category": "electronics",
            "quantity": 1,
            "checked": False,
        },
    ]
    saved = client.put(f"/api/trips/{trip['id']}/packing", json={"items": items}, headers=AS_ADA)

    assert saved.status_code == 200
    assert client.get(f"/api/trips/{trip['id']}/packing", headers=AS_ADA).json()["items"] == items


def test_packing_templates_round_trip(client: TestClient) -> None:
    trip = create_trip(client)

    template = client.post(
        f"/api/trips/{trip['id']}/packing/template", json={"name": "Beach"}, headers=AS_ADA
    ).json()

    assert template["name"] == "Beach"
    assert not any(i["checked"] for i in template["items"])
    assert [t["id"] for t in client.get("/api/packing-templates", headers=AS_ADA).json()] == [
        template["id"]
    ]
    assert (
        client.delete(f"/api/packing-templates/{template['id']}", headers=AS_ADA).status_code == 204
    )
    assert (
        client.delete(f"/api/packing-templates/{template['id']}", headers=AS_ADA).status_code == 404
    )


def test_documents_come_with_official_links_and_a_passport_date(client: TestClient) -> None:
    trip = create_trip(client)

    documents = client.get(f"/api/trips/{trip['id']}/documents", headers=AS_ADA).json()

    assert documents["passportValidUntil"] == "2027-05-22"
    assert documents["officialLinks"][0]["url"] == "https://travel-europe.europa.eu/"
    edited = {
        "items": [{**documents["checklist"]["items"][0], "done": True, "note": "Renewed in May"}]
    }
    saved = client.put(f"/api/trips/{trip['id']}/documents", json=edited, headers=AS_ADA).json()
    assert saved["checklist"] == edited


def test_weather_is_a_forecast_inside_the_window(client: TestClient) -> None:
    trip = create_trip(client)  # starts on 20 November, ten days after NOW

    weather = client.get(f"/api/trips/{trip['id']}/weather", headers=AS_ADA).json()

    assert weather["kind"] == "forecast"
    assert [d["date"] for d in weather["destinations"][0]["days"]] == [
        "2026-11-20",
        "2026-11-21",
        "2026-11-22",
    ]
    assert "Open-Meteo" in weather["attribution"]


def test_weather_falls_back_to_typical_or_unavailable(client: TestClient) -> None:
    later = create_trip(client, trip_request(start_date=date(2027, 3, 1)))
    undated = create_trip(client, trip_request(start_date=None))

    assert (
        client.get(f"/api/trips/{later['id']}/weather", headers=AS_ADA).json()["kind"] == "typical"
    )
    assert client.get(f"/api/trips/{undated['id']}/weather", headers=AS_ADA).json() == {
        "kind": "unavailable",
        "destinations": [],
        "attribution": "Weather data by Open-Meteo.com",
    }


def test_place_search_returns_real_results_with_attribution(client: TestClient) -> None:
    client.post("/api/me", headers=AS_ADA)

    found = client.get("/api/places/search", params={"q": "Lisbon"}, headers=AS_ADA).json()

    assert found["results"][0]["place"]["location"] == {"lat": 38.7223, "lng": -9.1393}
    assert "OpenStreetMap" in found["attribution"]
    assert client.get("/api/places/search", params={"q": "x"}, headers=AS_ADA).status_code == 422


def test_place_search_is_rate_limited_per_user(client: TestClient) -> None:
    client.post("/api/me", headers=AS_ADA)
    codes = [
        client.get("/api/places/search", params={"q": "Lisbon"}, headers=AS_ADA).status_code
        for _ in range(21)
    ]

    assert codes[:20] == [200] * 20
    assert codes[20] == 429


def test_travel_times_are_labelled_with_their_source(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)
    points = [
        {"lat": 38.6979, "lng": -9.2068},
        {"lat": 38.6975, "lng": -9.2032},
        {"lat": 38.7139, "lng": -9.1335},
    ]

    legs = client.post("/api/travel", json={"points": points}, headers=AS_DEMO).json()["legs"]

    assert [leg["mode"] for leg in legs] == ["walk", "drive"]
    assert {leg["source"] for leg in legs} == {"estimate"}

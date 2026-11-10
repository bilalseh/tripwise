"""A deterministic provider for local development and E2E tests: no keys, no network.

It reads the JSON context that every prompt carries. Its suggestions are generic place names
that the fake geocoder resolves near the destination, plus one "Invented" place per day that no
geocoder can find, so the grounding step visibly drops it.
"""

import json
from typing import Any

from tripwise_api.ai.types import AiRequest, FailureKind, ProviderError
from tripwise_api.planning.prompts import read_context

_MORNING = ["Old Town Walking Route", "City History Museum", "Cathedral Square", "Botanical Garden"]
_AFTERNOON = ["Central Market Hall", "Riverside Promenade", "Modern Art Gallery", "Castle Hill"]
_EVENING = ["Harbour Food Street", "Sunset Viewpoint", "Jazz Corner Bar", "Night Market"]
_INDOOR = ["Science Centre", "Covered Arcade", "Aquarium"]
_FOOD = ["Neighbourhood Bakery", "Family Tavern", "Street Food Hall"]

_PER_PACE = {"relaxed": 3, "balanced": 5, "packed": 6}


def _stop(
    name: str, area: str, category: str, slot: str, minutes: int, cost: float
) -> dict[str, Any]:
    return {
        "name": name,
        "area": area,
        "category": category,
        "slot": slot,
        "reason": f"A good fit for this trip: {name.lower()}.",
        "durationMinutes": minutes,
        "costEstimate": cost,
    }


def _itinerary(context: dict[str, Any]) -> dict[str, Any]:
    per_day = _PER_PACE.get(context["trip"]["pace"], 4)
    days = []
    for entry in context["days"]:
        n, area = entry["day"], entry["destination"]
        pool = [
            ("morning", _MORNING, "sight", 90, 0.0),
            ("afternoon", _AFTERNOON, "museum", 75, 12.0),
            ("evening", _EVENING, "food", 90, 35.0),
        ]
        stops = []
        for i in range(per_day - 1):
            slot, names, category, minutes, cost = pool[i % 3]
            stops.append(
                _stop(f"{names[(n + i) % len(names)]} {n}", area, category, slot, minutes, cost)
            )
        stops.append(_stop(f"Invented Garden of Wonders {n}", area, "nature", "afternoon", 60, 0))
        days.append(
            {
                "title": f"Day {n} in {area}",
                "stops": stops,
                "rainPlan": [_stop(f"{_INDOOR[n % 3]} {n}", area, "museum", "afternoon", 90, 15)],
                "stayEstimate": 120,
                "foodEstimate": 60,
                "transportEstimate": 10,
            }
        )
    return {"days": days}


def _edit(context: dict[str, Any]) -> dict[str, Any]:
    action, area = context["action"], context["destination"]
    current = context["day"]["stops"]

    def keep(stop: dict[str, Any], **changes: Any) -> dict[str, Any]:
        kept = _stop(
            stop["name"],
            area,
            stop["category"],
            stop["slot"],
            stop["durationMinutes"],
            stop["costEstimate"],
        )
        return {**kept, "keepId": stop["id"], **changes}

    if action == "relaxed":
        locked = [s for s in current if s["locked"]]
        others = [s for s in current if not s["locked"]][: max(0, 2 - len(locked))]
        stops = [
            keep(s, durationMinutes=min(480, s["durationMinutes"] + 30)) for s in [*locked, *others]
        ]
        summary = "Fewer stops and longer visits, with time for a slow lunch."
    elif action == "cheaper":
        stops = [keep(s, costEstimate=round(s["costEstimate"] / 2, 2)) for s in current]
        summary = "Lower-cost choices: free sights first and cheaper meals."
    elif action == "local_food":
        stops = [keep(s) for s in current]
        stops.append(_stop(_FOOD[len(current) % 3], area, "food", "afternoon", 60, 18))
        summary = "Added a well-loved local food stop."
    else:
        stops = [keep(s) for s in current]
        summary = "Added indoor options for a rainy day."
    rain = (
        [_stop(name, area, "museum", "afternoon", 90, 14) for name in _INDOOR[:2]]
        if action == "rainy"
        else []
    )
    estimates = context["day"]["estimates"]
    return {
        "summary": summary,
        "day": {
            "title": context["day"]["title"] or f"A day in {area}",
            "stops": stops,
            "rainPlan": rain,
            "stayEstimate": estimates["stay"],
            "foodEstimate": estimates["food"] / (2 if action == "cheaper" else 1),
            "transportEstimate": estimates["transport"],
        },
    }


def _refill(context: dict[str, Any]) -> dict[str, Any]:
    days = []
    for entry in context["days"]:
        n, area = entry["day"], entry["destination"]
        stops = [
            _stop(f"{_FOOD[i % 3]} {n}-{i + 1}", area, "food", "afternoon", 60, 15)
            for i in range(max(1, entry["needed"]))
        ]
        days.append({"day": n, "stops": stops})
    return {"days": days}


class FakeProvider:
    name = "fake"

    async def generate_json(self, request: AiRequest) -> str:
        context = read_context(request.prompt)
        if request.task == "itinerary":
            return json.dumps(_itinerary(context))
        if request.task == "itinerary_refill":
            return json.dumps(_refill(context))
        if request.task == "day_edit":
            return json.dumps(_edit(context))
        raise ProviderError(self.name, FailureKind.REJECTED, f"unknown task {request.task}")

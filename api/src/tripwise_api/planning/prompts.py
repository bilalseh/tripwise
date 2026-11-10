"""Prompt templates. Context goes in as JSON after a fixed marker, which models read reliably
and the fake provider can parse. Bump PROMPT_VERSION when a template changes meaningfully."""

import json
from datetime import timedelta
from typing import Any

from tripwise_api.domain.pace import PACE_LIMITS
from tripwise_api.schemas.edits import EditAction
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Day
from tripwise_api.schemas.trip_request import TripRequest

PROMPT_VERSION = "v1"
CONTEXT_MARKER = "CONTEXT_JSON:"
LANGUAGE_NAMES = {Language.EN: "English", Language.AR: "Modern Standard Arabic"}

SYSTEM = """You are Tripwise, a careful local travel planner. You suggest real, well-known,
currently operating places that a search engine can find by name. Never invent places.
Each stop is exactly one place under its usual short name: never join places with "&" or
"and", and never name an activity ("café crawl", "walk along...") instead of a place.
Never give addresses, coordinates, opening hours or prices as facts: costs and durations are
rough estimates for planning. Respect the traveller's pace, budget, mobility and dietary needs.
Write titles and reasons in {language}; keep place names in their usual local or English form.
Reply with JSON that matches the schema exactly."""

GENERATE = """Plan {count} day(s) of a trip: trip days {first} to {last} (numbered from 1).
For each day give {target} stops (never more than {max_stops}), grouped by time of day
(morning, afternoon, evening), each with a one-sentence reason, a duration estimate and a cost
estimate in {currency} for the whole party. Add 1 or 2 indoor stops as rain_plan for each day.
Include each must-see place listed for these days. Do not repeat places already planned.
Keep each day in one area of town so walking stays short.

{marker}
{context}"""

EDIT_INSTRUCTIONS = {
    EditAction.RELAXED: "Make this day more relaxed: fewer stops, longer and calmer visits, a "
    "long lunch or a rest. Keep at most {relaxed} stops.",
    EditAction.RAINY: "Add a rainy-day option: fill rain_plan with 2 to 4 indoor places near "
    "the day's stops. Keep the main stops as they are.",
    EditAction.LOCAL_FOOD: "Add more local food: swap or add stops for markets, local "
    "specialities and well-loved neighbourhood restaurants, respecting dietary needs.",
    EditAction.CHEAPER: "Make this day cheaper: replace expensive stops with free or low-cost "
    "places of the same kind and lower the cost estimates where honest.",
}

EDIT = """{instruction}
Every stop marked locked must stay, unchanged, with its keep_id. For any other existing stop
you keep, set keep_id to its id. New stops have no keep_id. Explain the change in summary.

{marker}
{context}"""


def _request_context(request: TripRequest) -> dict[str, Any]:
    return {
        "destinations": [
            {"name": d.name, "country": d.country, "days": d.days} for d in request.destinations
        ],
        "startDate": request.start_date.isoformat() if request.start_date else None,
        "travelers": request.travelers.model_dump(mode="json"),
        "budgetLevel": request.budget_level.value,
        "currency": request.currency,
        "interests": [i.value for i in request.interests],
        "pace": request.pace.value,
        "mobility": request.constraints.mobility.value,
        "dietary": [d.value for d in request.constraints.dietary],
        "notes": request.constraints.notes,
    }


def system_prompt(language: Language) -> str:
    return SYSTEM.format(language=LANGUAGE_NAMES[language])


def generate_prompt(
    request: TripRequest, first_day: int, count: int, must_see: list[str], planned: list[str]
) -> str:
    limits = PACE_LIMITS[request.pace]
    days = []
    for offset in range(count):
        index = first_day + offset
        destination = request.destinations[request.destination_for_day(index)]
        date = request.start_date + timedelta(days=index) if request.start_date else None
        days.append(
            {
                "day": index + 1,
                "destination": destination.name,
                "date": date.isoformat() if date else None,
            }
        )
    context = {
        "trip": _request_context(request),
        "days": days,
        "mustSee": must_see,
        "alreadyPlanned": planned[:80],
    }
    return GENERATE.format(
        count=count,
        first=first_day + 1,
        last=first_day + count,
        target=limits.target_stops,
        max_stops=limits.max_stops,
        currency=request.currency,
        marker=CONTEXT_MARKER,
        context=json.dumps(context, ensure_ascii=False, indent=1),
    )


REFILL = """Some places you suggested could not be found on OpenStreetMap: {failed}.
Suggest replacements for the days listed below, exactly the number of stops each day needs.
Use real, currently operating places under the short name most maps use (no subtitles or
taglines). Do not repeat places already planned or the ones that were not found.

{marker}
{context}"""


def refill_prompt(
    request: TripRequest, needed: dict[int, int], failed: list[str], planned: list[str]
) -> str:
    """`needed` maps 0-based trip days to the number of replacement stops they need."""
    days = [
        {
            "day": index + 1,
            "destination": request.destinations[request.destination_for_day(index)].name,
            "needed": count,
        }
        for index, count in sorted(needed.items())
    ]
    context = {"trip": _request_context(request), "days": days, "alreadyPlanned": planned[:80]}
    return REFILL.format(
        failed=", ".join(failed[:30]),
        marker=CONTEXT_MARKER,
        context=json.dumps(context, ensure_ascii=False, indent=1),
    )


def edit_prompt(request: TripRequest, action: EditAction, day: Day) -> str:
    stops = [
        {
            "id": s.id,
            "name": s.place.name,
            "category": s.category.value,
            "slot": s.slot.value,
            "durationMinutes": s.duration_minutes,
            "costEstimate": s.cost_estimate,
            "locked": s.locked,
        }
        for s in day.stops
    ]
    destination = request.destinations[day.destination_index]
    context = {
        "trip": _request_context(request),
        "action": action.value,
        "destination": destination.name,
        "day": {"title": day.title, "stops": stops, "estimates": day.estimates.model_dump()},
    }
    instruction = EDIT_INSTRUCTIONS[action].format(
        relaxed=PACE_LIMITS[request.pace].target_stops - 1
    )
    return EDIT.format(
        instruction=instruction,
        marker=CONTEXT_MARKER,
        context=json.dumps(context, ensure_ascii=False, indent=1),
    )


def read_context(prompt: str) -> dict[str, Any]:
    """The JSON context of a prompt (used by the fake provider)."""
    _, _, tail = prompt.partition(CONTEXT_MARKER)
    loaded: dict[str, Any] = json.loads(tail)
    return loaded

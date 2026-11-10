"""AI edit actions on one day ("make it more relaxed", "cheaper"...), returned as a proposal.

Locked stops are guaranteed to survive: the AI is told, its reply is checked (one repair
retry), and any locked stop it still drops is put back. Kept stops keep their real place;
only new suggestions are geocoded.
"""

from tripwise_api.ai.client import AiClient
from tripwise_api.domain.ordering import order_stops
from tripwise_api.domain.pace import trim_day
from tripwise_api.integrations.geocoding import Geocoder
from tripwise_api.planning.ai_models import AiDayEdit, AiStop
from tripwise_api.planning.grounding import (
    GroundingLog,
    NewId,
    ground_many,
    keep_found,
    place_identity,
    present,
)
from tripwise_api.planning.prompts import edit_prompt, system_prompt
from tripwise_api.schemas.edits import AiEditProposal, EditAction
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Day, DayEstimates, GroundingReport, Stop
from tripwise_api.schemas.trip_request import Pace, TripRequest

SLOWER = {Pace.PACKED: Pace.BALANCED, Pace.BALANCED: Pace.RELAXED, Pace.RELAXED: Pace.RELAXED}


def _updated(existing: Stop, suggestion: AiStop) -> Stop:
    if existing.locked:
        return existing
    return existing.model_copy(
        update={
            "slot": suggestion.slot,
            "duration_minutes": suggestion.duration_minutes,
            "cost_estimate": suggestion.cost_estimate,
            "reason": suggestion.reason or existing.reason,
        }
    )


async def propose_edit(
    ai: AiClient,
    geocoder: Geocoder,
    request: TripRequest,
    action: EditAction,
    day_index: int,
    day: Day,
    language: Language,
    new_id: NewId,
) -> AiEditProposal:
    existing = {stop.id: stop for stop in day.stops}
    locked = [stop for stop in day.stops if stop.locked]

    def check(edit: AiDayEdit) -> list[str]:
        kept = {s.keep_id for s in edit.day.stops}
        return [
            f"locked stop {s.id} ({s.place.name}) must be kept with keep_id"
            for s in locked
            if s.id not in kept
        ]

    result = await ai.generate(
        "day_edit",
        AiDayEdit,
        system_prompt(language),
        edit_prompt(request, action, day),
        temperature=0.5,
        check=check,
    )
    proposal = result.value.day
    destination = request.destinations[day.destination_index]

    fresh = [s for s in proposal.stops if s.keep_id not in existing]
    fresh_rain = list(proposal.rain_plan) if action is EditAction.RAINY else []
    grounded = await ground_many(
        geocoder, [(s, destination) for s in (*fresh, *fresh_rain)], language.value, new_id
    )
    log = GroundingLog()
    seen = {place_identity(s) for s in day.stops} | {place_identity(s) for s in day.rain_plan}
    found = {
        id(suggestion): stop
        for suggestion, stop in zip(
            fresh, keep_found(fresh, grounded[: len(fresh)], log, seen), strict=True
        )
        if stop is not None
    }

    stops: list[Stop] = []
    for suggestion in proposal.stops:
        if suggestion.keep_id in existing:
            kept = existing[suggestion.keep_id]
            if all(kept.id != s.id for s in stops):
                stops.append(_updated(kept, suggestion))
        elif id(suggestion) in found:
            stops.append(found[id(suggestion)])
    stops.extend(s for s in locked if all(s.id != kept.id for kept in stops))

    pace = SLOWER[request.pace] if action is EditAction.RELAXED else request.pace
    ordered, trimmed = trim_day(order_stops(stops), pace)
    rain_plan = (
        [*day.rain_plan, *present(keep_found(fresh_rain, grounded[len(fresh) :], log, seen))][:6]
        if action is EditAction.RAINY
        else list(day.rain_plan)
    )
    estimates = DayEstimates(
        stay=day.estimates.stay,
        food=proposal.food_estimate,
        transport=proposal.transport_estimate,
    )
    new_day = Day(
        title=proposal.title or day.title,
        destination_index=day.destination_index,
        stops=ordered,
        rain_plan=rain_plan,
        estimates=estimates,
    )
    report = GroundingReport(
        provider=result.provider,
        suggested=log.suggested,
        kept=len(ordered),
        dropped=log.dropped,
        trimmed=[s.place.name for s in trimmed],
    )
    return AiEditProposal(
        action=action, day_index=day_index, day=new_day, summary=result.value.summary, report=report
    )

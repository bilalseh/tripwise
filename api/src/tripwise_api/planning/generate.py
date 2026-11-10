"""Generate a batch of itinerary days.

AI JSON -> Pydantic validation (one repair retry) -> geocoding of every suggestion -> drop
unresolved and duplicate places -> one replacement round for short days -> regroup by area ->
order -> trim to pace -> Days.
"""

import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from tripwise_api.ai.client import AiClient
from tripwise_api.planning.ai_models import AiDay, AiItinerary, AiStop
from tripwise_api.planning.grounding import (
    GroundingLog,
    Lookups,
    NewId,
    ground_many,
    keep_found,
    place_identity,
    present,
)
from tripwise_api.planning.layout import DraftDay, finish_day, regroup
from tripwise_api.planning.prompts import generate_prompt, system_prompt
from tripwise_api.planning.refill import refill_days
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Day, DayEstimates, GroundingReport, Stop
from tripwise_api.schemas.trip_request import TripRequest

# The replacement round only runs if the first answer came back within this time, so the
# whole request still fits Firebase Hosting's 60-second limit.
REFILL_WITHIN_SECONDS = 25.0


@dataclass(frozen=True, slots=True)
class PlannedBatch:
    days: list[Day]
    report: GroundingReport


def _matches(name: str, wanted: str) -> bool:
    a, b = name.lower(), wanted.lower()
    return a in b or b in a


def remaining_must_see(request: TripRequest, existing: Sequence[Day]) -> list[str]:
    planned = [s.place.name for d in existing for s in d.stops]
    return [m for m in request.constraints.must_see if not any(_matches(n, m) for n in planned)]


def _estimates(day: AiDay) -> DayEstimates:
    return DayEstimates(
        stay=day.stay_estimate, food=day.food_estimate, transport=day.transport_estimate
    )


async def plan_days(
    ai: AiClient,
    lookups: Lookups,
    request: TripRequest,
    first_day: int,
    count: int,
    existing: Sequence[Day],
    language: Language,
    new_id: NewId,
    locked: Sequence[Sequence[Stop]] = (),
    clock: Callable[[], float] = time.monotonic,
) -> PlannedBatch:
    """Plan days [first_day, first_day + count). `existing` are the trip's other days (their
    places are not repeated); `locked[i]` are stops the user locked on day first_day + i, which
    stay on that day."""
    started = clock()
    must_see = remaining_must_see(
        request, [*existing, *(Day(destination_index=0, stops=list(k)) for k in locked)]
    )
    planned = [s.place.name for d in existing for s in d.stops] + [
        s.place.name for k in locked for s in k
    ]

    def check(itinerary: AiItinerary) -> list[str]:
        if len(itinerary.days) != count:
            return [f"days: expected exactly {count} day(s), got {len(itinerary.days)}"]
        return []

    result = await ai.generate(
        "itinerary",
        AiItinerary,
        system_prompt(language),
        generate_prompt(request, first_day, count, must_see, planned),
        temperature=0.6,
        check=check,
    )

    # Ground every suggestion of the batch at once, then filter in a fixed order.
    destinations = [request.destination_for_day(first_day + i) for i in range(count)]
    wanted: list[tuple[AiStop, int]] = [
        (stop, offset)
        for offset, day in enumerate(result.value.days)
        for stop in (*day.stops, *day.rain_plan)
    ]
    grounded = await ground_many(
        lookups,
        [(stop, request.destinations[destinations[offset]]) for stop, offset in wanted],
        language.value,
        new_id,
    )
    by_suggestion = {id(stop): found for (stop, _), found in zip(wanted, grounded, strict=True)}

    log = GroundingLog()
    seen = {place_identity(s) for d in existing for s in d.stops}
    seen |= {place_identity(s) for k in locked for s in k}
    drafts: list[DraftDay] = []
    rain: list[list[Stop]] = []
    for offset, day in enumerate(result.value.days):
        stops = present(keep_found(day.stops, [by_suggestion[id(s)] for s in day.stops], log, seen))
        pinned = list(locked[offset]) if offset < len(locked) else []
        drafts.append(DraftDay(title=day.title, stops=[*pinned, *stops]))
        found_rain = [by_suggestion[id(s)] for s in day.rain_plan]
        rain.append(present(keep_found(day.rain_plan, found_rain, log, seen)))

    if clock() - started < REFILL_WITHIN_SECONDS:
        found_names = [s.place.name for d in drafts for s in d.stops]
        await refill_days(
            ai,
            lookups,
            request,
            first_day,
            drafts,
            log,
            seen,
            [*planned, *found_names],
            language,
            new_id,
        )

    must_see_ids = frozenset(
        stop.id
        for d in drafts
        for stop in d.stops
        if any(_matches(stop.place.name, m) for m in must_see)
    )
    days: list[Day] = []
    trimmed: list[str] = []
    start = 0
    while start < count:
        # Regroup only within a run of days at the same destination.
        end = start
        while end < count and destinations[end] == destinations[start]:
            end += 1
        groups = regroup(drafts[start:end], request.pace)
        for offset, stops in enumerate(groups, start=start):
            kept, cut = finish_day(stops, request.pace, must_see_ids)
            trimmed.extend(s.place.name for s in cut)
            ai_day = result.value.days[offset]
            days.append(
                Day(
                    title=ai_day.title,
                    destination_index=destinations[offset],
                    stops=kept,
                    rain_plan=rain[offset][:6],
                    estimates=_estimates(ai_day),
                )
            )
        start = end

    report = GroundingReport(
        provider=result.provider,
        suggested=log.suggested,
        kept=sum(len(d.stops) + len(d.rain_plan) for d in days),
        dropped=log.dropped[:60],
        trimmed=trimmed[:60],
    )
    return PlannedBatch(days=days, report=report)

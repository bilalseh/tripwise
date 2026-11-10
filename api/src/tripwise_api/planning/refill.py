"""One replacement round for days that lost too many suggestions to grounding.

If a day ends up two or more stops short of its pace, the AI is asked once for replacements,
told which names could not be found. Replacements go through the same grounding as any
suggestion. It is best effort: if the AI is unavailable or time is short, the day stays as is.
"""

import time
from collections.abc import Callable, Sequence

from tripwise_api.ai.client import AiClient
from tripwise_api.ai.types import AiUnavailableError
from tripwise_api.domain.pace import PACE_LIMITS
from tripwise_api.planning.ai_models import AiRefill, AiStop
from tripwise_api.planning.grounding import (
    GroundingLog,
    Lookups,
    NewId,
    ground_many,
    keep_found,
    present,
)
from tripwise_api.planning.layout import DraftDay
from tripwise_api.planning.prompts import refill_prompt, system_prompt
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip_request import TripRequest


def stops_needed(
    drafts: Sequence[DraftDay], request: TripRequest, first_day: int
) -> dict[int, int]:
    """0-based trip day -> replacement stops wanted, for days two or more short of the pace."""
    target = PACE_LIMITS[request.pace].target_stops
    return {
        first_day + offset: target - len(draft.stops)
        for offset, draft in enumerate(drafts)
        if len(draft.stops) <= target - 2
    }


async def refill_days(
    ai: AiClient,
    lookups: Lookups,
    request: TripRequest,
    first_day: int,
    drafts: Sequence[DraftDay],
    log: GroundingLog,
    seen: set[str],
    planned: Sequence[str],
    language: Language,
    new_id: NewId,
    deadline: float | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    """Add grounded replacements to short days, in place. No-op when nothing was dropped."""
    needed = stops_needed(drafts, request, first_day)
    if not needed or not log.dropped:
        return

    def check(refill: AiRefill) -> list[str]:
        unknown = [d.day for d in refill.days if d.day - 1 not in needed]
        return [f"days: only days {sorted(n + 1 for n in needed)} need stops"] if unknown else []

    try:
        result = await ai.generate(
            "itinerary_refill",
            AiRefill,
            system_prompt(language),
            refill_prompt(request, needed, log.dropped, list(planned)),
            temperature=0.5,
            check=check,
        )
    except AiUnavailableError:
        return

    wanted: list[tuple[AiStop, int]] = [
        (stop, day.day - 1)
        for day in result.value.days
        for stop in day.stops[: needed.get(day.day - 1, 0)]
    ]
    grounded = await ground_many(
        lookups,
        [(stop, request.destinations[request.destination_for_day(d)]) for stop, d in wanted],
        language.value,
        new_id,
        deadline=deadline,
        clock=clock,
    )
    for (stop, day), found in zip(wanted, grounded, strict=True):
        drafts[day - first_day].stops.extend(present(keep_found([stop], [found], log, seen)))

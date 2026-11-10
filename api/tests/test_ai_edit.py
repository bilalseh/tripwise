"""AI edit proposals: locked stops always survive, new places are grounded like any other."""

import json
from typing import Any

import pytest

from tests.conftest import trip_request
from tests.fakes import ScriptedProvider, counter_ids
from tests.stops import stop
from tripwise_api.ai.client import AiClient
from tripwise_api.ai.fake import FakeProvider
from tripwise_api.integrations.fake_geocoder import FakeGeocoder
from tripwise_api.planning.edit import propose_edit
from tripwise_api.schemas.edits import EditAction
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Day, Slot
from tripwise_api.schemas.trip_request import GeoPoint, Pace

pytestmark = pytest.mark.anyio

HERE = GeoPoint(lat=38.71, lng=-9.14)


def busy_day() -> Day:
    return Day(
        title="Busy day",
        destination_index=0,
        stops=[
            stop("a", HERE, Slot.MORNING),
            stop("b", HERE, Slot.MORNING, locked=True),
            stop("c", HERE, Slot.AFTERNOON),
            stop("d", HERE, Slot.AFTERNOON),
            stop("e", HERE, Slot.EVENING),
        ],
    )


async def edit(action: EditAction, ai: AiClient | None = None, pace: Pace = Pace.BALANCED) -> Any:
    return await propose_edit(
        ai or AiClient([FakeProvider()]),
        FakeGeocoder(),
        trip_request(pace=pace),
        action,
        0,
        busy_day(),
        Language.EN,
        counter_ids("n"),
    )


async def test_more_relaxed_means_fewer_stops_and_keeps_the_locked_one() -> None:
    proposal = await edit(EditAction.RELAXED)

    ids = [s.id for s in proposal.day.stops]
    assert "b" in ids
    assert len(ids) < 5
    assert proposal.summary


async def test_rainy_day_option_fills_the_rain_plan_with_grounded_places() -> None:
    proposal = await edit(EditAction.RAINY)

    assert len(proposal.day.rain_plan) == 2
    assert {s.id for s in proposal.day.stops} == {"a", "b", "c", "d", "e"}


async def test_local_food_adds_a_new_grounded_stop() -> None:
    proposal = await edit(EditAction.LOCAL_FOOD, pace=Pace.PACKED)

    new = [s for s in proposal.day.stops if s.id.startswith("n")]
    assert len(new) == 1
    assert new[0].category.value == "food"


async def test_cheaper_lowers_costs_of_unlocked_stops_only() -> None:
    proposal = await edit(EditAction.CHEAPER)

    by_id = {s.id: s for s in proposal.day.stops}
    assert by_id["a"].cost_estimate == 5
    assert by_id["b"].cost_estimate == 10  # locked: untouched


async def test_an_edit_that_keeps_dropping_a_locked_stop_fails_instead_of_losing_it() -> None:
    reply = json.dumps(
        {
            "summary": "Shorter day.",
            "day": {
                "title": "Shorter",
                "stops": [
                    {
                        "name": "Place a",
                        "area": "Lisbon",
                        "category": "sight",
                        "slot": "morning",
                        "reason": "",
                        "durationMinutes": 60,
                        "costEstimate": 1,
                        "keepId": "a",
                    }
                ],
                "rainPlan": [],
                "stayEstimate": 1,
                "foodEstimate": 1,
                "transportEstimate": 1,
            },
        }
    )
    # The same bad reply twice: the repair attempt does not help either.
    provider = ScriptedProvider("g", [reply, reply])

    with pytest.raises(Exception, match="day_edit"):
        await edit(EditAction.RELAXED, AiClient([provider]))
    assert "locked stop b" in provider.requests[1].prompt


async def test_locked_stop_is_restored_when_the_repair_drops_it_quietly() -> None:
    good = {
        "name": "Place a",
        "area": "Lisbon",
        "category": "sight",
        "slot": "morning",
        "reason": "",
        "durationMinutes": 60,
        "costEstimate": 1,
        "keepId": "a",
    }
    locked = {**good, "name": "Place b", "keepId": "b"}
    first = {
        "summary": "s",
        "day": {
            "title": "t",
            "stops": [good],
            "stayEstimate": 1,
            "foodEstimate": 1,
            "transportEstimate": 1,
        },
    }
    second = {
        "summary": "s",
        "day": {
            "title": "t",
            "stops": [good, locked],
            "stayEstimate": 1,
            "foodEstimate": 1,
            "transportEstimate": 1,
        },
    }
    provider = ScriptedProvider("g", [json.dumps(first), json.dumps(second)])

    proposal = await edit(EditAction.RELAXED, AiClient([provider]))

    assert {s.id for s in proposal.day.stops} == {"a", "b"}

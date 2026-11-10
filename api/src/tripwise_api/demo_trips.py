"""The two sample trips behind "Try the demo": a Lisbon city break and a Copenhagen family week.

The days live in seed/demo_trips.json and are validated by the same models as user data on
load. Every place is real and its coordinates are its real position; addresses are given at
the level of detail we are sure of. Costs and durations are estimates, like the AI's.
"""

import json
from functools import cache
from importlib.resources import files

from tripwise_api.schemas.trip import Day


@cache
def _load() -> dict[str, list[Day]]:
    raw = json.loads(files("tripwise_api.seed").joinpath("demo_trips.json").read_text("utf-8"))
    return {name: [Day.model_validate(day) for day in days] for name, days in raw.items()}


def lisbon_days() -> list[Day]:
    return list(_load()["lisbon"])


def copenhagen_days() -> list[Day]:
    return list(_load()["copenhagen"])

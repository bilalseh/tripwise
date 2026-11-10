"""Small builders for stops and days used across tests."""

from tripwise_api.schemas.trip import Place, PlaceSource, Slot, Stop, StopCategory
from tripwise_api.schemas.trip_request import GeoPoint


def stop(
    key: str,
    where: GeoPoint,
    slot: Slot = Slot.MORNING,
    minutes: int = 60,
    locked: bool = False,
    name: str | None = None,
) -> Stop:
    return Stop(
        id=key,
        place=Place(
            name=name or f"Place {key}",
            address="Somewhere",
            location=where,
            source=PlaceSource.FAKE,
        ),
        category=StopCategory.SIGHT,
        slot=slot,
        duration_minutes=minutes,
        cost_estimate=10,
        locked=locked,
    )

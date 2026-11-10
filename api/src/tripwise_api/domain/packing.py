"""Packing list rules: destination climate, season, trip length, activities and travellers.

Rules are plain data, so adding one is a one-line change and each is covered by a test.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date

from tripwise_api.domain.season import Climate, Season, climate_at, season_at
from tripwise_api.schemas.essentials import PackingCategory, PackingItem
from tripwise_api.schemas.trip import StopCategory
from tripwise_api.schemas.trip_request import Interest, TripRequest


@dataclass(frozen=True, slots=True)
class PackingContext:
    days: int
    season: Season | None  # None when the trip has no dates yet
    climate: Climate
    adults: int
    children: int
    interests: frozenset[Interest]
    categories: frozenset[StopCategory]
    international: bool

    @property
    def warm(self) -> bool:
        return self.climate is Climate.TROPICAL or self.season is Season.SUMMER

    @property
    def cold(self) -> bool:
        return self.climate is Climate.COLD or self.season is Season.WINTER


@dataclass(frozen=True, slots=True)
class Rule:
    key: str
    category: PackingCategory
    applies: Callable[[PackingContext], bool]
    quantity: Callable[[PackingContext], int] = lambda _: 1


def _per_day(ctx: PackingContext, cap: int = 7) -> int:
    return min(ctx.days, cap)


def always(_: PackingContext) -> bool:
    return True


RULES: tuple[Rule, ...] = (
    Rule("passport", PackingCategory.DOCUMENTS, lambda c: c.international),
    Rule("id_card", PackingCategory.DOCUMENTS, always),
    Rule("payment_cards", PackingCategory.DOCUMENTS, always),
    Rule("insurance_copy", PackingCategory.DOCUMENTS, lambda c: c.international),
    Rule("underwear", PackingCategory.CLOTHING, always, _per_day),
    Rule("socks", PackingCategory.CLOTHING, always, _per_day),
    Rule("tops", PackingCategory.CLOTHING, always, lambda c: max(2, _per_day(c, 5))),
    Rule("trousers", PackingCategory.CLOTHING, always, lambda c: 2 if c.days > 3 else 1),
    Rule("walking_shoes", PackingCategory.CLOTHING, always),
    Rule("sleepwear", PackingCategory.CLOTHING, always),
    Rule("light_jacket", PackingCategory.CLOTHING, lambda c: not c.cold),
    Rule("warm_coat", PackingCategory.CLOTHING, lambda c: c.cold),
    Rule("hat_gloves", PackingCategory.CLOTHING, lambda c: c.cold),
    Rule("thermal_layers", PackingCategory.CLOTHING, lambda c: c.climate is Climate.COLD),
    Rule("shorts", PackingCategory.CLOTHING, lambda c: c.warm),
    Rule(
        "swimwear", PackingCategory.CLOTHING, lambda c: c.warm or Interest.RELAXATION in c.interests
    ),
    Rule("sun_hat", PackingCategory.CLOTHING, lambda c: c.warm),
    Rule(
        "rain_jacket",
        PackingCategory.CLOTHING,
        lambda c: c.season in (Season.SPRING, Season.AUTUMN) or c.climate is Climate.TROPICAL,
    ),
    Rule(
        "smart_outfit",
        PackingCategory.CLOTHING,
        lambda c: Interest.NIGHTLIFE in c.interests or StopCategory.NIGHTLIFE in c.categories,
    ),
    Rule("toothbrush", PackingCategory.TOILETRIES, always),
    Rule("toiletries", PackingCategory.TOILETRIES, always),
    Rule(
        "sunscreen", PackingCategory.TOILETRIES, lambda c: c.warm or Interest.NATURE in c.interests
    ),
    Rule(
        "insect_repellent",
        PackingCategory.HEALTH,
        lambda c: c.climate is Climate.TROPICAL or (c.warm and Interest.NATURE in c.interests),
    ),
    Rule("medication", PackingCategory.HEALTH, always),
    Rule(
        "first_aid",
        PackingCategory.HEALTH,
        lambda c: c.children > 0 or Interest.ADVENTURE in c.interests or c.days > 7,
    ),
    Rule("phone_charger", PackingCategory.ELECTRONICS, always),
    Rule("power_adapter", PackingCategory.ELECTRONICS, lambda c: c.international),
    Rule("power_bank", PackingCategory.ELECTRONICS, lambda c: c.days > 1),
    Rule("daypack", PackingCategory.GEAR, always),
    Rule("water_bottle", PackingCategory.GEAR, always),
    Rule(
        "hiking_boots",
        PackingCategory.GEAR,
        lambda c: (
            Interest.ADVENTURE in c.interests
            or (StopCategory.NATURE in c.categories and Interest.NATURE in c.interests)
        ),
    ),
    Rule("sunglasses", PackingCategory.GEAR, lambda c: c.warm or c.climate is Climate.COLD),
    Rule("reusable_bag", PackingCategory.GEAR, lambda c: Interest.SHOPPING in c.interests),
    Rule("snacks_kids", PackingCategory.KIDS, lambda c: c.children > 0),
    Rule("kids_entertainment", PackingCategory.KIDS, lambda c: c.children > 0),
    Rule(
        "kids_spare_clothes", PackingCategory.KIDS, lambda c: c.children > 0, lambda c: c.children
    ),
    Rule("wet_wipes", PackingCategory.KIDS, lambda c: c.children > 0),
    Rule("laundry_bag", PackingCategory.OTHER, lambda c: c.days > 4),
)


def packing_context(
    request: TripRequest, categories: Sequence[StopCategory], home_country: str | None
) -> PackingContext:
    first = request.destinations[0]
    lat = first.location.lat
    countries = {d.country_code for d in request.destinations if d.country_code}
    # Without a home country the trip is treated as international: packing a passport you do
    # not need is better than leaving one at home.
    international = home_country is None or bool(countries - {home_country})
    start: date | None = request.start_date
    return PackingContext(
        days=request.total_days,
        season=season_at(lat, start) if start else None,
        climate=climate_at(lat),
        adults=request.travelers.adults,
        children=request.travelers.children,
        interests=frozenset(request.interests),
        categories=frozenset(categories),
        international=international,
    )


def build_packing_list(ctx: PackingContext) -> list[PackingItem]:
    """Items keyed by rule; labels are translated on the client from the key. Quantity is per
    traveller for clothing (the list is per person, except the kids section)."""
    return [
        PackingItem(
            id=rule.key, label=rule.key, category=rule.category, quantity=rule.quantity(ctx)
        )
        for rule in RULES
        if rule.applies(ctx)
    ]

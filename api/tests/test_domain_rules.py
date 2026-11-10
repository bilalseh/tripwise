"""Packing rules, the documents checklist, seasons and plan limits."""

from datetime import UTC, date, datetime

import pytest

from tests.conftest import LISBON, trip_request
from tripwise_api.domain.documents import (
    SCHENGEN_LINK,
    default_checklist,
    official_links,
    passport_valid_until,
)
from tripwise_api.domain.packing import PackingContext, build_packing_list, packing_context
from tripwise_api.domain.season import Climate, Season, climate_at, season_at
from tripwise_api.domain.usage import (
    UsageLimitError,
    UsageScope,
    can_add_trip,
    check_allowance,
    next_reset,
    trip_allowance,
)
from tripwise_api.schemas.trip_request import (
    Destination,
    GeoPoint,
    Interest,
    Mobility,
    Party,
    Travelers,
)


def keys(ctx: PackingContext) -> dict[str, int]:
    return {item.id: item.quantity for item in build_packing_list(ctx)}


def test_seasons_flip_south_of_the_equator() -> None:
    assert season_at(38.7, date(2026, 7, 1)) is Season.SUMMER
    assert season_at(-33.9, date(2026, 7, 1)) is Season.WINTER
    assert climate_at(1.35) is Climate.TROPICAL
    assert climate_at(69.6) is Climate.COLD


def test_a_summer_city_break_packs_light() -> None:
    ctx = packing_context(trip_request(start_date=date(2026, 7, 10)), [], home_country=None)
    items = keys(ctx)

    assert {"sunscreen", "shorts", "sun_hat", "passport"} <= items.keys()
    assert "warm_coat" not in items
    assert items["underwear"] == 3


def test_winter_family_trip_adds_warm_layers_and_kids_items() -> None:
    request = trip_request(
        start_date=date(2026, 12, 20),
        travelers=Travelers(party=Party.FAMILY, adults=2, children=2),
    )
    items = keys(packing_context(request, [], home_country=None))

    assert {"warm_coat", "hat_gloves", "snacks_kids", "first_aid"} <= items.keys()
    assert items["kids_spare_clothes"] == 2
    assert "shorts" not in items


def test_domestic_trips_skip_the_passport_and_adapter() -> None:
    items = keys(packing_context(trip_request(), [], home_country="pt"))

    assert "passport" not in items
    assert "power_adapter" not in items
    assert "id_card" in items


def test_long_trips_cap_daily_clothing() -> None:
    lisbon = LISBON.model_copy(update={"days": 12})
    items = keys(packing_context(trip_request(destinations=[lisbon]), [], home_country=None))

    assert items["underwear"] == 7
    assert "laundry_bag" in items


def test_interests_add_their_gear() -> None:
    request = trip_request(interests=[Interest.ADVENTURE, Interest.NIGHTLIFE, Interest.SHOPPING])
    items = keys(packing_context(request, [], home_country=None))

    assert {"hiking_boots", "smart_outfit", "reusable_bag"} <= items.keys()


def test_passport_must_outlast_the_trip_by_six_months() -> None:
    request = trip_request(start_date=date(2026, 8, 29))  # 3 days: back on 31 August

    assert passport_valid_until(request) == date(2027, 2, 28)
    assert passport_valid_until(trip_request(start_date=None)) is None


def test_checklist_adapts_to_children_and_mobility() -> None:
    request = trip_request(
        travelers=Travelers(party=Party.FAMILY, adults=1, children=1),
        constraints=trip_request().constraints.model_copy(update={"mobility": Mobility.WHEELCHAIR}),
    )
    items = {item.id: item for item in default_checklist(request)}

    assert {"passport", "visa", "insurance", "children", "accessibility"} <= items.keys()
    assert items["tickets"].due_date == date(2026, 11, 13)


def test_entry_rules_are_links_to_official_sources_only() -> None:
    links = official_links(trip_request())
    tokyo = Destination(
        name="Tokyo",
        display_name="Tokyo",
        country_code="jp",
        location=GeoPoint(lat=35.7, lng=139.7),
        days=3,
    )

    assert links[0] == SCHENGEN_LINK
    assert all(link.url.startswith("https://") for link in links)
    assert SCHENGEN_LINK not in official_links(trip_request(destinations=[tokyo]))


def test_daily_ai_limits_check_the_global_budget_first() -> None:
    with pytest.raises(UsageLimitError) as error:
        check_allowance(used_by_user=0, used_globally=500, user_limit=20, global_limit=500)
    assert error.value.scope is UsageScope.GLOBAL
    with pytest.raises(UsageLimitError):
        check_allowance(used_by_user=20, used_globally=20, user_limit=20, global_limit=500)
    check_allowance(used_by_user=19, used_globally=19, user_limit=20, global_limit=500)


def test_trip_allowances() -> None:
    assert trip_allowance(is_pro=False, is_demo=False) == 3
    assert trip_allowance(is_pro=False, is_demo=True) == 5
    assert trip_allowance(is_pro=True, is_demo=False) is None
    assert can_add_trip(2, 3)
    assert not can_add_trip(3, 3)
    assert can_add_trip(99, None)


def test_limits_reset_at_utc_midnight() -> None:
    assert next_reset(datetime(2026, 11, 10, 23, 59, tzinfo=UTC)) == datetime(
        2026, 11, 11, tzinfo=UTC
    )

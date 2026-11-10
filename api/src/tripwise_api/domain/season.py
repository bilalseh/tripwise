"""Season and climate band of a trip, from its dates and the destination's latitude."""

from datetime import date
from enum import StrEnum


class Season(StrEnum):
    WINTER = "winter"
    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"


class Climate(StrEnum):
    TROPICAL = "tropical"  # within the tropics: warm all year, rainy seasons
    TEMPERATE = "temperate"
    COLD = "cold"  # polar circles and beyond


TROPIC_LAT = 23.44
POLAR_LAT = 66.56

_NORTHERN = {
    12: Season.WINTER,
    1: Season.WINTER,
    2: Season.WINTER,
    3: Season.SPRING,
    4: Season.SPRING,
    5: Season.SPRING,
    6: Season.SUMMER,
    7: Season.SUMMER,
    8: Season.SUMMER,
    9: Season.AUTUMN,
    10: Season.AUTUMN,
    11: Season.AUTUMN,
}
_FLIP = {
    Season.WINTER: Season.SUMMER,
    Season.SUMMER: Season.WINTER,
    Season.SPRING: Season.AUTUMN,
    Season.AUTUMN: Season.SPRING,
}


def climate_at(lat: float) -> Climate:
    if abs(lat) < TROPIC_LAT:
        return Climate.TROPICAL
    return Climate.COLD if abs(lat) >= POLAR_LAT else Climate.TEMPERATE


def season_at(lat: float, when: date) -> Season:
    """Meteorological season; flipped south of the equator."""
    season = _NORTHERN[when.month]
    return _FLIP[season] if lat < 0 else season

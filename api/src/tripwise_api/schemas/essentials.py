"""Packing list, documents checklist and weather for a trip."""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import Field, StringConstraints

from tripwise_api.schemas.base import ApiModel, Identifier, ShortText

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class PackingCategory(StrEnum):
    DOCUMENTS = "documents"
    CLOTHING = "clothing"
    TOILETRIES = "toiletries"
    HEALTH = "health"
    ELECTRONICS = "electronics"
    KIDS = "kids"
    GEAR = "gear"
    OTHER = "other"


class PackingItem(ApiModel):
    id: Identifier
    label: ShortText
    category: PackingCategory
    quantity: int = Field(default=1, ge=1, le=99)
    checked: bool = False


class PackingList(ApiModel):
    items: list[PackingItem] = Field(default_factory=list, max_length=200)


class PackingTemplate(ApiModel):
    id: Identifier
    name: ShortText
    items: list[PackingItem] = Field(max_length=200)
    created_at: datetime


class SaveTemplateRequest(ApiModel):
    name: ShortText


class DocumentKind(StrEnum):
    PASSPORT = "passport"
    VISA = "visa"
    INSURANCE = "insurance"
    TICKETS = "tickets"
    BOOKINGS = "bookings"
    DRIVING = "driving"
    HEALTH = "health"
    CHILDREN = "children"
    CUSTOM = "custom"


class DocumentItem(ApiModel):
    id: Identifier
    kind: DocumentKind
    label: ShortText
    done: bool = False
    due_date: date | None = None
    note: Note = ""


class DocumentChecklist(ApiModel):
    items: list[DocumentItem] = Field(default_factory=list, max_length=60)


class OfficialLink(ApiModel):
    label: str
    url: str


class DocumentsResponse(ApiModel):
    checklist: DocumentChecklist
    official_links: list[OfficialLink]
    passport_valid_until: date | None = Field(
        description="The passport should be valid at least until this date (common rule)"
    )


class WeatherKind(StrEnum):
    FORECAST = "forecast"  # Open-Meteo forecast for the trip's dates
    TYPICAL = "typical"  # the same dates last year, as a hint of typical weather
    UNAVAILABLE = "unavailable"


class WeatherDay(ApiModel):
    date: date
    temp_max: float | None
    temp_min: float | None
    precipitation: float | None = Field(description="Probability (%) or amount (mm), see kind")
    code: int | None


class DestinationWeather(ApiModel):
    destination_index: int
    days: list[WeatherDay]


class WeatherReport(ApiModel):
    kind: WeatherKind
    destinations: list[DestinationWeather]
    attribution: str = "Weather data by Open-Meteo.com"

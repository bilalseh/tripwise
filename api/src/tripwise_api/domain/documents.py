"""The documents checklist and the official sources for entry rules.

Tripwise never states visa or entry requirements: it lists what to check and links to the
governments that publish the rules.
"""

from datetime import date, timedelta

from tripwise_api.schemas.essentials import DocumentItem, DocumentKind, OfficialLink
from tripwise_api.schemas.trip_request import Mobility, TripRequest

# Many countries require a passport valid for 3 to 6 months after departure; 6 is the safe bet.
PASSPORT_MONTHS_AFTER = 6

# Schengen area members (ISO 3166-1 alpha-2, lower case), for the EU's own travel portal.
SCHENGEN = frozenset(
    [
        "at",
        "be",
        "bg",
        "ch",
        "cz",
        "de",
        "dk",
        "ee",
        "es",
        "fi",
        "fr",
        "gr",
        "hr",
        "hu",
        "is",
        "it",
        "li",
        "lt",
        "lu",
        "lv",
        "mt",
        "nl",
        "no",
        "pl",
        "pt",
        "ro",
        "se",
        "si",
        "sk",
    ]
)

GENERAL_LINKS = (
    OfficialLink(
        label="travel_state_gov",
        url="https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages.html",
    ),
    OfficialLink(label="gov_uk", url="https://www.gov.uk/foreign-travel-advice"),
    OfficialLink(label="travel_gc_ca", url="https://travel.gc.ca/travelling/advisories"),
    OfficialLink(label="smartraveller", url="https://www.smartraveller.gov.au/destinations"),
)
SCHENGEN_LINK = OfficialLink(label="eu_travel", url="https://travel-europe.europa.eu/")


def _add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    # Clamp to the last valid day (for example 31 August + 6 months is 28 February).
    for candidate in range(day.day, 27, -1):
        try:
            return date(year, month, candidate)
        except ValueError:
            continue
    return date(year, month, min(day.day, 28))


def passport_valid_until(request: TripRequest) -> date | None:
    if request.start_date is None:
        return None
    return_day = request.start_date + timedelta(days=request.total_days - 1)
    return _add_months(return_day, PASSPORT_MONTHS_AFTER)


def default_checklist(request: TripRequest) -> list[DocumentItem]:
    """Starting items; labels are keys translated on the client. Due dates help with planning:
    insurance and bookings a few weeks out, tickets a week before."""
    start = request.start_date

    def before(days: int) -> date | None:
        return start - timedelta(days=days) if start else None

    items = [
        DocumentItem(
            id="passport", kind=DocumentKind.PASSPORT, label="passport", due_date=before(60)
        ),
        DocumentItem(id="visa", kind=DocumentKind.VISA, label="visa", due_date=before(45)),
        DocumentItem(
            id="insurance", kind=DocumentKind.INSURANCE, label="insurance", due_date=before(21)
        ),
        DocumentItem(id="tickets", kind=DocumentKind.TICKETS, label="tickets", due_date=before(7)),
        DocumentItem(
            id="bookings", kind=DocumentKind.BOOKINGS, label="bookings", due_date=before(14)
        ),
    ]
    if request.travelers.children:
        items.append(
            DocumentItem(
                id="children", kind=DocumentKind.CHILDREN, label="children", due_date=before(30)
            )
        )
    if request.constraints.mobility is not Mobility.NONE:
        items.append(
            DocumentItem(
                id="accessibility",
                kind=DocumentKind.HEALTH,
                label="accessibility",
                due_date=before(14),
            )
        )
    items.append(
        DocumentItem(id="health", kind=DocumentKind.HEALTH, label="health", due_date=before(30))
    )
    return items


def official_links(request: TripRequest) -> list[OfficialLink]:
    links = list(GENERAL_LINKS)
    if any(d.country_code in SCHENGEN for d in request.destinations):
        links.insert(0, SCHENGEN_LINK)
    return links

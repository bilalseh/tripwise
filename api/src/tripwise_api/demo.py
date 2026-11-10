"""Seed for "Try the demo": a profile and two sample trips with their essentials.

Dates are relative to the moment the demo starts: the Lisbon break begins in 10 days (inside
the weather forecast window), the Copenhagen family week in about two months.
"""

from datetime import datetime, timedelta

from tripwise_api.auth import AuthenticatedUser
from tripwise_api.demo_trips import copenhagen_days, lisbon_days
from tripwise_api.domain.documents import default_checklist
from tripwise_api.domain.packing import build_packing_list, packing_context
from tripwise_api.repository import SeedTrip
from tripwise_api.schemas.essentials import DocumentChecklist, PackingList, PackingTemplate
from tripwise_api.schemas.profile import Profile
from tripwise_api.schemas.trip import Day, Trip, TripStatus
from tripwise_api.schemas.trip_request import (
    BudgetLevel,
    Constraints,
    Destination,
    Dietary,
    GeoPoint,
    Interest,
    Pace,
    Party,
    Travelers,
    TripRequest,
)

LISBON = Destination(
    name="Lisbon",
    display_name="Lisbon, Portugal",
    country="Portugal",
    country_code="pt",
    location=GeoPoint(lat=38.7223, lng=-9.1393),
    days=3,
)
COPENHAGEN = Destination(
    name="Copenhagen",
    display_name="Copenhagen, Denmark",
    country="Denmark",
    country_code="dk",
    location=GeoPoint(lat=55.6761, lng=12.5683),
    days=6,
)


def new_profile(user: AuthenticatedUser, now: datetime) -> Profile:
    """The profile created on first sign-in. Anonymous users only come from the demo button."""
    return Profile(
        uid=user.uid,
        display_name=user.name,
        email=user.email,
        is_demo=user.is_anonymous,
        created_at=now,
    )


def _seed(
    trip_id: str,
    title: str,
    request: TripRequest,
    days: list[Day],
    now: datetime,
    checked: int,
    done: int,
) -> SeedTrip:
    trip = Trip(
        id=trip_id,
        title=title,
        request=request,
        status=TripStatus.READY,
        days=days,
        version=1,
        created_at=now,
        updated_at=now,
    )
    categories = [s.category for d in days for s in d.stops]
    items = build_packing_list(packing_context(request, categories, home_country=None))
    packing = PackingList(
        items=[i.model_copy(update={"checked": n < checked}) for n, i in enumerate(items)]
    )
    checklist = default_checklist(request)
    documents = DocumentChecklist(
        items=[i.model_copy(update={"done": n < done}) for n, i in enumerate(checklist)]
    )
    return SeedTrip(trip=trip, packing=packing, documents=documents)


def demo_trips(now: datetime) -> list[SeedTrip]:
    today = now.date()
    lisbon = TripRequest(
        destinations=[LISBON],
        start_date=today + timedelta(days=10),
        travelers=Travelers(party=Party.COUPLE, adults=2),
        budget_level=BudgetLevel.MODERATE,
        budget_amount=1100,
        currency="EUR",
        interests=[Interest.FOOD, Interest.HISTORY, Interest.ART],
        pace=Pace.BALANCED,
        constraints=Constraints(must_see=["Jerónimos Monastery"]),
    )
    copenhagen = TripRequest(
        destinations=[COPENHAGEN],
        start_date=today + timedelta(days=56),
        travelers=Travelers(party=Party.FAMILY, adults=2, children=2),
        budget_level=BudgetLevel.MODERATE,
        budget_amount=3200,
        currency="EUR",
        interests=[Interest.NATURE, Interest.HISTORY, Interest.RELAXATION],
        pace=Pace.RELAXED,
        constraints=Constraints(
            dietary=[Dietary.VEGETARIAN], must_see=["Tivoli Gardens"], notes="Kids are 5 and 8."
        ),
    )
    city = _seed("demo-lisbon", "Lisbon city break", lisbon, lisbon_days(), now, checked=6, done=2)
    family = _seed(
        "demo-copenhagen",
        "Copenhagen family week",
        copenhagen,
        copenhagen_days(),
        now - timedelta(minutes=5),
        checked=0,
        done=1,
    )
    template = PackingTemplate(
        id="demo-weekend",
        name="Weekend city break",
        items=[
            i.model_copy(update={"checked": False})
            for i in (city.packing.items if city.packing else [])
        ],
        created_at=now,
    )
    return [
        SeedTrip(
            trip=city.trip, packing=city.packing, documents=city.documents, templates=[template]
        ),
        family,
    ]

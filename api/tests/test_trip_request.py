"""The wizard's answers are validated at the boundary."""

import pytest
from pydantic import ValidationError

from tests.conftest import LISBON, trip_request
from tripwise_api.schemas.trip_request import Interest, Party, Travelers, TripRequest


def test_travelers_must_match_the_party() -> None:
    with pytest.raises(ValidationError, match="solo"):
        Travelers(party=Party.SOLO, adults=2)
    with pytest.raises(ValidationError, match="family"):
        Travelers(party=Party.FAMILY, adults=2, children=0)
    assert Travelers(party=Party.FRIENDS, adults=5).count == 5


def test_trips_are_at_most_fourteen_days() -> None:
    long = LISBON.model_copy(update={"days": 10})
    with pytest.raises(ValidationError, match="at most 14"):
        TripRequest.model_validate(
            {
                **trip_request().model_dump(mode="json"),
                "destinations": [long.model_dump(mode="json")] * 2,
            }
        )


def test_interests_must_be_unique_and_present() -> None:
    data = trip_request().model_dump(mode="json")
    with pytest.raises(ValidationError):
        TripRequest.model_validate({**data, "interests": []})
    with pytest.raises(ValidationError, match="unique"):
        TripRequest.model_validate({**data, "interests": ["food", "food"]})


def test_currency_must_be_an_iso_code() -> None:
    data = trip_request().model_dump(mode="json")
    with pytest.raises(ValidationError):
        TripRequest.model_validate({**data, "currency": "euro"})


def test_unknown_fields_are_rejected() -> None:
    data = trip_request().model_dump(mode="json")
    with pytest.raises(ValidationError, match="Extra inputs"):
        TripRequest.model_validate({**data, "isAdmin": True})


def test_days_map_to_destinations() -> None:
    porto = LISBON.model_copy(update={"name": "Porto", "days": 2})
    request = trip_request(destinations=[LISBON, porto], interests=[Interest.ART])

    assert [request.destination_for_day(d) for d in range(5)] == [0, 0, 0, 1, 1]
    with pytest.raises(ValueError, match="outside"):
        request.destination_for_day(5)

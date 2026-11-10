"""Plan limits: AI requests per day and trips per account.

A "day" is a UTC calendar day, so AI limits reset at midnight UTC for everyone.
"""

from datetime import datetime, timedelta
from enum import StrEnum


class UsageScope(StrEnum):
    USER = "user"  # this user's daily allowance
    GLOBAL = "global"  # the whole app's daily budget, which protects the shared free AI quota


class UsageLimitError(Exception):
    def __init__(self, scope: UsageScope) -> None:
        super().__init__(f"daily AI limit reached ({scope.value})")
        self.scope = scope


def usage_day(now: datetime) -> str:
    return now.date().isoformat()


def next_reset(now: datetime) -> datetime:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight + timedelta(days=1)


def check_allowance(
    used_by_user: int, used_globally: int, user_limit: int, global_limit: int
) -> None:
    """Raise if one more AI request would go over either limit."""
    if used_globally >= global_limit:
        raise UsageLimitError(UsageScope.GLOBAL)
    if used_by_user >= user_limit:
        raise UsageLimitError(UsageScope.USER)


FREE_TRIPS = 3
# Demo accounts start with two sample trips, so they get room to plan a few of their own.
DEMO_TRIPS = 5


def trip_allowance(is_pro: bool, is_demo: bool) -> int | None:
    """How many trips the account may keep; None means unlimited."""
    if is_pro:
        return None
    return DEMO_TRIPS if is_demo else FREE_TRIPS


def can_add_trip(trips: int, allowance: int | None) -> bool:
    return allowance is None or trips < allowance

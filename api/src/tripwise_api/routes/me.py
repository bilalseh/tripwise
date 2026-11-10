import logging

from fastapi import APIRouter, Response, status

from tripwise_api.auth import CurrentUser
from tripwise_api.billing.stripe import BillingError
from tripwise_api.demo import demo_trips, new_profile
from tripwise_api.dependencies import BillingDep, ClockDep, RepositoryDep, SettingsDep, rate_limited
from tripwise_api.domain.usage import next_reset, trip_allowance, usage_day
from tripwise_api.routes.common import daily_ai_limit, require_profile, tier_of
from tripwise_api.schemas.profile import Preferences, Profile, Tier, Usage

router = APIRouter(tags=["profile"], dependencies=[rate_limited])
logger = logging.getLogger(__name__)


@router.post("/me")
async def ensure_my_profile(
    user: CurrentUser, repository: RepositoryDep, clock: ClockDep
) -> Profile:
    """Return the signed-in user's profile, creating it on first sign-in. Safe to repeat.

    Anonymous users are demo users: their profile and the two sample trips are written in one
    atomic batch, so a demo account is never half-seeded.
    """
    now = clock()
    seed = demo_trips(now) if user.is_anonymous else []
    return await repository.ensure_profile(new_profile(user, now), seed)


@router.get("/me/usage")
async def get_usage(
    user: CurrentUser, repository: RepositoryDep, clock: ClockDep, settings: SettingsDep
) -> Usage:
    """AI requests used today and the trips allowed on the user's plan. The AI allowance
    resets at midnight UTC for everyone."""
    now = clock()
    profile = await repository.get_profile(user.uid)
    tier = tier_of(profile)
    return Usage(
        ai_used=await repository.ai_requests_on(user.uid, usage_day(now)),
        ai_limit=daily_ai_limit(tier, settings),
        resets_at=next_reset(now),
        tier=tier,
        trips=len(await repository.list_trips(user.uid)),
        trip_limit=trip_allowance(is_pro=tier is Tier.PRO, is_demo=user.is_anonymous),
    )


@router.put("/me/preferences")
async def save_preferences(
    preferences: Preferences, user: CurrentUser, repository: RepositoryDep
) -> Profile:
    profile = await require_profile(repository, user.uid)
    await repository.save_preferences(user.uid, preferences)
    return profile.model_copy(update={"preferences": preferences})


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_data(
    user: CurrentUser, repository: RepositoryDep, billing: BillingDep
) -> Response:
    """Cancel any test-mode subscription and erase all of the user's data. The browser then
    deletes the sign-in account itself."""
    record = await repository.get_billing(user.uid)
    if record and billing:
        try:
            await billing.cancel_subscription(record.subscription_id)
        except BillingError:
            logger.warning("Could not cancel the subscription of a deleted account")
    await repository.delete_user_data(user.uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

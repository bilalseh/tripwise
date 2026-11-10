"""Pro plan billing through Stripe in TEST MODE: checkout, confirmation, cancellation, webhook.

Checkout is confirmed two ways, so neither is a single point of failure: the browser comes back
with the session ID (checked with Stripe, never trusted as is), and Stripe's signed webhook.
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status

from tripwise_api.auth import CurrentUser
from tripwise_api.billing import signature
from tripwise_api.billing.stripe import (
    PRO_PRICE_CENTS,
    Billing,
    BillingError,
    completed_from_session,
)
from tripwise_api.dependencies import BillingDep, ClockDep, RepositoryDep, SettingsDep
from tripwise_api.repository import BillingRecord, Repository
from tripwise_api.routes.common import conflict, tier_of
from tripwise_api.schemas.account import BillingStatus, CheckoutSession, ConfirmCheckoutRequest
from tripwise_api.schemas.profile import Profile, Tier

router = APIRouter(tags=["billing"], prefix="/billing")
logger = logging.getLogger(__name__)

BILLING_UNAVAILABLE = HTTPException(
    status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={"code": "billing_unavailable", "message": "Test-mode checkout is not set up."},
)
BILLING_FAILED = HTTPException(
    status.HTTP_502_BAD_GATEWAY,
    detail={"code": "billing_failed", "message": "Stripe could not be reached. Try again."},
)


def _require(billing: Billing | None) -> Billing:
    if billing is None:
        raise BILLING_UNAVAILABLE
    return billing


async def _profile(repository: Repository, uid: str) -> Profile:
    profile = await repository.get_profile(uid)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.get("")
async def get_billing_status(
    user: CurrentUser, repository: RepositoryDep, billing: BillingDep
) -> BillingStatus:
    tier = tier_of(await repository.get_profile(user.uid))
    return BillingStatus(available=billing is not None, tier=tier, price_cents=PRO_PRICE_CENTS)


@router.post("/checkout")
async def start_checkout(
    user: CurrentUser, repository: RepositoryDep, billing: BillingDep, settings: SettingsDep
) -> CheckoutSession:
    """Open a Stripe-hosted test-mode checkout for Pro."""
    stripe = _require(billing)
    profile = await _profile(repository, user.uid)
    if profile.tier is Tier.PRO:
        raise conflict("already_pro", "You are already on Pro")
    try:
        url = await stripe.create_checkout(
            user.uid,
            user.email,
            success_url=f"{settings.app_url}/settings?checkout={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.app_url}/pricing?checkout=cancelled",
        )
    except BillingError as error:
        raise BILLING_FAILED from error
    return CheckoutSession(url=url)


@router.post("/confirm")
async def confirm_checkout(
    request: ConfirmCheckoutRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    billing: BillingDep,
) -> Profile:
    """Upgrade to Pro once Stripe confirms this user's checkout was paid. Safe to repeat."""
    stripe = _require(billing)
    profile = await _profile(repository, user.uid)
    try:
        completed = await stripe.completed_checkout(request.session_id)
    except BillingError as error:
        raise BILLING_FAILED from error
    if completed is None or completed.uid != user.uid:
        raise conflict("checkout_incomplete", "This checkout is not complete")
    record = BillingRecord(
        customer_id=completed.customer_id, subscription_id=completed.subscription_id
    )
    await repository.set_tier(user.uid, Tier.PRO, record)
    return profile.model_copy(update={"tier": Tier.PRO})


@router.post("/cancel")
async def cancel_pro(user: CurrentUser, repository: RepositoryDep, billing: BillingDep) -> Profile:
    """End the test-mode subscription now and return to the Free plan."""
    stripe = _require(billing)
    profile = await _profile(repository, user.uid)
    record = await repository.get_billing(user.uid)
    if profile.tier is not Tier.PRO or record is None:
        raise conflict("not_pro", "You are not on Pro")
    try:
        await stripe.cancel_subscription(record.subscription_id)
    except BillingError as error:
        raise BILLING_FAILED from error
    await repository.set_tier(user.uid, Tier.FREE, None)
    return profile.model_copy(update={"tier": Tier.FREE})


async def _apply_event(repository: Repository, event: dict[str, Any]) -> None:
    kind = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    if kind == "checkout.session.completed":
        completed = completed_from_session(obj)
        if completed and await repository.get_profile(completed.uid):
            record = BillingRecord(
                customer_id=completed.customer_id, subscription_id=completed.subscription_id
            )
            await repository.set_tier(completed.uid, Tier.PRO, record)
    elif kind == "customer.subscription.deleted":
        uid = (obj.get("metadata") or {}).get("uid")
        stored = await repository.get_billing(uid) if isinstance(uid, str) else None
        if isinstance(uid, str) and stored and stored.subscription_id == obj.get("id"):
            await repository.set_tier(uid, Tier.FREE, None)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    repository: RepositoryDep,
    settings: SettingsDep,
    clock: ClockDep,
    stripe_signature: str = Header(default=""),
) -> dict[str, bool]:
    """Stripe's signed event callback. Unsigned or stale requests are refused."""
    if settings.stripe_webhook_secret is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    payload = await request.body()
    secret = settings.stripe_webhook_secret.get_secret_value()
    if not signature.is_valid(payload, stripe_signature, secret, int(clock().timestamp())):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    try:
        event = json.loads(payload)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid payload") from error
    if isinstance(event, dict):
        await _apply_event(repository, event)
    return {"received": True}

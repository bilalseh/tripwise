"""A small Stripe REST client for test-mode subscriptions (no SDK needed)."""

from dataclasses import dataclass
from typing import Any, Protocol

import httpx

API = "https://api.stripe.com/v1"
PRO_PRICE_CENTS = 500


class BillingError(Exception):
    """Stripe could not be reached or refused the request."""


@dataclass(frozen=True, slots=True)
class CompletedCheckout:
    uid: str
    customer_id: str
    subscription_id: str


class Billing(Protocol):
    async def create_checkout(
        self, uid: str, email: str | None, success_url: str, cancel_url: str
    ) -> str:
        """Start a hosted checkout and return its URL."""
        ...

    async def completed_checkout(self, session_id: str) -> CompletedCheckout | None:
        """The paid checkout's details, or None if it is not complete."""
        ...

    async def cancel_subscription(self, subscription_id: str) -> None: ...


def completed_from_session(session: dict[str, Any]) -> CompletedCheckout | None:
    """Read a Checkout Session object, from the API or a webhook event."""
    paid = session.get("status") == "complete" and session.get("payment_status") == "paid"
    uid, customer, subscription = (
        session.get("client_reference_id"),
        session.get("customer"),
        session.get("subscription"),
    )
    if not paid or not all(isinstance(v, str) and v for v in (uid, customer, subscription)):
        return None
    return CompletedCheckout(str(uid), str(customer), str(subscription))


class StripeBilling:
    def __init__(self, http: httpx.AsyncClient, secret_key: str) -> None:
        self._http = http
        self._auth = {"Authorization": f"Bearer {secret_key}"}

    async def _call(self, method: str, path: str, data: dict[str, str] | None = None) -> Any:
        try:
            response = await self._http.request(
                method, f"{API}{path}", headers=self._auth, data=data
            )
        except httpx.HTTPError as error:
            raise BillingError("Stripe is unreachable") from error
        if response.status_code >= 400:
            raise BillingError(f"Stripe answered {response.status_code}")
        return response.json()

    async def create_checkout(
        self, uid: str, email: str | None, success_url: str, cancel_url: str
    ) -> str:
        data = {
            "mode": "subscription",
            "client_reference_id": uid,
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": str(PRO_PRICE_CENTS),
            "line_items[0][price_data][recurring][interval]": "month",
            "line_items[0][price_data][product_data][name]": "Tripwise Pro (test mode demo)",
            "subscription_data[metadata][uid]": uid,
        }
        if email:
            data["customer_email"] = email
        session = await self._call("POST", "/checkout/sessions", data)
        url = session.get("url")
        if not isinstance(url, str):
            raise BillingError("Stripe returned no checkout URL")
        return url

    async def completed_checkout(self, session_id: str) -> CompletedCheckout | None:
        session = await self._call("GET", f"/checkout/sessions/{session_id}")
        return completed_from_session(session)

    async def cancel_subscription(self, subscription_id: str) -> None:
        await self._call("DELETE", f"/subscriptions/{subscription_id}")

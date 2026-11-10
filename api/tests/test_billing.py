"""Stripe TEST MODE billing: checkout, confirmation, cancellation and signed webhooks."""

import json
from collections.abc import Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tests.conftest import AS_ADA, AS_DEMO, NOW
from tests.fakes import FakeBilling, InMemoryRepository
from tripwise_api.billing import signature
from tripwise_api.billing.stripe import CompletedCheckout, completed_from_session
from tripwise_api.config import Settings
from tripwise_api.main import Overrides, create_app
from tripwise_api.repository import BillingRecord
from tripwise_api.schemas.profile import Tier

WEBHOOK_SECRET = "whsec_test_secret"
SESSION = "cs_test_a1B2c3D4e5"


@pytest.fixture
def client(settings: Settings, overrides: Overrides) -> Iterator[TestClient]:
    with_secret = settings.model_copy(update={"stripe_webhook_secret": SecretStr(WEBHOOK_SECRET)})
    with TestClient(create_app(with_secret, overrides)) as test_client:
        test_client.post("/api/me", headers=AS_ADA)
        yield test_client


def _pay(billing: FakeBilling, uid: str = "user-ada") -> None:
    billing.paid[SESSION] = CompletedCheckout(uid, "cus_1", "sub_1")


def test_live_stripe_keys_are_refused() -> None:
    with pytest.raises(ValueError, match="test-mode"):
        Settings(firebase_project_id="p", stripe_secret_key=SecretStr("sk_live_123"))


def test_status_says_whether_checkout_is_available(client: TestClient) -> None:
    assert client.get("/api/billing", headers=AS_ADA).json() == {
        "available": True,
        "tier": "free",
        "priceCents": 500,
    }


def test_without_keys_checkout_is_unavailable(settings: Settings, overrides: Overrides) -> None:
    fakes = replace(overrides, billing=None)
    with TestClient(create_app(settings, fakes)) as client:
        client.post("/api/me", headers=AS_ADA)
        assert client.get("/api/billing", headers=AS_ADA).json()["available"] is False
        response = client.post("/api/billing/checkout", headers=AS_ADA)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "billing_unavailable"


def test_checkout_returns_stripes_hosted_page(client: TestClient, billing: FakeBilling) -> None:
    response = client.post("/api/billing/checkout", headers=AS_ADA)

    assert response.json() == {"url": "https://checkout.stripe.com/c/pay/cs_test_user-ada"}
    [(uid, email, success, cancel)] = billing.checkouts
    assert (uid, email) == ("user-ada", "ada@example.com")
    assert success == "https://tripwise.example/settings?checkout={CHECKOUT_SESSION_ID}"
    assert cancel == "https://tripwise.example/pricing?checkout=cancelled"


def test_confirming_a_paid_checkout_upgrades_to_pro(
    client: TestClient, billing: FakeBilling, repository: InMemoryRepository
) -> None:
    _pay(billing)

    profile = client.post("/api/billing/confirm", json={"sessionId": SESSION}, headers=AS_ADA)

    assert profile.json()["tier"] == "pro"
    assert repository.billing["user-ada"] == BillingRecord(
        customer_id="cus_1", subscription_id="sub_1"
    )
    usage = client.get("/api/me/usage", headers=AS_ADA).json()
    assert usage["aiLimit"] == 100
    assert usage["tripLimit"] is None


def test_someone_elses_or_unpaid_checkout_is_refused(
    client: TestClient, billing: FakeBilling
) -> None:
    unpaid = client.post("/api/billing/confirm", json={"sessionId": SESSION}, headers=AS_ADA)
    _pay(billing, uid="someone-else")
    other = client.post("/api/billing/confirm", json={"sessionId": SESSION}, headers=AS_ADA)

    assert unpaid.status_code == other.status_code == 409


def test_session_ids_are_validated(client: TestClient) -> None:
    assert (
        client.post(
            "/api/billing/confirm", json={"sessionId": "../x/y"}, headers=AS_ADA
        ).status_code
        == 422
    )


def test_cancelling_returns_to_free(
    client: TestClient, billing: FakeBilling, repository: InMemoryRepository
) -> None:
    _pay(billing)
    client.post("/api/billing/confirm", json={"sessionId": SESSION}, headers=AS_ADA)

    profile = client.post("/api/billing/cancel", headers=AS_ADA).json()

    assert profile["tier"] == "free"
    assert billing.cancelled == ["sub_1"]
    assert "user-ada" not in repository.billing


def test_stripe_outage_is_a_clear_error(client: TestClient, billing: FakeBilling) -> None:
    billing.fail = True

    assert client.post("/api/billing/checkout", headers=AS_ADA).status_code == 502


def test_demo_users_can_try_checkout_too(client: TestClient) -> None:
    client.post("/api/me", headers=AS_DEMO)

    assert client.post("/api/billing/checkout", headers=AS_DEMO).status_code == 200


def _signed(client: TestClient, event: dict[str, object], secret: str = WEBHOOK_SECRET) -> int:
    body = json.dumps(event).encode()
    timestamp = int(NOW.timestamp())
    header = f"t={timestamp},v1={signature.sign(body, secret, timestamp)}"
    return client.post(
        "/api/billing/webhook", content=body, headers={"Stripe-Signature": header}
    ).status_code


def _session_event() -> dict[str, object]:
    session = {
        "status": "complete",
        "payment_status": "paid",
        "client_reference_id": "user-ada",
        "customer": "cus_9",
        "subscription": "sub_9",
    }
    return {"type": "checkout.session.completed", "data": {"object": session}}


def test_signed_webhooks_upgrade_and_downgrade(
    client: TestClient, repository: InMemoryRepository
) -> None:
    assert _signed(client, _session_event()) == 200
    assert repository.profiles["user-ada"].tier is Tier.PRO

    deleted = {"id": "sub_9", "metadata": {"uid": "user-ada"}}
    assert (
        _signed(client, {"type": "customer.subscription.deleted", "data": {"object": deleted}})
        == 200
    )
    assert repository.profiles["user-ada"].tier.value == "free"


def test_unsigned_or_forged_webhooks_are_refused(
    client: TestClient, repository: InMemoryRepository
) -> None:
    assert _signed(client, _session_event(), secret="whsec_wrong") == 400
    assert client.post("/api/billing/webhook", content=b"{}").status_code == 400
    assert repository.profiles["user-ada"].tier is Tier.FREE


def test_stale_signatures_are_refused() -> None:
    body = b"{}"
    old = int(NOW.timestamp()) - signature.TOLERANCE_SECONDS - 1
    header = f"t={old},v1={signature.sign(body, 's', old)}"

    assert not signature.is_valid(body, header, "s", int(NOW.timestamp()))


def test_only_paid_complete_sessions_count() -> None:
    session = {"status": "open", "payment_status": "unpaid", "client_reference_id": "u"}

    assert completed_from_session(session) is None

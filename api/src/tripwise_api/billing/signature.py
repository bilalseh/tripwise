"""Stripe webhook signatures, checked without the Stripe SDK.

Stripe signs `{timestamp}.{raw body}` with HMAC-SHA256 and the endpoint's secret, and sends
`Stripe-Signature: t=...,v1=...`. Old timestamps are refused so a captured event cannot be replayed.
"""

import hashlib
import hmac

TOLERANCE_SECONDS = 300


def _parts(header: str) -> tuple[int | None, list[str]]:
    timestamp: int | None = None
    signatures: list[str] = []
    for item in header.split(","):
        key, _, value = item.strip().partition("=")
        if key == "t" and value.isdigit():
            timestamp = int(value)
        elif key == "v1" and value:
            signatures.append(value)
    return timestamp, signatures


def sign(payload: bytes, secret: str, timestamp: int) -> str:
    signed = f"{timestamp}.".encode() + payload
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def is_valid(payload: bytes, header: str, secret: str, now: int) -> bool:
    timestamp, signatures = _parts(header)
    if timestamp is None or not signatures or abs(now - timestamp) > TOLERANCE_SECONDS:
        return False
    expected = sign(payload, secret, timestamp)
    return any(hmac.compare_digest(expected, candidate) for candidate in signatures)

"""LemonSqueezy billing integration.

Handles:
  - Checkout session creation (returns hosted checkout URL)
  - Customer portal URL generation
  - Webhook signature verification (HMAC-SHA256)
  - Subscription event parsing → plan name

Variant IDs are configured via env vars — set them after creating products
in the LemonSqueezy dashboard:
  LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID
  LEMONSQUEEZY_PRO_ANNUAL_VARIANT_ID
  LEMONSQUEEZY_COACH_MONTHLY_VARIANT_ID
  LEMONSQUEEZY_COACH_ANNUAL_VARIANT_ID

Stub mode: STUB_LEMONSQUEEZY=1 captures calls in-memory (no real API calls).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

LS_API_BASE = "https://api.lemonsqueezy.com/v1"

_STUB_OUTBOX: list[dict[str, Any]] = []


def _is_stubbed() -> bool:
    return os.getenv("STUB_LEMONSQUEEZY", "0") == "1"


def get_ls_outbox() -> list[dict[str, Any]]:
    return list(_STUB_OUTBOX)


def reset_ls_outbox() -> None:
    _STUB_OUTBOX.clear()


# ── Variant → plan mapping ─────────────────────────────────────────────

def _variant_to_plan(variant_id: str) -> str | None:
    """Return 'pro' or 'coach' for a known variant ID, None if unknown."""
    mapping = {
        os.getenv("LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID", ""):   "pro",
        os.getenv("LEMONSQUEEZY_PRO_ANNUAL_VARIANT_ID", ""):    "pro",
        os.getenv("LEMONSQUEEZY_COACH_MONTHLY_VARIANT_ID", ""): "coach",
        os.getenv("LEMONSQUEEZY_COACH_ANNUAL_VARIANT_ID", ""):  "coach",
    }
    mapping.pop("", None)  # remove empty-string keys (unset env vars)
    return mapping.get(str(variant_id))


# ── Checkout ───────────────────────────────────────────────────────────

async def create_checkout_url(
    *,
    variant_id: str,
    user_id: str,
    user_email: str,
    redirect_url: str,
) -> str:
    """Create a LemonSqueezy hosted checkout and return the URL.

    The user_id is embedded in checkout_data.custom so the webhook handler
    can identify which user completed the purchase without storing anything
    server-side.
    """
    if _is_stubbed():
        url = f"https://stub.lemonsqueezy.com/checkout/{variant_id}?user={user_id}"
        _STUB_OUTBOX.append({"action": "checkout", "variant_id": variant_id,
                              "user_id": user_id, "url": url})
        return url

    api_key = os.getenv("LEMONSQUEEZY_API_KEY", "")
    store_id = os.getenv("LEMONSQUEEZY_STORE_ID", "")

    if not api_key or not store_id:
        raise RuntimeError(
            "LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID must be set in SaaS mode."
        )

    payload: dict[str, Any] = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "email": user_email,
                    "custom": {"user_id": user_id},
                },
                "product_options": {
                    "redirect_url": redirect_url,
                    "receipt_button_text": "Go to dashboard",
                    "receipt_link_url": redirect_url,
                },
                "checkout_options": {
                    "button_color": "#5B21B6",
                },
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": str(store_id)}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{LS_API_BASE}/checkouts",
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
        )
        if r.status_code >= 400:
            log.error("LemonSqueezy checkout error %s: %s", r.status_code, r.text)
            raise RuntimeError(f"LemonSqueezy API error: {r.status_code}")

        data = r.json()
        url: str = data["data"]["attributes"]["url"]
        return url


# ── Customer portal ────────────────────────────────────────────────────

def get_customer_portal_url(customer_id: str) -> str:
    """LemonSqueezy customer portal URL for managing subscription.

    The portal is hosted on LemonSqueezy — no API call needed, just build
    the URL. Customers see their orders, invoices, and cancellation options.
    """
    if _is_stubbed():
        return f"https://stub.lemonsqueezy.com/billing/{customer_id}"

    store_slug = os.getenv("LEMONSQUEEZY_STORE_SLUG", "appname")
    return f"https://app.lemonsqueezy.com/my-orders?customer_id={customer_id}"


# ── Webhook verification ───────────────────────────────────────────────

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify X-Signature header per LemonSqueezy docs.
    Signature = hex(HMAC-SHA256(secret, payload)).
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


# ── Event parsing ──────────────────────────────────────────────────────

def parse_subscription_event(event_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Extract the fields we care about from any subscription_* webhook payload.

    Returns:
        {
          user_id: str | None   — from custom_data (set at checkout)
          customer_id: str      — LemonSqueezy customer ID
          subscription_id: str  — LemonSqueezy subscription ID
          variant_id: str       — determines plan (pro/coach)
          plan: str | None      — 'pro' | 'coach' | None if variant unknown
          status: str           — 'active' | 'on_trial' | 'cancelled' | 'expired' | ...
          renews_at: str | None — ISO datetime
          ends_at: str | None   — ISO datetime (for cancelled subs)
          trial_ends_at: str | None
        }
    """
    meta: dict = payload.get("meta", {})
    custom: dict = meta.get("custom_data", {}) or {}
    attrs: dict = (payload.get("data") or {}).get("attributes", {})

    variant_id = str(attrs.get("variant_id", ""))
    customer_id = str(attrs.get("customer_id", ""))
    subscription_id = str((payload.get("data") or {}).get("id", ""))

    return {
        "user_id": custom.get("user_id"),
        "customer_id": customer_id,
        "subscription_id": subscription_id,
        "variant_id": variant_id,
        "plan": _variant_to_plan(variant_id),
        "status": attrs.get("status", ""),
        "renews_at": attrs.get("renews_at"),
        "ends_at": attrs.get("ends_at"),
        "trial_ends_at": attrs.get("trial_ends_at"),
    }

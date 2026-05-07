"""Expo Push Notification Service.

Docs: https://docs.expo.dev/push-notifications/sending-notifications/

The Expo Push API takes a list of {to, title, body, data?} dicts and returns
a list of tickets. Per-token errors come back as {status: 'error', details: {error: 'DeviceNotRegistered', ...}};
when we see that we disable the token so we stop sending to it.

Stub mode: STUB_EXPO_PUSH=1 captures sends to an in-memory list.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH = 100  # Expo accepts up to 100 messages per call

_STUB_OUTBOX: list[dict[str, Any]] = []


def reset_push_outbox() -> None:
    _STUB_OUTBOX.clear()


def get_push_outbox() -> list[dict[str, Any]]:
    return list(_STUB_OUTBOX)


def _is_stubbed() -> bool:
    return os.getenv("STUB_EXPO_PUSH", "0") == "1"


def is_valid_expo_token(token: str) -> bool:
    """Light validation. Real tokens look like:
    ExponentPushToken[XXXXXXXXXXXXXXXXXXXXXX] or ExpoPushToken[...]
    """
    if not token:
        return False
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


async def send_push_batch(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Send a list of {to, title, body, data?, sound?} dicts.
    Returns a list of tickets in the same order. Tickets:
       {status: 'ok', id: '...'}  on success
       {status: 'error', message: '...', details: {error: '...'}} on per-token failure
    """
    if not messages:
        return []

    if _is_stubbed():
        out: list[dict[str, Any]] = []
        for m in messages:
            _STUB_OUTBOX.append(m)
            out.append({"status": "ok", "id": f"stub_{len(_STUB_OUTBOX)}"})
        return out

    tickets: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for i in range(0, len(messages), MAX_BATCH):
            batch = messages[i : i + MAX_BATCH]
            r = await client.post(
                EXPO_PUSH_URL,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                json=batch,
            )
            if r.status_code >= 400:
                log.warning("Expo push HTTP %s: %s", r.status_code, r.text)
                # Synthetic error tickets so caller can disable tokens
                tickets.extend(
                    [{"status": "error", "message": f"HTTP {r.status_code}", "details": {}}]
                    * len(batch)
                )
                continue
            data = r.json()
            tickets.extend(data.get("data") or [])
    return tickets


async def send_push_to_user(
    *,
    expo_tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """Helper: send the same message to all of a user's tokens.
    Returns [(expo_token, ticket), ...] so the caller can disable broken ones.
    """
    valid = [t for t in expo_tokens if is_valid_expo_token(t)]
    if not valid:
        return []

    msgs = [
        {
            "to": t,
            "sound": "default",
            "title": title,
            "body": body,
            **({"data": data} if data else {}),
        }
        for t in valid
    ]
    tickets = await send_push_batch(msgs)
    return list(zip(valid, tickets, strict=False))

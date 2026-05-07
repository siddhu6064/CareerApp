"""Phase 10.6 — APScheduler init (desktop only).

Replaces the GitHub Actions cron used in SaaS. APScheduler runs in-process
inside the FastAPI server when APPNAME_MODE=desktop.

Default: 6:00am local time, daily — fetch from configured ATS boards. Manual
fetch is also exposed at /api/jobs/fetch-now for power users who don't want
to wait.

Deliberately NOT registered in SaaS mode — the GitHub Actions workflows in
.github/workflows/ are the source of truth there.
"""
from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _local_tz() -> Any:
    try:
        from tzlocal import get_localzone
        return get_localzone()
    except Exception as exc:  # noqa: BLE001
        log.warning("tzlocal failed (%s) — falling back to UTC", exc)
        return None  # APScheduler uses UTC if tzinfo=None


async def _run_local_fetch(storage_factory: Any) -> None:
    """The job APScheduler triggers daily."""
    from backend.jobs.pipeline import run_ingestion
    storage = storage_factory()
    try:
        log.info("local cron: starting daily fetch")
        counters = await run_ingestion(storage, queries=[])
        expired = await storage.mark_expired_jobs()
        log.info("local cron: done %s expired=%d", counters, expired)
    except Exception as exc:  # noqa: BLE001
        log.exception("local cron: fetch failed: %s", exc)


def start_desktop_scheduler(storage_factory: Any, *, hour: int = 6, minute: int = 0) -> None:
    """Idempotent: safe to call multiple times. The scheduler runs jobs on
    the FastAPI server's event loop — no separate process needed.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        log.info("desktop scheduler already running")
        return

    tz = _local_tz()
    _scheduler = AsyncIOScheduler(timezone=tz)
    _scheduler.add_job(
        _run_local_fetch,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=tz),
        args=[storage_factory],
        id="local_daily_fetch",
        replace_existing=True,
        max_instances=1,         # never overlap if a previous run is still going
        misfire_grace_time=3600, # forgive a 1h drift (laptop closed at 6am etc.)
    )
    _scheduler.start()
    log.info("desktop scheduler started: daily fetch at %02d:%02d local", hour, minute)


def stop_desktop_scheduler() -> None:
    global _scheduler
    if _scheduler is None or not _scheduler.running:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    log.info("desktop scheduler stopped")

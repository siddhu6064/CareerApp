"""Phase 8 analytics. Pure aggregation functions over StorageAdapter results."""
from backend.analytics.service import (
    APPLIED_SET,
    INTERVIEW_SET,
    OFFER_SET,
    RESPONSE_SET,
    ats_correlation,
    digest_metrics,
    funnel_counts,
    response_rate_by_field,
    summary_metrics,
)

__all__ = [
    "APPLIED_SET",
    "INTERVIEW_SET",
    "OFFER_SET",
    "RESPONSE_SET",
    "ats_correlation",
    "digest_metrics",
    "funnel_counts",
    "response_rate_by_field",
    "summary_metrics",
]

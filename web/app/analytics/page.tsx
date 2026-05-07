"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type {
  AnalyticsAtsCorrelation,
  AnalyticsDigest,
  AnalyticsFunnel,
  AnalyticsSummary,
} from "@/lib/types";

import { StatCard } from "@/components/analytics/StatCard";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { AtsScatter } from "@/components/analytics/AtsScatter";
import { FieldBarChart } from "@/components/analytics/FieldBarChart";
import { UpgradeModal } from "@/components/analytics/UpgradeModal";

const PCT = (x: number) => `${Math.round(x * 100)}%`;

export default function AnalyticsPage() {
  const authed = useStore((s) => s.authed);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [ats, setAts] = useState<AnalyticsAtsCorrelation | null>(null);
  const [digest, setDigest] = useState<AnalyticsDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setErr(null);
    setGated(false);

    Promise.all([
      api.analyticsSummary(),
      api.analyticsFunnel(),
      api.analyticsAtsCorrelation(),
      api.analyticsDigest(),
    ])
      .then(([s, f, a, d]) => {
        setSummary(s);
        setFunnel(f);
        setAts(a);
        setDigest(d);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) {
          setGated(true);
        } else {
          setErr((e as Error).message);
        }
      })
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10">
        <p>Sign in to view analytics.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-sm text-[var(--color-ink-soft)]">Loading analytics…</p>
      </main>
    );
  }

  if (gated) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 relative">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">Analytics</h1>
        {/* Skeleton behind the modal so users see what they'd unlock */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 opacity-30 pointer-events-none">
          <StatCard label="Applications" value="—" />
          <StatCard label="Response rate" value="—" />
          <StatCard label="Interview rate" value="—" />
          <StatCard label="Offer rate" value="—" />
        </div>
        <UpgradeModal />
      </main>
    );
  }

  if (err) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-red-600">{err}</p>
      </main>
    );
  }

  if (!summary || !funnel || !ats || !digest) return null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">Analytics</h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          Last {summary.window.days} days · {summary.total_applications}{" "}
          applications
        </p>
      </header>

      {/* ── Summary cards ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Applied"
          value={String(summary.applied_count)}
          sub={`${summary.total_applications} tracked`}
        />
        <StatCard
          label="Response rate"
          value={PCT(summary.response_rate)}
          sub={`${summary.responded_count} of ${summary.applied_count}`}
          tone={summary.response_rate >= 0.2 ? "good" : "default"}
        />
        <StatCard
          label="Interview rate"
          value={PCT(summary.interview_rate)}
          sub={`${summary.interviewed_count} interviews`}
        />
        <StatCard
          label="Offer rate"
          value={PCT(summary.offer_rate)}
          sub={`${summary.offered_count} offers`}
          tone={summary.offer_rate > 0 ? "good" : "default"}
        />
        <StatCard
          label="Avg days to response"
          value={
            summary.avg_days_to_response !== null
              ? summary.avg_days_to_response.toFixed(1)
              : "—"
          }
          sub={`${summary.response_sample_size} samples`}
        />
        <StatCard
          label="Digest sent"
          value={String(digest.sent_count)}
          sub={`Open ${PCT(digest.open_rate)} · Click ${PCT(digest.click_rate)}`}
        />
        <StatCard
          label="Digest conversions"
          value={String(digest.tailor_conversions)}
          sub={`of ${digest.tailor_count_total} total tailors`}
          tone={digest.tailor_conversions > 0 ? "good" : "default"}
        />
        <StatCard
          label="Tailored count"
          value={String(digest.tailor_count_total)}
          sub="last 90 days"
        />
      </section>

      {/* ── Funnel ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-ink)] mb-3">
          Pipeline funnel
        </h2>
        <div className="border border-[var(--color-border)] rounded-lg bg-white p-4">
          <FunnelChart stages={funnel.stages} />
        </div>
      </section>

      {/* ── ATS correlation ─────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-ink)] mb-1">
          ATS score vs response
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mb-3">
          {ats.low_data
            ? "Need at least 3 responded and 3 non-responded apps with tailored resumes for a meaningful comparison."
            : ats.delta !== null && ats.delta > 0
              ? `Apps that got responses scored ${ats.delta.toFixed(1)} points higher on average.`
              : "Apps that got responses didn't score meaningfully higher — your ATS isn't the bottleneck."}
        </p>
        <div className="border border-[var(--color-border)] rounded-lg bg-white p-4">
          <AtsScatter data={ats} />
        </div>
      </section>

      {/* ── Response rate by field ───────────────────────────────── */}
      {funnel.by_field.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-ink)] mb-3">
            Response rate by field
          </h2>
          <div className="border border-[var(--color-border)] rounded-lg bg-white p-4">
            <FieldBarChart data={funnel.by_field} />
          </div>
        </section>
      )}

      {/* ── Digest detail ────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-ink)] mb-3">
          Daily digest performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Sent"
            value={String(digest.sent_count)}
            sub="last 90 days"
          />
          <StatCard
            label="Open rate"
            value={PCT(digest.open_rate)}
            sub={`${digest.opened_count} opened`}
          />
          <StatCard
            label="Click rate"
            value={PCT(digest.click_rate)}
            sub={`${digest.clicked_count} clicked`}
          />
          <StatCard
            label="Conversion rate"
            value={PCT(digest.conversion_rate)}
            sub={`${digest.tailor_conversions} tailors from digest`}
          />
        </div>
      </section>
    </main>
  );
}

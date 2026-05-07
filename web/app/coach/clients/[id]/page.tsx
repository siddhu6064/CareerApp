"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  STATUS_LABEL,
  type Application,
  type CoachClient,
  type CoachClientAnalytics,
  type Job,
  type TailoredResume,
} from "@/lib/types";
import { CoachGateModal } from "@/components/coach/CoachGateModal";

const PCT = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;

export default function CoachClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const authed = useStore((s) => s.authed);

  const [client, setClient] = useState<CoachClient | null>(null);
  const [tracker, setTracker] = useState<Application[]>([]);
  const [analytics, setAnalytics] = useState<CoachClientAnalytics | null>(null);
  const [tailored, setTailored] = useState<TailoredResume[]>([]);
  const [tab, setTab] = useState<"tracker" | "analytics" | "tailored">("tracker");
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Tailor flow state
  const [showTailor, setShowTailor] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pickedJob, setPickedJob] = useState<string>("");
  const [tailorBusy, setTailorBusy] = useState(false);
  const [tailorFlash, setTailorFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!authed || !id) return;
    setLoading(true);
    setErr(null);

    Promise.all([
      api.coachGetClient(id),
      api.coachClientTracker(id).catch(() => []),
      api.coachClientAnalytics(id).catch(() => null),
      api.coachClientTailored(id).catch(() => []),
    ])
      .then(([c, t, a, tr]) => {
        setClient(c);
        setTracker(t);
        setAnalytics(a);
        setTailored(tr);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) setGated(true);
        else setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [authed, id]);

  async function loadJobs() {
    if (jobs.length > 0) return;
    try {
      const page = await api.jobs({ page_size: 30 });
      setJobs(page.items);
    } catch (e) {
      setTailorFlash(`Couldn't load jobs: ${(e as Error).message}`);
    }
  }

  async function submitTailor() {
    if (!pickedJob) return;
    setTailorBusy(true);
    setTailorFlash(null);
    try {
      const res = await api.coachTailorForClient(id, pickedJob);
      setTailorFlash(
        res.ok
          ? `✓ Tailored. ATS score ${res.ats_score}.`
          : `Failed.`,
      );
      setShowTailor(false);
      // Refresh tailored list
      const fresh = await api.coachClientTailored(id);
      setTailored(fresh);
    } catch (e) {
      setTailorFlash(`Error: ${(e as Error).message}`);
    } finally {
      setTailorBusy(false);
    }
  }

  if (!authed) return <p>Sign in to continue.</p>;
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (gated) return <CoachGateModal />;
  if (err) return <p className="text-red-600">{err}</p>;
  if (!client) return null;

  const isPending = client.status === "pending";
  const displayName =
    client.invited_name || client.client_email_actual || client.invited_email;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/coach" className="text-xs text-[var(--color-brand)] hover:underline">
            ← Back to clients
          </Link>
          <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-1">
            {displayName}
          </h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {client.client_email_actual || client.invited_email} ·{" "}
            <span
              className={
                client.status === "active"
                  ? "text-emerald-700"
                  : "text-amber-700"
              }
            >
              {client.status}
            </span>
          </p>
        </div>
        {!isPending && (
          <button
            onClick={() => {
              setShowTailor(true);
              loadJobs();
            }}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)]"
          >
            Tailor for this client
          </button>
        )}
      </header>

      {tailorFlash && (
        <div className="text-sm border border-[var(--color-border)] bg-emerald-50 text-emerald-800 rounded px-3 py-2">
          {tailorFlash}
        </div>
      )}

      {showTailor && (
        <div className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-3">
          <h3 className="font-semibold text-[var(--color-ink)]">Pick a job</h3>
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Loading jobs…</p>
          ) : (
            <select
              value={pickedJob}
              onChange={(e) => setPickedJob(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
            >
              <option value="">— select —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.company}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={submitTailor}
              disabled={!pickedJob || tailorBusy}
              className="px-4 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
            >
              {tailorBusy ? "Tailoring…" : "Tailor"}
            </button>
            <button
              onClick={() => setShowTailor(false)}
              className="px-4 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isPending ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
          <p className="text-[var(--color-ink-soft)]">
            This client hasn't accepted the invite yet.
          </p>
          <p className="text-xs text-[var(--color-ink-soft)] mt-2">
            Once they accept, you'll see their tracker, analytics, and tailored
            resumes here.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-[var(--color-border)]">
            {(["tracker", "analytics", "tailored"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                  tab === t
                    ? "border-[var(--color-brand)] text-[var(--color-brand)] font-medium"
                    : "border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
              >
                {t === "tracker" ? "Tracker" : t === "analytics" ? "Analytics" : "Tailored"}
              </button>
            ))}
          </div>

          {tab === "tracker" && (
            <section>
              {tracker.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">No applications yet.</p>
              ) : (
                <ul className="space-y-2">
                  {tracker.map((a) => (
                    <li
                      key={a.id}
                      className="border border-[var(--color-border)] rounded-lg bg-white p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-[var(--color-ink-soft)]">
                          {a.company}
                          {a.platform ? ` · ${a.platform}` : ""}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-[var(--color-brand-bg)] text-[var(--color-brand)] font-medium">
                        {STATUS_LABEL[a.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[var(--color-ink-soft)] mt-3">
                Coach view is read-only — only the client can change application status.
              </p>
            </section>
          )}

          {tab === "analytics" && analytics && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Applied" value={String(analytics.summary.applied_count)} />
                <Stat label="Response rate" value={PCT(analytics.summary.response_rate)} />
                <Stat label="Interview rate" value={PCT(analytics.summary.interview_rate)} />
                <Stat label="Offer rate" value={PCT(analytics.summary.offer_rate)} />
              </div>
              <div className="border border-[var(--color-border)] rounded-lg bg-white p-4">
                <h3 className="text-sm font-semibold text-[var(--color-ink)] mb-2">
                  Funnel
                </h3>
                <ul className="space-y-1 text-sm">
                  {analytics.funnel.stages.map((s) => (
                    <li key={s.status} className="flex justify-between">
                      <span>{STATUS_LABEL[s.status]}</span>
                      <span className="font-mono">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "tailored" && (
            <section>
              {tailored.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  No tailored resumes yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tailored.map((t) => (
                    <li
                      key={t.id}
                      className="border border-[var(--color-border)] rounded-lg bg-white p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          ATS{" "}
                          <strong className="text-[var(--color-brand)]">
                            {t.ats_score ?? "—"}
                          </strong>
                          <span className="text-xs text-[var(--color-ink-soft)] ml-2">
                            {new Date(t.created_at).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--color-ink-soft)]">
                          {t.sonnet_method ?? "—"}
                        </span>
                      </div>
                      {t.match_points.length > 0 && (
                        <p className="text-xs text-[var(--color-ink-soft)] mt-1">
                          Matched: {t.match_points.slice(0, 5).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 text-[var(--color-ink)]">{value}</div>
    </div>
  );
}

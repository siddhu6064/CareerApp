"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { BulkTailorResponse, CoachClient, Job } from "@/lib/types";
import { CoachGateModal } from "@/components/coach/CoachGateModal";

export default function BulkTailorPage() {
  const authed = useStore((s) => s.authed);

  const [clients, setClients] = useState<CoachClient[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickedJob, setPickedJob] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // In-flight + result
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkTailorResponse | null>(null);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setErr(null);
    Promise.all([
      api.coachListClients("active"),
      api.jobs({ page_size: 30 }),
    ])
      .then(([cs, jp]) => {
        setClients(cs);
        setJobs(jp.items);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) setGated(true);
        else setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [authed]);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function submitBulk() {
    if (!pickedJob || selectedIds.size === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api.coachBulkTailor(Array.from(selectedIds), pickedJob);
      setResult(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!authed) return <p>Sign in to continue.</p>;
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (gated) return <CoachGateModal />;
  if (err) return <p className="text-red-600">{err}</p>;

  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <header>
        <Link href="/coach" className="text-xs text-[var(--color-brand)] hover:underline">
          ← Back to clients
        </Link>
        <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-1">Bulk tailor</h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          Pick a job and select up to 10 clients. Each tailor counts against your monthly quota.
        </p>
      </header>

      {/* Job picker */}
      <section className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-2">
        <label className="text-sm">
          <span className="block text-[var(--color-ink-soft)] mb-1">Job</span>
          <select
            value={pickedJob}
            onChange={(e) => setPickedJob(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
          >
            <option value="">— select a job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.company}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* Client multi-select */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-2">
          Clients ({selectedIds.size}/{clients.length} selected)
        </h2>
        {clients.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            No active clients. Invite one first from the dashboard.
          </p>
        ) : (
          <ul className="space-y-2">
            {clients.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`border rounded-lg p-3 cursor-pointer ${
                    checked
                      ? "border-[var(--color-brand)] bg-[var(--color-brand-bg)]"
                      : "border-[var(--color-border)] bg-white"
                  }`}
                  onClick={() => toggle(c.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <div className="font-medium">
                          {c.invited_name || c.client_email_actual || c.invited_email}
                        </div>
                        <div className="text-xs text-[var(--color-ink-soft)]">
                          {c.client_email_actual || c.invited_email}
                        </div>
                      </div>
                    </div>
                    {c.applied_count !== null && c.applied_count !== undefined && (
                      <span className="text-xs text-[var(--color-ink-soft)]">
                        {c.applied_count} apps
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="sticky bottom-4 flex gap-2 bg-white border border-[var(--color-border)] rounded-lg p-3 shadow">
        <button
          onClick={submitBulk}
          disabled={!pickedJob || selectedIds.size === 0 || busy}
          className="flex-1 px-4 py-2 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
        >
          {busy
            ? `Tailoring ${selectedIds.size}…`
            : `Tailor for ${selectedIds.size} client${selectedIds.size === 1 ? "" : "s"}`}
        </button>
      </div>

      {result && (
        <section className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-2">
          <h2 className="font-semibold text-[var(--color-ink)]">
            Results: {result.succeeded}/{result.total} succeeded
          </h2>
          <ul className="space-y-1">
            {result.results.map((r) => {
              const client = clientById.get(r.coach_client_id);
              const name =
                client?.invited_name ||
                client?.client_email_actual ||
                client?.invited_email ||
                r.coach_client_id;
              return (
                <li
                  key={r.coach_client_id}
                  className={`text-sm flex justify-between rounded px-2 py-1.5 ${
                    r.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"
                  }`}
                >
                  <span className="font-medium">{name}</span>
                  <span className="text-xs">
                    {r.ok ? `✓ ATS ${r.ats_score}` : `✗ ${r.error || "failed"}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

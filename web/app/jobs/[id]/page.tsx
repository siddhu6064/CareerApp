"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { TailorPanel } from "@/components/TailorPanel";
import type { Job } from "@/lib/types";

export default function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const authed = useStore((s) => s.authed);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    props.params.then((p) => setJobId(p.id));
  }, [props.params]);

  useEffect(() => {
    if (!authed || !jobId) return;
    api.job(jobId).then(setJob).catch((e: Error) => setErr(e.message));
  }, [authed, jobId]);

  async function saveToTracker() {
    if (!job) return;
    setSavingId(job.id);
    try {
      const app = await api.createApplication({
        job_id: job.id,
        title: job.title,
        company: job.company,
        platform: job.source,
        status: "saved",
      });
      setSavedId(app.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  if (!authed || !jobId) return null;
  if (err) return <p className="text-red-600">{err}</p>;
  if (!job) return <p className="text-[var(--color-ink-soft)]">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-sm text-[var(--color-brand)] hover:underline">
        ← All jobs
      </Link>

      <header className="bg-white border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="text-[var(--color-ink-soft)]">
              {job.company}
              {job.location && ` · ${job.location}`}
              {job.remote_type && job.remote_type !== "any" && ` · ${job.remote_type}`}
            </p>
          </div>
          <div className="flex gap-2">
            {savedId ? (
              <Link
                href="/tracker"
                className="px-4 py-2 bg-[var(--color-brand-bg)] text-[var(--color-brand)] text-sm rounded font-medium"
              >
                Saved → Tracker
              </Link>
            ) : (
              <button
                onClick={saveToTracker}
                disabled={!!savingId}
                className="px-4 py-2 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded font-medium hover:bg-[var(--color-brand-bg)] disabled:opacity-50"
              >
                {savingId ? "Saving…" : "Save to tracker"}
              </button>
            )}
            {job.apply_url && (
              <a
                href={job.apply_url} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded font-medium hover:bg-[var(--color-brand-lt)]"
              >
                Apply ↗
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {job.field && <span className="badge badge-saved">{job.field}</span>}
          {job.level && job.level !== "any" && (
            <span className="badge badge-applied">{job.level}</span>
          )}
          {job.salary_min && job.salary_max && (
            <span className="badge badge-offer">
              ${(job.salary_min / 1000).toFixed(0)}k–${(job.salary_max / 1000).toFixed(0)}k
            </span>
          )}
          {job.quality_score !== null && (
            <span className="badge badge-onsite">Quality {job.quality_score}/100</span>
          )}
        </div>

        {job.tech_stack && job.tech_stack.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)] mb-1">
              Tech stack
            </p>
            <p className="text-sm">{job.tech_stack.join(" · ")}</p>
          </div>
        )}
      </header>

      <TailorPanel jobId={job.id} />

      {job.jd_raw && (
        <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
          <h2 className="font-semibold mb-3">Job description</h2>
          <pre className="text-sm whitespace-pre-wrap font-sans text-[var(--color-ink-soft)]">
            {job.jd_raw}
          </pre>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { JobCard } from "@/components/JobCard";
import { EMPTY_FILTERS, JobFilters, type JobFilterState } from "@/components/JobFilters";
import type { JobsPage } from "@/lib/types";

export default function JobsPageView() {
  const authed = useStore((s) => s.authed);
  const [filters, setFilters] = useState<JobFilterState>(EMPTY_FILTERS);
  const [data, setData] = useState<JobsPage | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    setBusy(true); setErr(null);
    const params: Record<string, string | number> = { page, page_size: 20 };
    if (filters.field) params.field = filters.field;
    if (filters.level) params.level = filters.level;
    if (filters.remote_type) params.remote_type = filters.remote_type;
    if (filters.salary_min) params.salary_min = Number(filters.salary_min) * 1000;
    if (filters.quality_min) params.quality_min = Number(filters.quality_min);

    api.jobs(params)
      .then(setData)
      .catch((e: ApiError) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [authed, filters, page]);

  async function ingestSample() {
    setIngestMsg("Fetching…");
    try {
      const r = await api.ingestJobs(["software engineer", "designer", "data scientist"]);
      setIngestMsg(`Ingested ${r.inserted} (fetched ${r.fetched}, ${r.skipped} spam).`);
      // Refresh the page
      const r2 = await api.jobs({ page: 1, page_size: 20 });
      setData(r2); setPage(1);
    } catch (e) {
      setIngestMsg(`Failed: ${(e as Error).message}`);
    }
  }

  if (!authed) return null;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-3">
        <JobFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <div className="mt-4 bg-white border border-[var(--color-border)] rounded-lg p-4 text-sm">
          <p className="text-[var(--color-ink-soft)] mb-2">No jobs? Ingest the demo set:</p>
          <button
            onClick={ingestSample}
            className="w-full px-3 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded hover:bg-[var(--color-brand-lt)]"
          >
            Ingest sample jobs
          </button>
          {ingestMsg && <p className="mt-2 text-xs">{ingestMsg}</p>}
        </div>
      </div>

      <div className="col-span-12 md:col-span-9">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">
            Jobs {data && <span className="text-[var(--color-ink-soft)] font-normal">({data.total})</span>}
          </h1>
          {data && data.total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 border border-[var(--color-border)] rounded disabled:opacity-40"
              >
                ←
              </button>
              <span>
                page {page} / {Math.max(1, Math.ceil(data.total / data.page_size))}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * (data.page_size || 1) >= data.total}
                className="px-2 py-1 border border-[var(--color-border)] rounded disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </div>

        {err && <div className="text-red-600 text-sm mb-4">{err}</div>}
        {busy && !data && <div className="text-sm text-[var(--color-ink-soft)]">Loading…</div>}
        {data && data.items.length === 0 && (
          <div className="text-center py-12 text-[var(--color-ink-soft)]">
            No jobs match. Adjust filters or ingest the demo set on the left.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data?.items.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      </div>
    </div>
  );
}

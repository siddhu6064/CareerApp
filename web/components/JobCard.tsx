"use client";

import Link from "next/link";
import type { Job } from "@/lib/types";

export function JobCard({ job }: { job: Job }) {
  const salary =
    job.salary_min && job.salary_max
      ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
      : null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block bg-white border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-brand-lt)] hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--color-ink)] truncate">{job.title}</h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        {job.quality_score !== null && (
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-brand-bg)] text-[var(--color-brand)] font-medium shrink-0">
            Q{job.quality_score}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {job.field && <span className="badge badge-saved">{job.field}</span>}
        {job.level && job.level !== "any" && (
          <span className="badge badge-applied">{job.level}</span>
        )}
        {job.remote_type && job.remote_type !== "any" && (
          <span className="badge badge-onsite">{job.remote_type}</span>
        )}
        {salary && (
          <span className="badge badge-offer">{salary}</span>
        )}
      </div>

      {job.tech_stack && job.tech_stack.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)] truncate">
          {job.tech_stack.slice(0, 6).join(" · ")}
        </p>
      )}
    </Link>
  );
}

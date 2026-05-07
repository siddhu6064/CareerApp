"use client";

import Link from "next/link";

export function CoachGateModal() {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-[var(--color-border)]">
        <h2 className="text-xl font-bold text-[var(--color-ink)]">
          Coach tier required
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mt-2">
          Manage up to 10 clients, tailor resumes on their behalf, and ship
          white-label PDFs with your branding.
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Manage 10 client profiles</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Bulk tailor a single job for multiple clients</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>White-label PDF (your logo + brand color)</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Read-only client trackers + analytics</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Everything in Pro</span>
          </li>
        </ul>

        <div className="mt-5 flex gap-2">
          <Link
            href="/settings"
            className="flex-1 px-4 py-2 bg-[var(--color-brand)] text-white rounded text-center text-sm font-semibold hover:bg-[var(--color-brand-lt)]"
          >
            Upgrade to Coach · $49/mo
          </Link>
          <Link
            href="/jobs"
            className="px-4 py-2 border border-[var(--color-border)] rounded text-sm text-[var(--color-ink-soft)] hover:bg-gray-50"
          >
            Not now
          </Link>
        </div>
      </div>
    </div>
  );
}

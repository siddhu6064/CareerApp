"use client";

import Link from "next/link";

export function UpgradeModal() {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-[var(--color-border)]">
        <h2 className="text-xl font-bold text-[var(--color-ink)]">
          Analytics is a Pro feature
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mt-2">
          See which applications converted, your response rate by field, and how
          ATS score correlates with getting interviews — the data point Pro
          users use to figure out what's actually working.
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Response, interview, and offer rates over 90 days</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>ATS score correlation with interview callbacks</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Per-field response rate breakdown</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Daily digest open / click / conversion tracking</span>
          </li>
        </ul>

        <div className="mt-5 flex gap-2">
          <Link
            href="/settings"
            className="flex-1 px-4 py-2 bg-[var(--color-brand)] text-white rounded text-center text-sm font-semibold hover:bg-[var(--color-brand-lt)]"
          >
            Upgrade to Pro · $19/mo
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

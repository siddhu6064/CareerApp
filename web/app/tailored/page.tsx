"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { TailoredResume } from "@/lib/types";

export default function TailoredPage() {
  const authed = useStore((s) => s.authed);
  const [items, setItems] = useState<TailoredResume[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    api.tailoredResumes()
      .then(setItems)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [authed]);

  async function download(id: string) {
    try {
      const blob = await api.fetchTailoredPdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!authed) return null;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">
        Tailored Resumes <span className="text-[var(--color-ink-soft)] font-normal">({items.length})</span>
      </h1>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {busy && <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>}

      {!busy && items.length === 0 && (
        <div className="text-center py-16 text-[var(--color-ink-soft)] bg-white border border-[var(--color-border)] rounded-lg">
          No tailored resumes yet. Open a job and click <strong>Run tailor</strong>.
        </div>
      )}

      <div className="space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="bg-white border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-4"
          >
            <ScoreBadge score={t.ats_score ?? 0} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-[var(--color-ink-soft)] truncate">{t.id}</p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                {new Date(t.created_at).toLocaleString()}
                {t.sonnet_method && ` · ${t.sonnet_method}`}
                {t.job_id && ` · job ${t.job_id.slice(0, 8)}`}
              </p>
              {t.match_points.length > 0 && (
                <p className="text-xs mt-1 text-green-700">
                  ✓ {t.match_points.length} matches · ⚠ {t.gaps.length} gaps
                </p>
              )}
            </div>
            <button
              onClick={() => download(t.id)}
              className="px-3 py-1.5 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded hover:bg-[var(--color-brand-bg)]"
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-green-700 bg-green-100"
    : score >= 40 ? "text-amber-700 bg-amber-100"
    : "text-red-700 bg-red-100";
  return (
    <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold ${color}`}>
      {score}
    </div>
  );
}

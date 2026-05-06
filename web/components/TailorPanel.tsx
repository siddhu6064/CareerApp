"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { TailorResponse } from "@/lib/types";

export function TailorPanel({ jobId }: { jobId: string }) {
  const setQuota = useStore((s) => s.setQuota);
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await api.tailor(jobId);
      setResult(r);
      setQuota({
        plan: "", // refreshed by Nav effect on next nav
        tailor_count_month: r.tailor_count_month,
        tailor_limit: r.tailor_limit,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    const blob = await api.fetchTailoredPdf(result.id);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold">Tailor your resume</h2>
        <button
          onClick={run}
          disabled={busy}
          className="px-4 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50 hover:bg-[var(--color-brand-lt)]"
        >
          {busy ? "Tailoring…" : "Run tailor"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ScoreCircle score={result.ats_score} />
            <div className="flex-1">
              <p className="text-xs text-[var(--color-ink-soft)] uppercase">ATS Score</p>
              <p className="text-lg font-semibold">{result.ats_score}/100</p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                via {result.sonnet_method}{" "}
                · used {result.tailor_count_month}/
                {result.tailor_limit > 1000 ? "∞" : result.tailor_limit}
              </p>
            </div>
            <button
              onClick={downloadPdf}
              className="px-3 py-1.5 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded hover:bg-[var(--color-brand-bg)]"
            >
              Download {result.pdf_extension.toUpperCase()}
            </button>
          </div>

          {result.match_points.length > 0 && (
            <details className="text-sm" open>
              <summary className="cursor-pointer font-medium text-green-700">
                ✓ {result.match_points.length} match points
              </summary>
              <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[var(--color-ink-soft)]">
                {result.match_points.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </details>
          )}

          {result.gaps.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-amber-700">
                ⚠ {result.gaps.length} gaps
              </summary>
              <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[var(--color-ink-soft)]">
                {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </details>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Tailored resume preview</summary>
            <pre className="mt-2 p-3 bg-[var(--color-bg)] rounded text-xs whitespace-pre-wrap font-mono overflow-auto max-h-96">
              {result.content_markdown}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const circumference = 2 * Math.PI * 18;
  const dash = (score / 100) * circumference;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48">
      <circle cx={24} cy={24} r={18} fill="none" stroke="#E5E7EB" strokeWidth={4} />
      <circle
        cx={24} cy={24} r={18} fill="none"
        stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text
        x={24} y={28} textAnchor="middle"
        fontSize={12} fontWeight={700} fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

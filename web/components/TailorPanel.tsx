"use client";

// TailorPanel — Phase 5 core + Phase 8 extensions
//
// After tailoring, three tabs appear:
//   Resume       — ATS score, diff view, PDF iframe preview, download
//   Cover Letter — tone select, generate, markdown viewer, download
//   Interview    — generate, 5-question accordion with approach frameworks
//
// UpgradeModal shown on 402 (free tier limit hit).

import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { UpgradeModal } from "@/components/UpgradeModal";
import { GradeBadge } from "@/components/GradeBadge";
import type {
  CoverLetterResponse,
  InterviewPrepOut,
  MasterResume,
  TailorResponse,
} from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────

type ResultTab = "resume" | "cover" | "prep";
type Tone = "professional" | "enthusiastic" | "concise";

const TONES: { value: Tone; label: string; desc: string }[] = [
  { value: "professional", label: "Professional", desc: "Formal, results-driven" },
  { value: "enthusiastic", label: "Enthusiastic", desc: "Energetic, culture-fit focused" },
  { value: "concise",      label: "Concise",      desc: "Brief, direct, no fluff" },
];

// ── Main component ─────────────────────────────────────────────────

export function TailorPanel({ jobId }: { jobId: string }) {
  const master   = useStore((s) => s.master);
  const setQuota = useStore((s) => s.setQuota);

  const [result, setResult]     = useState<TailorResponse | null>(null);
  const [tab, setTab]           = useState<ResultTab>("resume");
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState<string | false>(false);

  // PDF preview blob
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  function catchUpgrade(e: unknown, feature: string) {
    if (e instanceof ApiError && e.status === 402) {
      setShowUpgrade(feature);
    } else {
      setErr((e as Error).message);
    }
  }

  async function runTailor() {
    setBusy(true); setErr(null); setResult(null);
    setPdfBlobUrl(null);
    try {
      const r = await api.tailor(jobId);
      setResult(r);
      setQuota({ plan: "", tailor_count_month: r.tailor_count_month, tailor_limit: r.tailor_limit });
    } catch (e) {
      catchUpgrade(e, "tailoring");
    } finally {
      setBusy(false);
    }
  }

  async function loadPdf() {
    if (!result || pdfBlobUrl) return;
    setPdfLoading(true);
    try {
      const blob = await api.fetchTailoredPdf(result.id);
      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch {
      // Silently ignore — download button still available
    } finally {
      setPdfLoading(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    const blob = await api.fetchTailoredPdf(result.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tailored-resume.${result.pdf_extension}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // Load PDF when Resume tab is first selected
  const onTabSelect = useCallback((t: ResultTab) => {
    setTab(t);
    if (t === "resume" && result) loadPdf();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, pdfBlobUrl]);

  return (
    <div className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-4">
      {/* Run button row */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Tailor your resume</h2>
        <button
          onClick={runTailor}
          disabled={busy}
          className="px-4 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50 hover:opacity-90"
        >
          {busy ? "Tailoring…" : result ? "Re-tailor" : "Run tailor"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Results */}
      {result && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-[var(--color-border)] -mx-4 px-4">
            {(["resume", "cover", "prep"] as ResultTab[]).map((t) => {
              const labels = { resume: "📄 Resume", cover: "✉️ Cover Letter", prep: "🎯 Interview Prep" };
              return (
                <button
                  key={t}
                  onClick={() => onTabSelect(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t
                      ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                      : "border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {/* ── Resume tab ── */}
          {tab === "resume" && (
            <ResumeTab
              result={result}
              master={master}
              pdfBlobUrl={pdfBlobUrl}
              pdfLoading={pdfLoading}
              onLoadPdf={loadPdf}
              onDownload={downloadPdf}
            />
          )}

          {/* ── Cover Letter tab ── */}
          {tab === "cover" && (
            <CoverLetterTab
              jobId={jobId}
              tailoredId={result.id}
              onUpgrade={(f) => setShowUpgrade(f)}
            />
          )}

          {/* ── Interview Prep tab ── */}
          {tab === "prep" && (
            <InterviewPrepTab
              jobId={jobId}
              onUpgrade={(f) => setShowUpgrade(f)}
            />
          )}
        </>
      )}

      {showUpgrade && (
        <UpgradeModal
          feature={typeof showUpgrade === "string" ? showUpgrade : "this feature"}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}

// ── Resume tab ──────────────────────────────────────────────────────

function ResumeTab({
  result, master, pdfBlobUrl, pdfLoading, onLoadPdf, onDownload,
}: {
  result: TailorResponse;
  master: MasterResume | null;
  pdfBlobUrl: string | null;
  pdfLoading: boolean;
  onLoadPdf: () => void;
  onDownload: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [showRawPreview, setShowRawPreview] = useState(false);

  return (
    <div className="space-y-4">
      {/* Score row */}
      <div className="flex items-center gap-4 p-3 bg-[var(--color-bg)] rounded-lg">
        <ScoreCircle score={result.ats_score} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{result.ats_score}/100</span>
            <GradeBadge score={result.ats_score} size="md" showScore={false} />
          </div>
          <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">
            via {result.sonnet_method} · used {result.tailor_count_month}/
            {result.tailor_limit > 1000 ? "∞" : result.tailor_limit}
          </p>
        </div>
        <button
          onClick={onDownload}
          className="px-3 py-1.5 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded hover:bg-[var(--color-brand-bg)] font-medium"
        >
          Download {result.pdf_extension.toUpperCase()}
        </button>
      </div>

      {/* Match points + gaps */}
      {result.match_points.length > 0 && (
        <details className="text-sm" open>
          <summary className="cursor-pointer font-medium text-green-700 select-none">
            ✓ {result.match_points.length} match points
          </summary>
          <ul className="mt-1.5 ml-5 list-disc space-y-0.5 text-[var(--color-ink-soft)]">
            {result.match_points.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </details>
      )}

      {result.gaps.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-amber-700 select-none">
            ⚠ {result.gaps.length} gaps to address
          </summary>
          <ul className="mt-1.5 ml-5 list-disc space-y-0.5 text-[var(--color-ink-soft)]">
            {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </details>
      )}

      {/* Keywords added */}
      {result.keywords_added.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
            Keywords injected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords_added.map((kw) => (
              <span
                key={kw}
                className="text-xs px-2 py-0.5 bg-green-50 text-green-800 border border-green-200 rounded-full"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Before / After diff */}
      <div>
        <button
          onClick={() => setShowDiff((v) => !v)}
          className="text-sm text-[var(--color-brand)] font-medium hover:underline"
        >
          {showDiff ? "▲ Hide diff" : "↔ Show before/after diff"}
        </button>
        {showDiff && (
          <DiffView
            original={master?.summary ?? null}
            originalExp={master?.experience ?? []}
            tailoredMarkdown={result.content_markdown}
            keywords={result.keywords_added}
          />
        )}
      </div>

      {/* PDF preview */}
      <div>
        {!pdfBlobUrl && !pdfLoading && (
          <button
            onClick={onLoadPdf}
            className="text-sm text-[var(--color-brand)] font-medium hover:underline"
          >
            👁 Preview PDF in browser
          </button>
        )}
        {pdfLoading && (
          <p className="text-sm text-[var(--color-ink-soft)]">Loading PDF preview…</p>
        )}
        {pdfBlobUrl && (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <span className="text-xs font-medium text-[var(--color-ink-soft)]">PDF Preview</span>
              <button onClick={onDownload} className="text-xs text-[var(--color-brand)] hover:underline">
                Download
              </button>
            </div>
            <iframe
              src={pdfBlobUrl}
              className="w-full"
              style={{ height: "600px" }}
              title="Tailored resume PDF preview"
            />
          </div>
        )}
      </div>

      {/* Raw markdown fallback */}
      <details className="text-sm">
        <summary
          className="cursor-pointer font-medium text-[var(--color-ink-soft)] select-none"
          onClick={() => setShowRawPreview((v) => !v)}
        >
          View raw markdown
        </summary>
        <pre className="mt-2 p-3 bg-[var(--color-bg)] rounded text-xs whitespace-pre-wrap font-mono overflow-auto max-h-96">
          {result.content_markdown}
        </pre>
      </details>
    </div>
  );
}

// ── Before/After Diff ───────────────────────────────────────────────

function DiffView({
  original, originalExp, tailoredMarkdown, keywords,
}: {
  original: string | null;
  originalExp: { role: string; company: string; description: string }[];
  tailoredMarkdown: string;
  keywords: string[];
}) {
  // Extract first ~30 lines of tailored markdown for the "after" side
  const tailoredLines = tailoredMarkdown.split("\n").slice(0, 35).join("\n");

  // Build "before" from master resume data
  const beforeText = [
    original ? `Summary:\n${original}` : null,
    ...originalExp.slice(0, 2).map(
      (e) => `${e.role} @ ${e.company}\n${e.description || "(no description)"}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  function highlight(text: string) {
    if (!keywords.length) return text;
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    return text.split(re).map((part, i) =>
      re.test(part)
        ? `<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">${part}</mark>`
        : part,
    ).join("");
  }

  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div>
        <p className="text-xs font-mono font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
          Before (original)
        </p>
        <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] text-xs font-mono whitespace-pre-wrap overflow-auto max-h-60 leading-relaxed text-[var(--color-ink-soft)]">
          {beforeText || "No master resume data to compare."}
        </div>
      </div>
      <div>
        <p className="text-xs font-mono font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
          After (tailored) — <span className="text-yellow-700">keywords highlighted</span>
        </p>
        <div
          className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] text-xs font-mono whitespace-pre-wrap overflow-auto max-h-60 leading-relaxed"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: highlight(tailoredLines) }}
        />
      </div>
    </div>
  );
}

// ── Cover Letter tab ────────────────────────────────────────────────

function CoverLetterTab({
  jobId, tailoredId, onUpgrade,
}: {
  jobId: string;
  tailoredId: string;
  onUpgrade: (feature: string) => void;
}) {
  const [tone, setTone]       = useState<Tone>("professional");
  const [result, setResult]   = useState<CoverLetterResponse | null>(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await api.coverLetter({ job_id: jobId, tailored_resume_id: tailoredId, tone });
      setResult(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) onUpgrade("cover letters");
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadCoverPdf() {
    if (!result) return;
    const blob = await api.fetchCoverLetterPdf(result.pdf_url);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cover-letter.${result.pdf_extension}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function copyToClipboard() {
    if (!result) return;
    await navigator.clipboard.writeText(result.content_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ink-soft)]">
        Generate a tailored cover letter using your resume + this job description.
        <span className="ml-1 text-xs bg-[var(--color-brand-bg)] text-[var(--color-brand)] px-1.5 py-0.5 rounded font-medium">
          Pro
        </span>
      </p>

      {/* Tone selector */}
      <div>
        <p className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-2">Tone</p>
        <div className="flex gap-2">
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTone(t.value)}
              title={t.desc}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                tone === t.value
                  ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                  : "bg-white text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-brand)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={generate}
        disabled={busy}
        className="px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded-lg font-medium disabled:opacity-50 hover:opacity-90"
      >
        {busy ? "Generating…" : result ? "Regenerate" : "Generate cover letter"}
      </button>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {result && (
        <div className="space-y-3">
          {result.notes && (
            <p className="text-xs text-[var(--color-ink-soft)] italic">{result.notes}</p>
          )}

          {/* Content */}
          <div className="relative">
            <div className="p-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto font-[system-ui]">
              {result.content_markdown}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCoverPdf}
              className="px-3 py-1.5 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded font-medium hover:bg-[var(--color-brand-bg)]"
            >
              Download {result.pdf_extension.toUpperCase()}
            </button>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-white border border-[var(--color-border)] text-sm rounded font-medium hover:bg-[var(--color-bg)]"
            >
              {copied ? "Copied ✓" : "Copy text"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Interview Prep tab ──────────────────────────────────────────────

function InterviewPrepTab({
  jobId, onUpgrade,
}: {
  jobId: string;
  onUpgrade: (feature: string) => void;
}) {
  const [result, setResult] = useState<InterviewPrepOut | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await api.interviewPrep(jobId);
      setResult(r);
      setOpenIdx(0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) onUpgrade("interview prep");
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const TYPE_COLOR: Record<string, string> = {
    behavioral:  "bg-blue-50 text-blue-700 border-blue-200",
    technical:   "bg-purple-50 text-purple-700 border-purple-200",
    situational: "bg-amber-50 text-amber-700 border-amber-200",
    motivational:"bg-green-50 text-green-700 border-green-200",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ink-soft)]">
        AI-generated questions based on the JD + your experience — with answer frameworks.
        <span className="ml-1 text-xs bg-[var(--color-brand-bg)] text-[var(--color-brand)] px-1.5 py-0.5 rounded font-medium">
          Pro
        </span>
      </p>

      <button
        onClick={generate}
        disabled={busy}
        className="px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded-lg font-medium disabled:opacity-50 hover:opacity-90"
      >
        {busy ? "Generating…" : result ? "Regenerate questions" : "Generate prep questions"}
      </button>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {result && (
        <div className="space-y-4">
          {/* Strengths + talking points */}
          {result.strengths.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1.5">
                Your strengths to emphasise
              </p>
              <ul className="space-y-0.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-green-900 flex gap-2">
                    <span>✓</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.gaps_to_address.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">
                Gaps to address proactively
              </p>
              <ul className="space-y-0.5">
                {result.gaps_to_address.map((g, i) => (
                  <li key={i} className="text-sm text-amber-900 flex gap-2">
                    <span>→</span><span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions accordion */}
          <div>
            <p className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-2">
              Questions ({result.questions.length})
            </p>
            <div className="space-y-2">
              {result.questions.map((q, i) => {
                const colorCls = TYPE_COLOR[q.type] ?? "bg-gray-50 text-gray-700 border-gray-200";
                const isOpen = openIdx === i;
                return (
                  <div
                    key={i}
                    className="border border-[var(--color-border)] rounded-lg overflow-hidden"
                  >
                    <button
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[var(--color-bg)] transition-colors"
                      onClick={() => setOpenIdx(isOpen ? null : i)}
                    >
                      <span className="text-[var(--color-ink-soft)] text-sm mt-0.5 shrink-0">
                        {isOpen ? "▼" : "▶"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono font-semibold">Q{i + 1}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium capitalize ${colorCls}`}>
                            {q.type}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--color-ink)] leading-snug">
                          {q.question}
                        </p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg)] space-y-3">
                        {q.why_asked && (
                          <div>
                            <p className="text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide mb-1">
                              Why they ask this
                            </p>
                            <p className="text-sm text-[var(--color-ink-soft)]">{q.why_asked}</p>
                          </div>
                        )}
                        {q.suggested_approach && (
                          <div>
                            <p className="text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide mb-1">
                              Suggested approach
                            </p>
                            <p className="text-sm text-[var(--color-ink)]">{q.suggested_approach}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {result.talking_points.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-[var(--color-ink-soft)] select-none">
                Talking points to weave in
              </summary>
              <ul className="mt-2 space-y-1 ml-4 list-disc text-[var(--color-ink-soft)]">
                {result.talking_points.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Score circle ────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48">
      <circle cx={24} cy={24} r={r} fill="none" stroke="#E5E7EB" strokeWidth={4} />
      <circle
        cx={24} cy={24} r={r} fill="none"
        stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x={24} y={28} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {score}
      </text>
    </svg>
  );
}

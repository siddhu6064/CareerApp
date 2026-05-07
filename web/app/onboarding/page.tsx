"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Field, Level, RemoteType } from "@/lib/types";

const FIELDS: Field[] = [
  "Engineering", "Data", "Design", "Product",
  "Marketing", "Sales", "Operations", "Finance", "Other",
];
const LEVELS: { value: Level; label: string }[] = [
  { value: "intern",    label: "Intern"     },
  { value: "entry",     label: "Entry"      },
  { value: "mid",       label: "Mid"        },
  { value: "senior",    label: "Senior"     },
  { value: "staff",     label: "Staff"      },
  { value: "principal", label: "Principal"  },
  { value: "any",       label: "Any"        },
];
const REMOTE_OPTIONS: { value: RemoteType; label: string }[] = [
  { value: "remote",  label: "Remote only"  },
  { value: "hybrid",  label: "Hybrid"       },
  { value: "onsite",  label: "Onsite only"  },
  { value: "any",     label: "No preference"},
];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const setMaster = useStore((s) => s.setMaster);

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 1 — resume
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  // Step 2 — preferences
  const [field, setField] = useState<Field | "">("");
  const [level, setLevel] = useState<Level | "">("");
  const [remotePref, setRemotePref] = useState<RemoteType | "">("");
  const [location, setLocation] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr(null); setUploadMsg(null);
    try {
      const r = await api.uploadResume(f);
      setUploadMsg(`Parsed ${r.skills_count} skills, ${r.experience_count} roles via ${r.parse_method}.`);
      const fresh = await api.masterResume();
      setMaster(fresh);
      setUploaded(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function savePrefs() {
    setBusy(true); setErr(null);
    try {
      await api.updatePreferences({
        field: field || null,
        level: level || null,
        location: location.trim() || null,
        remote_pref: remotePref || null,
      });
      setStep(3);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="min-h-screen bg-[var(--color-surface)] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo / brand */}
        <p className="text-center text-2xl font-bold text-[var(--color-brand)] mb-8">
          [AppName]
        </p>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--color-ink-soft)] mb-1.5">
            <span>Step {step} of 3</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-brand)] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-sm p-8">
          {/* ── Step 1: Upload resume ──────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Add your resume</h1>
                <p className="text-sm text-[var(--color-ink-soft)] mt-1">
                  Upload a PDF, DOCX, or TXT — Claude will parse it and fill your master resume.
                </p>
              </div>

              <label
                className={`
                  flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl
                  cursor-pointer transition-colors
                  ${uploaded
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-[var(--color-border)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-bg)]"
                  }
                `}
              >
                <span className="text-3xl">{uploaded ? "✅" : "📄"}</span>
                <span className="text-sm font-medium">
                  {uploaded ? "Resume uploaded!" : "Click to upload or drag & drop"}
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">PDF, DOCX, TXT · max 5 MB</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  onChange={handleFile}
                  disabled={busy}
                  className="sr-only"
                />
              </label>

              {busy && <p className="text-sm text-[var(--color-ink-soft)]">Parsing with Claude…</p>}
              {uploadMsg && <p className="text-sm text-emerald-700">{uploadMsg}</p>}
              {err && <p className="text-sm text-red-600">{err}</p>}

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] underline"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={busy}
                  className="px-5 py-2 bg-[var(--color-brand)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Preferences ────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Set your preferences</h1>
                <p className="text-sm text-[var(--color-ink-soft)] mt-1">
                  We use these to rank and filter your daily job digest.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-2">
                  Field / Discipline
                </label>
                <div className="flex flex-wrap gap-2">
                  {FIELDS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setField(field === f ? "" : f)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        field === f
                          ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                          : "bg-white text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-brand)]"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
                    Level
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as Level | "")}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent"
                  >
                    <option value="">Any level</option>
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
                    Remote preference
                  </label>
                  <select
                    value={remotePref}
                    onChange={(e) => setRemotePref(e.target.value as RemoteType | "")}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent"
                  >
                    <option value="">No preference</option>
                    {REMOTE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
                  Location (optional)
                </label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent"
                />
              </div>

              {err && <p className="text-sm text-red-600">{err}</p>}

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  ← Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(3)}
                    className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] underline"
                  >
                    Skip
                  </button>
                  <button
                    onClick={savePrefs}
                    disabled={busy}
                    className="px-5 py-2 bg-[var(--color-brand)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  >
                    {busy ? "Saving…" : "Save & continue →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="text-5xl">🎉</div>
              <div>
                <h1 className="text-xl font-semibold">You&apos;re all set!</h1>
                <p className="text-sm text-[var(--color-ink-soft)] mt-2">
                  Your job feed is ready. We&apos;ll send your first digest tomorrow morning
                  with jobs matched to your preferences.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2">
                <button
                  onClick={() => router.push("/jobs")}
                  className="w-full px-5 py-3 bg-[var(--color-brand)] text-white rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Browse jobs →
                </button>
                <button
                  onClick={() => router.push("/resume")}
                  className="w-full px-5 py-2.5 bg-white border border-[var(--color-border)] text-sm rounded-lg hover:bg-[var(--color-surface)]"
                >
                  Review my resume
                </button>
              </div>
            </div>
          )}
        </div>

        {step !== 3 && (
          <p className="text-center text-xs text-[var(--color-ink-soft)] mt-4">
            You can always update these in{" "}
            <button onClick={() => router.push("/settings")} className="underline">
              Settings
            </button>.
          </p>
        )}
      </div>
    </div>
  );
}

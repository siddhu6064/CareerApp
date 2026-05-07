"use client";

import { useState } from "react";

const APP_VERSION = "0.1.0";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"about" | "credits" | "licenses">("about");

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-ink)]">AppName</h2>
            <p className="text-xs text-[var(--color-ink-soft)] font-mono">
              v{APP_VERSION}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <nav className="flex gap-2 border-b border-[var(--color-border)] mb-4">
          {(["about", "credits", "licenses"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px capitalize ${
                tab === t
                  ? "border-[var(--color-brand)] text-[var(--color-brand)] font-medium"
                  : "border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "about" && (
          <div className="space-y-3 text-sm">
            <p>
              AppName is a desktop job-search app: scrapes free public ATS
              boards, tailors resumes per job with your own Anthropic key,
              tracks applications through 8 stages, and generates ATS-optimised
              PDFs.
            </p>
            <p className="text-[var(--color-ink-soft)]">
              Same backend as the SaaS, no subscription. Your data stays in{" "}
              <code className="text-xs">~/.appname/data.db</code>.
            </p>
            <div className="pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-ink-soft)]">
              © 2026 AppName · MIT-derived open source
            </div>
          </div>
        )}

        {tab === "credits" && (
          <div className="space-y-3 text-sm">
            <p>Built on the shoulders of these projects:</p>
            <ul className="space-y-2">
              <li>
                <strong>JustHireMe</strong> by{" "}
                <a
                  href="https://github.com/vasu-devs/justhireme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-brand)] hover:underline"
                >
                  vasu-devs
                </a>
                <br />
                <span className="text-xs text-[var(--color-ink-soft)]">
                  quality-gate scoring, lead intel, source patterns, Tauri sidecar architecture
                </span>
              </li>
              <li>
                <strong>career-ops</strong>
                <br />
                <span className="text-xs text-[var(--color-ink-soft)]">
                  8-stage tracker pipeline + status-history schema
                </span>
              </li>
              <li>
                <strong>ai-resume-analyzer</strong>
                <br />
                <span className="text-xs text-[var(--color-ink-soft)]">
                  ATS keyword extraction + resume tailor system prompt
                </span>
              </li>
            </ul>
            <p className="text-xs text-[var(--color-ink-soft)] pt-2 border-t border-[var(--color-border)]">
              Tauri · Next.js · FastAPI · React · Tailwind · Anthropic SDK ·
              WeasyPrint · APScheduler · SQLite
            </p>
          </div>
        )}

        {tab === "licenses" && (
          <div className="space-y-3 text-sm">
            <p>
              All open-source dependencies and their licenses are bundled with
              the app under{" "}
              <code className="text-xs">/Applications/AppName.app/Contents/Resources/LICENSES/</code>{" "}
              (or equivalent on Windows/Linux).
            </p>
            <p>Direct attributions:</p>
            <ul className="space-y-1 text-xs ml-4 list-disc">
              <li>JustHireMe — MIT (vasu-devs, 2024)</li>
              <li>career-ops — MIT</li>
              <li>ai-resume-analyzer — MIT</li>
              <li>Tauri 2 — MIT/Apache-2.0</li>
              <li>Next.js — MIT (Vercel)</li>
              <li>FastAPI — MIT (Tiangolo)</li>
              <li>React — MIT (Meta)</li>
              <li>WeasyPrint — BSD-3</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

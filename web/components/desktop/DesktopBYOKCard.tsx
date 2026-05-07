"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { SettingsKeys, SettingsValidateResult } from "@/lib/types";

type ValidateState = SettingsValidateResult | null;

/** Renders only in desktop mode. Detects via Tauri-injected localStorage URL. */
function isDesktopMode(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem("appname_api_url"));
}

export function DesktopBYOKCard() {
  const [show, setShow] = useState(false);
  const [keys, setKeys] = useState<SettingsKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [anthropicInput, setAnthropicInput] = useState("");
  const [githubInput, setGithubInput] = useState("");

  // Validate state
  const [validation, setValidation] = useState<ValidateState>(null);
  const [validating, setValidating] = useState(false);

  // Manual fetch
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  useEffect(() => {
    setShow(isDesktopMode());
  }, []);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    setBusy(true);
    api.settingsKeys()
      .then((k) => alive && setKeys(k))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          // Not desktop after all — hide.
          setShow(false);
        } else if (alive) {
          setErr((e as Error).message);
        }
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [show]);

  if (!show) return null;

  async function refresh() {
    try {
      setKeys(await api.settingsKeys());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveAnthropic() {
    if (!anthropicInput.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.putAnthropicKey(anthropicInput.trim());
      setAnthropicInput("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearAnthropic() {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteAnthropicKey();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveGithub() {
    if (!githubInput.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.putGithubToken(githubInput.trim());
      setGithubInput("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearGithub() {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteGithubToken();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function validateAll() {
    setValidating(true);
    setValidation(null);
    setErr(null);
    try {
      setValidation(await api.validateKeys());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setValidating(false);
    }
  }

  async function fetchNow() {
    setFetchBusy(true);
    setFetchResult(null);
    setErr(null);
    try {
      const res = await api.fetchJobsNow([]);
      setFetchResult(
        `Fetched ${res.fetched} · inserted ${res.inserted} · skipped ${res.skipped} · expired ${res.expired_marked}`,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFetchBusy(false);
    }
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6 space-y-5">
      <div>
        <h2 className="font-semibold">API keys (BYOK)</h2>
        <p className="text-xs text-[var(--color-ink-soft)] mt-1">
          Desktop mode runs against your own Anthropic + GitHub keys. Stored
          locally in <code>~/.appname/data.db</code>. Never sent to our servers.
        </p>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Anthropic */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Anthropic API key</p>
          {keys?.anthropic.set ? (
            <span className="text-xs text-emerald-700">
              ✓ set ({keys.anthropic.key_preview})
            </span>
          ) : (
            <span className="text-xs text-amber-700">not set</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="sk-ant-api03-…"
            value={anthropicInput}
            onChange={(e) => setAnthropicInput(e.target.value)}
            disabled={busy}
            className="flex-1 px-2 py-1.5 text-sm border border-[var(--color-border)] rounded font-mono disabled:bg-gray-100"
          />
          <button
            onClick={saveAnthropic}
            disabled={busy || !anthropicInput.trim()}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
          >
            Save
          </button>
          {keys?.anthropic.set && (
            <button
              onClick={clearAnthropic}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50 text-[var(--color-ink-soft)] hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Get a key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-brand)] hover:underline"
          >
            console.anthropic.com
          </a>
          . You'll be billed by Anthropic directly. Tailoring 1 resume ≈ $0.05.
        </p>
      </div>

      {/* GitHub */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">GitHub token (optional)</p>
          {keys?.github.set ? (
            <span className="text-xs text-emerald-700">
              ✓ set ({keys.github.key_preview})
            </span>
          ) : (
            <span className="text-xs text-[var(--color-ink-soft)]">not set</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="ghp_… or github_pat_…"
            value={githubInput}
            onChange={(e) => setGithubInput(e.target.value)}
            disabled={busy}
            className="flex-1 px-2 py-1.5 text-sm border border-[var(--color-border)] rounded font-mono disabled:bg-gray-100"
          />
          <button
            onClick={saveGithub}
            disabled={busy || !githubInput.trim()}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
          >
            Save
          </button>
          {keys?.github.set && (
            <button
              onClick={clearGithub}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50 text-[var(--color-ink-soft)] hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Used by the GitHub profile importer. Read-only scopes are enough:
          <code> read:user</code>, <code> public_repo</code>.
        </p>
      </div>

      {/* Validate */}
      <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
        <button
          onClick={validateAll}
          disabled={validating || busy}
          className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50 disabled:opacity-40"
        >
          {validating ? "Validating…" : "Validate keys"}
        </button>
        {validation && (
          <ul className="space-y-1 text-sm">
            <li
              className={
                validation.anthropic.ok
                  ? "text-emerald-700"
                  : "text-red-700"
              }
            >
              Anthropic:{" "}
              {validation.anthropic.ok
                ? `✓ OK (${validation.anthropic.model})`
                : `✗ ${validation.anthropic.error}`}
            </li>
            <li
              className={
                validation.github.ok ? "text-emerald-700" : "text-[var(--color-ink-soft)]"
              }
            >
              GitHub:{" "}
              {validation.github.ok
                ? `✓ OK (@${validation.github.login})`
                : validation.github.error}
            </li>
          </ul>
        )}
      </div>

      {/* Manual fetch */}
      <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Job feed</p>
          <button
            onClick={fetchNow}
            disabled={fetchBusy}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
          >
            {fetchBusy ? "Fetching…" : "Fetch jobs now"}
          </button>
        </div>
        {fetchResult && (
          <p className="text-xs text-emerald-700">{fetchResult}</p>
        )}
        <p className="text-xs text-[var(--color-ink-soft)]">
          Daily fetch runs automatically at 6:00 your local time. Use this
          button to trigger an immediate refresh.
        </p>
      </div>
    </section>
  );
}

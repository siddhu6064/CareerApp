"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { DesktopBYOKCard } from "@/components/desktop/DesktopBYOKCard";
import type { Field, Level, RemoteType } from "@/lib/types";

interface Prefs {
  digest_enabled: boolean;
  push_enabled: boolean;
  digest_count: number;
  digest_hour_utc: number;
  timezone: string;
}

interface UserPrefs {
  field: string | null;
  level: string | null;
  location: string | null;
  remote_pref: string | null;
}

const FIELDS: Field[] = [
  "Engineering", "Data", "Design", "Product",
  "Marketing", "Sales", "Operations", "Finance", "Other",
];
const LEVELS: Level[] = ["intern", "entry", "mid", "senior", "staff", "principal", "any"];
const REMOTE_OPTS: { value: RemoteType; label: string }[] = [
  { value: "remote",  label: "Remote" },
  { value: "hybrid",  label: "Hybrid" },
  { value: "onsite",  label: "Onsite" },
  { value: "any",     label: "Any"    },
];

export default function SettingsPage() {
  const authed = useStore((s) => s.authed);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(true);
  const [savingId, setSavingId] = useState<keyof Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<keyof Prefs | null>(null);

  // Job preferences state
  const [userPrefs, setUserPrefs] = useState<UserPrefs>({ field: null, level: null, location: null, remote_pref: null });
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsFlash, setPrefsFlash] = useState(false);
  const [prefsErr, setPrefsErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    setBusy(true);
    Promise.all([
      api.notificationPrefs(),
      api.me(),
    ])
      .then(([p, me]) => {
        setPrefs(p);
        setUserPrefs({ field: me.field, level: me.level, location: me.location, remote_pref: me.remote_pref });
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [authed]);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingId(key);
    setErr(null);
    try {
      const updated = await api.updateNotificationPrefs({ [key]: value } as Partial<Prefs>);
      setPrefs(updated);
      setSavedFlash(key);
      setTimeout(() => setSavedFlash(null), 1500);
    } catch (e) {
      setPrefs(before);
      setErr((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function saveUserPrefs() {
    setPrefsBusy(true); setPrefsErr(null);
    try {
      const updated = await api.updatePreferences(userPrefs);
      setUserPrefs({ field: updated.field, level: updated.level, location: updated.location, remote_pref: updated.remote_pref });
      setPrefsFlash(true);
      setTimeout(() => setPrefsFlash(false), 1500);
    } catch (e) {
      setPrefsErr((e as Error).message);
    } finally {
      setPrefsBusy(false);
    }
  }

  if (!authed) return null;
  if (busy) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (!prefs) return <p className="text-sm text-red-600">{err ?? "Couldn't load settings."}</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Phase 10: shows only in desktop mode (Tauri-injected api_url) */}
      <DesktopBYOKCard />

      {/* ── Job Preferences ──────────────────────────────────────── */}
      <section className="bg-white border border-[var(--color-border)] rounded-lg p-6 space-y-5">
        <h2 className="font-semibold">Job preferences</h2>
        <p className="text-xs text-[var(--color-ink-soft)] -mt-3">
          Used to rank your daily digest and filter job suggestions.
        </p>

        <div>
          <p className="text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-2">Field</p>
          <div className="flex flex-wrap gap-2">
            {FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setUserPrefs((p) => ({ ...p, field: p.field === f ? null : f }))}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  userPrefs.field === f
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
              value={userPrefs.level ?? ""}
              onChange={(e) => setUserPrefs((p) => ({ ...p, level: e.target.value || null }))}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            >
              <option value="">Any</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
              Remote
            </label>
            <select
              value={userPrefs.remote_pref ?? ""}
              onChange={(e) => setUserPrefs((p) => ({ ...p, remote_pref: e.target.value || null }))}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            >
              <option value="">No preference</option>
              {REMOTE_OPTS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-ink-soft)] uppercase tracking-wide mb-1.5">
            Location
          </label>
          <input
            value={userPrefs.location ?? ""}
            onChange={(e) => setUserPrefs((p) => ({ ...p, location: e.target.value || null }))}
            placeholder="e.g. San Francisco, CA"
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
          />
        </div>

        {prefsErr && <p className="text-sm text-red-600">{prefsErr}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={saveUserPrefs}
            disabled={prefsBusy}
            className="px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded-lg font-medium disabled:opacity-50 hover:opacity-90"
          >
            {prefsBusy ? "Saving…" : "Save preferences"}
          </button>
          {prefsFlash && <span className="text-sm text-green-700">✓ Saved</span>}
        </div>
      </section>

      {/* ── Daily digest ─────────────────────────────────────────── */}
      <section className="bg-white border border-[var(--color-border)] rounded-lg p-6 space-y-4">
        <h2 className="font-semibold">Daily digest email</h2>

        <Toggle
          label="Send me a daily digest"
          help="Top jobs each morning. Free tier hides match quality scores."
          value={prefs.digest_enabled}
          saving={savingId === "digest_enabled"}
          flash={savedFlash === "digest_enabled"}
          onChange={(v) => update("digest_enabled", v)}
        />

        <NumberField
          label="Jobs per digest"
          value={prefs.digest_count}
          min={1} max={20}
          saving={savingId === "digest_count"}
          flash={savedFlash === "digest_count"}
          disabled={!prefs.digest_enabled}
          onCommit={(v) => update("digest_count", v)}
        />

        <SelectField
          label="Send time (UTC)"
          value={String(prefs.digest_hour_utc)}
          saving={savingId === "digest_hour_utc"}
          flash={savedFlash === "digest_hour_utc"}
          disabled={!prefs.digest_enabled}
          options={Array.from({ length: 24 }, (_, h) => ({
            value: String(h),
            label: `${String(h).padStart(2, "0")}:15 UTC`,
          }))}
          onChange={(v) => update("digest_hour_utc", Number(v))}
        />
      </section>

      <section className="bg-white border border-[var(--color-border)] rounded-lg p-6 space-y-4">
        <h2 className="font-semibold">Push notifications (mobile)</h2>

        <Toggle
          label="Send me push notifications"
          help="Interview reminders 24h ahead, follow-up reminders, and stale application alerts. Requires the mobile app."
          value={prefs.push_enabled}
          saving={savingId === "push_enabled"}
          flash={savedFlash === "push_enabled"}
          onChange={(v) => update("push_enabled", v)}
        />
      </section>

      <p className="text-xs text-[var(--color-ink-soft)]">
        Changes save automatically. Updated{" "}
        {prefs && new Date((prefs as Prefs & { updated_at: string }).updated_at).toLocaleString()}.
      </p>
    </div>
  );
}

function Toggle({
  label, help, value, saving, flash, onChange,
}: {
  label: string; help?: string;
  value: boolean; saving: boolean; flash: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-ink)]">{label}</p>
        {help && <p className="text-xs text-[var(--color-ink-soft)] mt-1">{help}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {flash && <span className="text-xs text-green-700">✓ Saved</span>}
        <button
          role="switch"
          aria-checked={value}
          disabled={saving}
          onClick={() => onChange(!value)}
          className={`relative w-11 h-6 rounded-full transition ${
            value ? "bg-[var(--color-brand)]" : "bg-gray-300"
          } ${saving ? "opacity-50" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${
              value ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label, value, min, max, saving, flash, disabled, onCommit,
}: {
  label: string; value: number; min: number; max: number;
  saving: boolean; flash: boolean; disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);

  function commit() {
    const n = Number(local);
    if (!Number.isFinite(n) || n < min || n > max) {
      setLocal(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        {flash && <span className="text-xs text-green-700">✓</span>}
        <input
          type="number"
          min={min} max={max}
          value={local}
          disabled={disabled || saving}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-20 px-2 py-1 text-sm border border-[var(--color-border)] rounded text-right disabled:bg-gray-100"
        />
      </div>
    </div>
  );
}

function SelectField({
  label, value, options, saving, flash, disabled, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  saving: boolean; flash: boolean; disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        {flash && <span className="text-xs text-green-700">✓</span>}
        <select
          value={value}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1 text-sm border border-[var(--color-border)] rounded bg-white disabled:bg-gray-100"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

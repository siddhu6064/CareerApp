"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { CoachBranding } from "@/lib/types";
import { CoachGateModal } from "@/components/coach/CoachGateModal";

export default function CoachBrandingPage() {
  const authed = useStore((s) => s.authed);
  const [branding, setBranding] = useState<CoachBranding | null>(null);
  const [color, setColor] = useState<string>("#5B21B6");
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    api.coachGetBranding()
      .then((b) => {
        setBranding(b);
        if (b.brand_color) setColor(b.brand_color);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) setGated(true);
        else setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [authed]);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setFlash(null);
    try {
      const { logo_path } = await api.coachUploadLogo(f);
      const updated = await api.coachPutBranding({ logo_path, brand_color: color });
      setBranding(updated);
      setFlash("Logo uploaded.");
    } catch (e) {
      setFlash(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveColor() {
    setSaving(true);
    setFlash(null);
    try {
      const updated = await api.coachPutBranding({
        logo_path: branding?.logo_path ?? null,
        brand_color: color,
      });
      setBranding(updated);
      setFlash("Saved.");
    } catch (e) {
      setFlash(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function clearLogo() {
    setSaving(true);
    setFlash(null);
    try {
      const updated = await api.coachPutBranding({
        logo_path: null,
        brand_color: branding?.brand_color ?? null,
      });
      setBranding(updated);
      setFlash("Logo removed.");
    } catch (e) {
      setFlash(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!authed) return <p>Sign in to continue.</p>;
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (gated) return <CoachGateModal />;
  if (err) return <p className="text-red-600">{err}</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <Link href="/coach" className="text-xs text-[var(--color-brand)] hover:underline">
          ← Back to clients
        </Link>
        <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-1">
          White-label branding
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          Logo + brand color appear on every PDF you generate for clients.
        </p>
      </header>

      {flash && (
        <div className="text-sm border border-[var(--color-border)] bg-emerald-50 text-emerald-800 rounded px-3 py-2">
          {flash}
        </div>
      )}

      {/* Logo */}
      <section className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-3">
        <h2 className="font-semibold text-[var(--color-ink)]">Logo</h2>
        {branding?.logo_url ? (
          <div className="flex items-center gap-4">
            <img
              src={branding.logo_url}
              alt="Brand logo"
              className="h-12 max-w-[200px] object-contain border border-[var(--color-border)] rounded"
            />
            <button
              onClick={clearLogo}
              disabled={saving}
              className="text-xs text-[var(--color-ink-soft)] hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">No logo set.</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={uploadLogo}
          disabled={saving}
          className="text-sm"
        />
        <p className="text-xs text-[var(--color-ink-soft)]">
          PNG, JPG, or SVG · 1 MB max · Renders ~28pt tall on the PDF header.
        </p>
      </section>

      {/* Color */}
      <section className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-3">
        <h2 className="font-semibold text-[var(--color-ink)]">Brand color</h2>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 border border-[var(--color-border)] rounded cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 border border-[var(--color-border)] rounded px-2 py-1.5 font-mono text-sm"
            placeholder="#5B21B6"
          />
          <button
            onClick={saveColor}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Preview */}
      <section className="border border-[var(--color-border)] rounded-lg bg-white p-4">
        <h2 className="font-semibold text-[var(--color-ink)] mb-3">Preview</h2>
        <div className="bg-gray-50 rounded p-6 space-y-4 text-sm">
          {branding?.logo_url && (
            <div
              className="flex justify-end pb-2 border-b-2"
              style={{ borderColor: color }}
            >
              <img
                src={branding.logo_url}
                alt=""
                className="h-7 max-w-[180px] object-contain"
              />
            </div>
          )}
          <h1
            className="text-2xl font-bold"
            style={{ color }}
          >
            Sample Candidate
          </h1>
          <div className="text-xs text-gray-600">
            sample@example.com · linkedin.com/in/sample
          </div>
          <div>
            <h2
              className="text-xs uppercase tracking-wider font-bold border-b pb-1"
              style={{ color, borderColor: color }}
            >
              Experience
            </h2>
            <p className="text-xs mt-2">
              <strong>Senior Engineer</strong> · Acme · 2022–Present
            </p>
            <p className="text-xs text-gray-600 italic">
              Bullet points go here.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { MasterResume } from "@/lib/types";

export default function ResumePage() {
  const authed = useStore((s) => s.authed);
  const master = useStore((s) => s.master);
  const setMaster = useStore((s) => s.setMaster);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) return;
    api.masterResume()
      .then(setMaster)
      .catch((e: ApiError) => {
        if (e.status !== 404) setErr(e.message);
      });
  }, [authed, setMaster]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.uploadResume(f);
      setMsg(
        `Parsed via ${r.parse_method}: ${r.skills_count} skills, ${r.experience_count} experience entries.`,
      );
      const fresh = await api.masterResume();
      setMaster(fresh);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!authed) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Master Resume</h1>

      <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
        <h2 className="font-semibold mb-2">Upload</h2>
        <p className="text-sm text-[var(--color-ink-soft)] mb-3">
          Upload a TXT, PDF, or DOCX (under 5 MB). Each upload becomes the new
          active master — older versions are preserved.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          onChange={onFile}
          disabled={busy}
          className="block text-sm"
        />
        {busy && <p className="text-sm mt-2 text-[var(--color-ink-soft)]">Parsing…</p>}
        {msg && <p className="text-sm mt-2 text-green-700">{msg}</p>}
        {err && <p className="text-sm mt-2 text-red-600">{err}</p>}
      </section>

      {master && <ResumeView resume={master} onSaved={setMaster} />}

      {!master && !busy && !err && (
        <p className="text-sm text-[var(--color-ink-soft)]">
          No master resume yet. Upload one above.
        </p>
      )}
    </div>
  );
}

function ResumeView({
  resume, onSaved,
}: {
  resume: MasterResume;
  onSaved: (m: MasterResume) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(resume.summary || "");
  const [skills, setSkills] = useState((resume.skills || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const updated = await api.putMasterResume({
        contact_info: resume.contact_info ?? undefined,
        summary,
        experience: resume.experience,
        education: resume.education,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        projects: resume.projects,
        certifications: resume.certifications,
      });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Active Resume</h2>
        <span className="text-xs text-[var(--color-ink-soft)]">
          parsed via {resume.parse_method || "?"} ·{" "}
          {new Date(resume.created_at).toLocaleDateString()}
        </span>
      </div>

      {resume.contact_info && (
        <div className="mb-4 text-sm">
          <p className="font-medium">{resume.contact_info.name || "—"}</p>
          <p className="text-[var(--color-ink-soft)]">
            {[
              resume.contact_info.email,
              resume.contact_info.phone,
              resume.contact_info.location,
            ].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[var(--color-ink-soft)]">
            {[resume.contact_info.linkedin, resume.contact_info.github, resume.contact_info.website]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
      )}

      <div className="space-y-3 text-sm">
        <Field label="Summary">
          {editing ? (
            <textarea
              className={editCls + " min-h-[80px]"}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          ) : (
            <p>{resume.summary || <em className="text-[var(--color-ink-soft)]">empty</em>}</p>
          )}
        </Field>

        <Field label={`Skills (${(resume.skills || []).length})`}>
          {editing ? (
            <input
              className={editCls}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="comma-separated"
            />
          ) : (
            <p>{resume.skills?.length ? resume.skills.join(", ") : <em className="text-[var(--color-ink-soft)]">empty</em>}</p>
          )}
        </Field>

        {resume.experience && resume.experience.length > 0 && (
          <Field label={`Experience (${resume.experience.length})`}>
            <ul className="space-y-2">
              {resume.experience.map((e, i) => (
                <li key={i}>
                  <p className="font-medium">{e.role} — {e.company}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{e.period}</p>
                  {e.description && <p className="text-xs mt-1">{e.description}</p>}
                </li>
              ))}
            </ul>
          </Field>
        )}
      </div>

      {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

      <div className="flex gap-2 mt-4">
        {editing ? (
          <>
            <button
              onClick={save}
              disabled={busy}
              className="px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setSummary(resume.summary || ""); setSkills((resume.skills || []).join(", ")); }}
              className="px-4 py-2 bg-white border border-[var(--color-border)] text-sm rounded"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-sm rounded font-medium hover:bg-[var(--color-brand-bg)]"
          >
            Edit summary &amp; skills
          </button>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)] mb-1">{label}</p>
      {children}
    </div>
  );
}

const editCls = "w-full px-3 py-2 border border-[var(--color-border)] rounded text-sm";

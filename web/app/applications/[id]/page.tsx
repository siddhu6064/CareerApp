"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
  type Interview,
  type RecruiterContact,
  type SalaryDetails,
} from "@/lib/types";

export default function ApplicationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const authed = useStore((s) => s.authed);
  const patchInStore = useStore((s) => s.patchApplication);

  const [appId, setAppId] = useState<string | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [contacts, setContacts] = useState<RecruiterContact[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [salary, setSalary] = useState<SalaryDetails[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    props.params.then((p) => setAppId(p.id));
  }, [props.params]);

  useEffect(() => {
    if (!authed || !appId) return;
    setBusy(true);
    Promise.all([
      api.application(appId),
      api.contacts(appId),
      api.interviews(appId),
      api.salary(appId),
    ])
      .then(([a, c, i, s]) => {
        setApp(a);
        setContacts(c);
        setInterviews(i);
        setSalary(s);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [authed, appId]);

  async function moveTo(status: ApplicationStatus) {
    if (!app) return;
    const before = app.status;
    setApp({ ...app, status });
    patchInStore(app.id, { status });
    try {
      const updated = await api.updateApplication(app.id, { status });
      setApp(updated);
      patchInStore(app.id, updated);
    } catch (e) {
      setApp({ ...app, status: before });
      patchInStore(app.id, { status: before });
      setErr((e as Error).message);
    }
  }

  async function saveNotes(notes: string) {
    if (!app) return;
    try {
      const updated = await api.updateApplication(app.id, { notes });
      setApp(updated);
      patchInStore(app.id, updated);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function deleteApp() {
    if (!app) return;
    if (!confirm(`Delete "${app.title} @ ${app.company}"?`)) return;
    try {
      await api.deleteApplication(app.id);
      router.push("/tracker");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!authed) return null;
  if (busy) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (err && !app) return <p className="text-sm text-red-600">{err}</p>;
  if (!app) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/tracker" className="text-sm text-[var(--color-brand)] hover:underline">
        ← Tracker
      </Link>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Header */}
      <header className="bg-white border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{app.title}</h1>
            <p className="text-[var(--color-ink-soft)]">
              {app.company}
              {app.platform ? ` · via ${app.platform}` : ""}
            </p>
          </div>
          <button
            onClick={deleteApp}
            className="text-sm text-[var(--color-ink-soft)] hover:text-red-600 px-2 py-1"
          >
            Delete
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={app.status} />
          {app.applied_at && (
            <span className="text-xs text-[var(--color-ink-soft)]">
              Applied {new Date(app.applied_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Pipeline picker */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {APPLICATION_STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => moveTo(st)}
              disabled={st === app.status}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                st === app.status
                  ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)] cursor-default"
                  : "bg-white border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
              }`}
            >
              {STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </header>

      {/* Notes */}
      <NotesCard initial={app.notes ?? ""} onSave={saveNotes} />

      {/* Status history */}
      {app.status_history.length > 1 && (
        <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
          <h2 className="font-semibold mb-3">Status history</h2>
          <ol className="relative border-l-2 border-[var(--color-border)] ml-2 space-y-3">
            {app.status_history.map((h, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-[var(--color-brand)]" />
                <p className="text-sm">
                  <strong>{STATUS_LABEL[h.status]}</strong>
                  <span className="text-xs text-[var(--color-ink-soft)] ml-2">
                    {new Date(h.changed_at).toLocaleString()}
                  </span>
                </p>
                {h.note && <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">{h.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Contacts */}
      <ContactsSection
        appId={app.id}
        contacts={contacts}
        onChange={setContacts}
        onError={setErr}
      />

      {/* Interviews */}
      <InterviewsSection
        appId={app.id}
        interviews={interviews}
        onChange={setInterviews}
        onError={setErr}
      />

      {/* Salary */}
      <SalarySection
        appId={app.id}
        items={salary}
        onChange={setSalary}
        onError={setErr}
      />
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────
function NotesCard({
  initial, onSave,
}: { initial: string; onSave: (s: string) => Promise<void> }) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(val);
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <h2 className="font-semibold mb-3">Notes</h2>
      <form onSubmit={submit}>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded text-sm"
          placeholder="Recruiter pitch, comp signal, prep links, anything else…"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-[var(--color-ink-soft)]">
            {savedAt ? "✓ Saved" : ""}
          </span>
          <button
            type="submit"
            disabled={saving || val === initial}
            className="px-3 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save notes"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Contacts ─────────────────────────────────────────────────────
function ContactsSection({
  appId, contacts, onChange, onError,
}: {
  appId: string;
  contacts: RecruiterContact[];
  onChange: (c: RecruiterContact[]) => void;
  onError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("recruiter");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName(""); setRole("recruiter"); setEmail("");
    setPhone(""); setLinkedin(""); setOpen(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); onError(null);
    try {
      const created = await api.addContact(appId, {
        name: name.trim(),
        role: role || undefined,
        email: email || undefined,
        phone: phone || undefined,
        linkedin_url: linkedin || undefined,
      });
      onChange([created, ...contacts]);
      reset();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">
          Contacts <span className="text-[var(--color-ink-soft)] font-normal">({contacts.length})</span>
        </h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-[var(--color-brand)] hover:underline"
        >
          {open ? "Cancel" : "+ Add contact"}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="space-y-2 mb-4 p-3 bg-[var(--color-bg)] rounded border border-[var(--color-border)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              autoFocus required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Name (required)" className={inputCls}
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              <option value="recruiter">Recruiter</option>
              <option value="hiring_manager">Hiring manager</option>
              <option value="interviewer">Interviewer</option>
              <option value="referrer">Referrer</option>
              <option value="other">Other</option>
            </select>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com" type="email" className={inputCls} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone" className={inputCls} />
            <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)}
              placeholder="LinkedIn URL" className={`${inputCls} md:col-span-2`} />
          </div>
          <button
            type="submit" disabled={busy || !name.trim()}
            className="px-3 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          No contacts yet. Recruiters and hiring managers go here.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {contacts.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {c.name}{" "}
                  {c.role && (
                    <span className="text-xs text-[var(--color-ink-soft)] font-normal">
                      · {c.role.replace("_", " ")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-ink-soft)] truncate">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              {c.linkedin_url && (
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--color-brand)] hover:underline shrink-0">
                  LinkedIn ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Interviews ───────────────────────────────────────────────────
function InterviewsSection({
  appId, interviews, onChange, onError,
}: {
  appId: string;
  interviews: Interview[];
  onChange: (i: Interview[]) => void;
  onError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState("phone_screen");
  const [scheduled, setScheduled] = useState("");
  const [duration, setDuration] = useState("");
  const [interviewers, setInterviewers] = useState("");
  const [location, setLocation] = useState("remote");
  const [busy, setBusy] = useState(false);

  function reset() {
    setRound("phone_screen"); setScheduled(""); setDuration("");
    setInterviewers(""); setLocation("remote"); setOpen(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); onError(null);
    try {
      const names = interviewers.split(",").map((s) => s.trim()).filter(Boolean);
      const created = await api.addInterview(appId, {
        round,
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : undefined,
        duration_min: duration ? Number(duration) : undefined,
        interviewer_names: names,
        location: location || undefined,
      });
      onChange([...interviews, created].sort(sortInterviews));
      reset();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setOutcome(id: string, outcome: string) {
    onError(null);
    // Optimistic update
    onChange(interviews.map((iv) => iv.id === id ? { ...iv, outcome } : iv));
    try {
      await api.updateInterview(appId, id, { outcome });
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">
          Interviews <span className="text-[var(--color-ink-soft)] font-normal">({interviews.length})</span>
        </h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-[var(--color-brand)] hover:underline"
        >
          {open ? "Cancel" : "+ Add interview"}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="space-y-2 mb-4 p-3 bg-[var(--color-bg)] rounded border border-[var(--color-border)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select value={round} onChange={(e) => setRound(e.target.value)} className={inputCls}>
              <option value="recruiter">Recruiter screen</option>
              <option value="phone_screen">Phone screen</option>
              <option value="technical">Technical</option>
              <option value="onsite">Onsite</option>
              <option value="final">Final</option>
            </select>
            <input
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className={inputCls}
            />
            <input
              type="number" min={5} max={480}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Duration (min)"
              className={inputCls}
            />
            <input
              value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="remote / Zoom / SF office"
              className={inputCls}
            />
            <input
              value={interviewers}
              onChange={(e) => setInterviewers(e.target.value)}
              placeholder="Interviewer names, comma-separated"
              className={`${inputCls} md:col-span-2`}
            />
          </div>
          <button
            type="submit" disabled={busy}
            className="px-3 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {interviews.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          No interviews scheduled. Add one to track prep + outcome.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {interviews.map((iv) => (
            <li key={iv.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{iv.round.replace("_", " ")}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {iv.scheduled_at && new Date(iv.scheduled_at).toLocaleString()}
                    {iv.duration_min && ` · ${iv.duration_min} min`}
                    {iv.location && ` · ${iv.location}`}
                  </p>
                  {iv.interviewer_names && iv.interviewer_names.length > 0 && (
                    <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">
                      with {iv.interviewer_names.join(", ")}
                    </p>
                  )}
                </div>
                <select
                  value={iv.outcome ?? "pending"}
                  onChange={(e) => setOutcome(iv.id, e.target.value)}
                  className="text-xs px-2 py-1 border border-[var(--color-border)] rounded"
                >
                  <option value="pending">Pending</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function sortInterviews(a: Interview, b: Interview): number {
  const aT = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
  const bT = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
  return aT - bT;
}

// ── Salary ───────────────────────────────────────────────────────
function SalarySection({
  appId, items, onChange, onError,
}: {
  appId: string;
  items: SalaryDetails[];
  onChange: (s: SalaryDetails[]) => void;
  onError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [baseMin, setBaseMin] = useState("");
  const [baseMax, setBaseMax] = useState("");
  const [bonus, setBonus] = useState("");
  const [equity, setEquity] = useState("");
  const [vesting, setVesting] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setBaseMin(""); setBaseMax(""); setBonus(""); setEquity("");
    setVesting(""); setCurrency("USD"); setNotes(""); setOpen(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); onError(null);
    try {
      const created = await api.addSalary(appId, {
        base_min: baseMin ? Number(baseMin) : undefined,
        base_max: baseMax ? Number(baseMax) : undefined,
        bonus: bonus ? Number(bonus) : undefined,
        equity_value: equity ? Number(equity) : undefined,
        equity_vesting: vesting || undefined,
        currency,
        notes: notes || undefined,
      });
      onChange([created, ...items]);
      reset();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">
          Comp <span className="text-[var(--color-ink-soft)] font-normal">({items.length})</span>
        </h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-[var(--color-brand)] hover:underline"
        >
          {open ? "Cancel" : "+ Add comp data"}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="space-y-2 mb-4 p-3 bg-[var(--color-bg)] rounded border border-[var(--color-border)]">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <input type="number" value={baseMin} onChange={(e) => setBaseMin(e.target.value)}
              placeholder="Base min" className={inputCls} />
            <input type="number" value={baseMax} onChange={(e) => setBaseMax(e.target.value)}
              placeholder="Base max" className={inputCls} />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
            <input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)}
              placeholder="Bonus" className={inputCls} />
            <input type="number" value={equity} onChange={(e) => setEquity(e.target.value)}
              placeholder="Equity total" className={inputCls} />
            <input value={vesting} onChange={(e) => setVesting(e.target.value)}
              placeholder="Vesting (e.g. 4y/1y cliff)" className={inputCls} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes" className={`${inputCls} col-span-2 md:col-span-3`} />
          </div>
          <button
            type="submit" disabled={busy}
            className="px-3 py-1.5 bg-[var(--color-brand)] text-white text-sm rounded font-medium disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          No comp data yet. Track recruiter quotes, ranges, and offers here.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((s) => (
            <li key={s.id} className="py-3">
              <p className="text-sm font-medium">
                {fmt(s.base_min, s.currency)}–{fmt(s.base_max, s.currency)} base
                {s.bonus ? ` · ${fmt(s.bonus, s.currency)} bonus` : ""}
                {s.equity_value ? ` · ${fmt(s.equity_value, s.currency)} equity` : ""}
              </p>
              {s.equity_vesting && (
                <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">{s.equity_vesting}</p>
              )}
              {s.notes && <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">{s.notes}</p>}
              <p className="text-xs text-[var(--color-ink-soft)] mt-1">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function fmt(n: number | null, currency: string): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${currency === "USD" ? "$" : ""}${(n / 1000).toFixed(0)}k`;
  return `${currency === "USD" ? "$" : ""}${n}`;
}

const inputCls = "w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm bg-white";

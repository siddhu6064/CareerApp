"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { CoachClient } from "@/lib/types";
import { CoachGateModal } from "@/components/coach/CoachGateModal";

const PCT = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;

export default function CoachDashboardPage() {
  const authed = useStore((s) => s.authed);

  const [clients, setClients] = useState<CoachClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFlash, setInviteFlash] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setErr(null);
    setGated(false);
    api.coachListClients()
      .then(setClients)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) setGated(true);
        else setErr((e as Error).message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!authed) return;
    load();
  }, [authed]);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteFlash(null);
    try {
      const created = await api.coachInviteClient({
        email,
        name: name || undefined,
        notes: notes || undefined,
      });
      setInviteFlash(`Invite sent to ${created.invited_email}`);
      setEmail("");
      setName("");
      setNotes("");
      setShowInvite(false);
      load();
    } catch (e) {
      setInviteFlash(`Error: ${(e as Error).message}`);
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeClient(id: string) {
    if (!confirm("Remove this client? Their data is not deleted, only the link.")) return;
    try {
      await api.coachRemoveClient(id);
      setClients((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  if (!authed) return <p className="text-sm text-[var(--color-ink-soft)]">Sign in to view coach dashboard.</p>;
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading clients…</p>;
  if (gated) return <CoachGateModal />;
  if (err) return <p className="text-red-600">{err}</p>;

  const active = clients.filter((c) => c.status === "active");
  const pending = clients.filter((c) => c.status === "pending");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Coach dashboard</h1>
          <p className="text-sm text-[var(--color-ink-soft)] mt-1">
            {active.length}/10 active · {pending.length} pending
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/coach/bulk"
            className={`px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50 ${
              active.length === 0 ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            Bulk tailor
          </Link>
          <Link
            href="/coach/branding"
            className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50"
          >
            Branding
          </Link>
          <button
            onClick={() => setShowInvite(true)}
            disabled={active.length >= 10}
            className="px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
          >
            + Invite client
          </button>
        </div>
      </header>

      {inviteFlash && (
        <div className="text-sm border border-[var(--color-border)] bg-emerald-50 text-emerald-800 rounded px-3 py-2">
          {inviteFlash}
        </div>
      )}

      {showInvite && (
        <form
          onSubmit={submitInvite}
          className="border border-[var(--color-border)] rounded-lg bg-white p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-[var(--color-ink-soft)] mb-1">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
                placeholder="client@example.com"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--color-ink-soft)] mb-1">Name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
                placeholder="Jane Doe"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="block text-[var(--color-ink-soft)] mb-1">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded px-2 py-1.5 h-20"
              placeholder="Goals, focus areas, comp expectations…"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={inviteBusy}
              className="px-4 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
            >
              {inviteBusy ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="px-4 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {clients.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
          <p className="text-[var(--color-ink-soft)]">No clients yet.</p>
          <p className="text-sm text-[var(--color-ink-soft)] mt-1">
            Click "+ Invite client" to send your first invite.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                Pending invites
              </h2>
              <ul className="space-y-2">
                {pending.map((c) => (
                  <li
                    key={c.id}
                    className="border border-[var(--color-border)] rounded-lg bg-white p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{c.invited_name || c.invited_email}</div>
                      <div className="text-xs text-[var(--color-ink-soft)]">
                        Invited {new Date(c.invited_at).toLocaleDateString()} ·{" "}
                        {c.invited_email}
                      </div>
                    </div>
                    <button
                      onClick={() => removeClient(c.id)}
                      className="text-xs text-[var(--color-ink-soft)] hover:text-red-600"
                    >
                      Cancel invite
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                Active clients
              </h2>
              <ul className="space-y-2">
                {active.map((c) => (
                  <li
                    key={c.id}
                    className="border border-[var(--color-border)] rounded-lg bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Link
                          href={`/coach/clients/${c.id}`}
                          className="font-semibold text-[var(--color-brand)] hover:underline"
                        >
                          {c.invited_name || c.client_email_actual || c.invited_email}
                        </Link>
                        <div className="text-xs text-[var(--color-ink-soft)]">
                          {c.client_email_actual || c.invited_email}
                        </div>
                      </div>
                      <button
                        onClick={() => removeClient(c.id)}
                        className="text-xs text-[var(--color-ink-soft)] hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <div className="text-[var(--color-ink-soft)]">Applied</div>
                        <div className="font-semibold text-base text-[var(--color-ink)]">
                          {c.applied_count ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--color-ink-soft)]">Response rate</div>
                        <div className="font-semibold text-base text-[var(--color-ink)]">
                          {PCT(c.response_rate)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--color-ink-soft)]">Last activity</div>
                        <div className="font-semibold text-sm text-[var(--color-ink)]">
                          {c.last_activity_at
                            ? new Date(c.last_activity_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
                    </div>
                    {c.notes && (
                      <p className="text-xs text-[var(--color-ink-soft)] mt-2 italic">
                        {c.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

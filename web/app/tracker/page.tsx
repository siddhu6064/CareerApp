"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
} from "@/lib/types";

export default function TrackerPage() {
  const authed = useStore((s) => s.authed);
  const apps = useStore((s) => s.applications);
  const setApps = useStore((s) => s.setApplications);
  const patch = useStore((s) => s.patchApplication);
  const remove = useStore((s) => s.removeApplication);

  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    setBusy(true); setErr(null);
    api.applications()
      .then(setApps)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [authed, setApps]);

  async function moveTo(id: string, status: ApplicationStatus) {
    const old = apps.find((a) => a.id === id);
    if (!old || old.status === status) return;
    // Optimistic update
    patch(id, { status });
    try {
      const updated = await api.updateApplication(id, { status });
      patch(id, updated);
    } catch (e) {
      // Roll back
      patch(id, { status: old.status });
      setErr((e as Error).message);
    }
  }

  async function deleteApp(id: string) {
    if (!confirm("Delete this application?")) return;
    const before = apps;
    remove(id);
    try {
      await api.deleteApplication(id);
    } catch (e) {
      setApps(before);
      setErr((e as Error).message);
    }
  }

  if (!authed) return null;

  const grouped: Record<ApplicationStatus, Application[]> = {
    saved: [], applied: [], phone_screen: [], technical: [],
    onsite: [], offer: [], accepted: [], rejected: [],
  };
  for (const a of apps) grouped[a.status].push(a);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Tracker <span className="text-[var(--color-ink-soft)] font-normal">({apps.length})</span>
        </h1>
        <Link
          href="/jobs"
          className="text-sm px-3 py-1.5 bg-white border border-[var(--color-brand)] text-[var(--color-brand)] rounded hover:bg-[var(--color-brand-bg)]"
        >
          + Add from jobs
        </Link>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {busy && <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>}

      {!busy && apps.length === 0 && (
        <div className="text-center py-16 text-[var(--color-ink-soft)] bg-white border border-[var(--color-border)] rounded-lg">
          <p>No applications yet.</p>
          <p className="text-sm mt-1">Browse <Link href="/jobs" className="text-[var(--color-brand)] underline">Jobs</Link> and save one.</p>
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {APPLICATION_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              items={grouped[status]}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              moveTo={moveTo}
              onDelete={deleteApp}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({
  status, items, draggedId, setDraggedId, moveTo, onDelete,
}: {
  status: ApplicationStatus;
  items: Application[];
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
  moveTo: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`kanban-col ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (draggedId) moveTo(draggedId, status);
        setDraggedId(null);
      }}
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-[var(--color-ink-soft)]">{items.length}</span>
      </div>
      {items.map((app) => (
        <div
          key={app.id}
          draggable
          onDragStart={() => setDraggedId(app.id)}
          onDragEnd={() => setDraggedId(null)}
          className={`kanban-card ${draggedId === app.id ? "dragging" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <Link href={`/applications/${app.id}`} className="min-w-0 flex-1 hover:underline">
              <p className="text-sm font-semibold truncate">{app.title}</p>
              <p className="text-xs text-[var(--color-ink-soft)] truncate">{app.company}</p>
            </Link>
            <button
              onClick={() => onDelete(app.id)}
              className="text-[var(--color-ink-soft)] hover:text-red-600 text-xs"
              title="Delete"
            >
              ✕
            </button>
          </div>
          {app.applied_at && (
            <p className="text-xs text-[var(--color-ink-soft)] mt-1">
              Applied {new Date(app.applied_at).toLocaleDateString()}
            </p>
          )}
          {app.notes && (
            <p className="text-xs mt-1 line-clamp-2 text-[var(--color-ink-soft)]">{app.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

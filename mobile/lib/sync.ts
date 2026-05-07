// Offline-first pending sync queue.
//
// When the device is offline (or the API call fails), status moves are
// written to MMKV with a `pending` flag. On reconnect (or next app
// foreground), flushQueue() re-sends each pending op in order.
//
// Queue entry shape is intentionally minimal — only the data needed to
// replay the PATCH /api/applications/{id} call.

import { mmkv, MMKV_KEYS } from "./mmkv";
import { api } from "./api";
import type { Application, ApplicationStatus } from "./types";

export interface PendingOp {
  id: string;         // application id
  patch: Partial<{
    status: ApplicationStatus;
    notes: string;
    starred: boolean;
    follow_up_date: string | null;
  }>;
  enqueuedAt: string; // ISO timestamp for debugging
}

// ── Queue read/write ──────────────────────────────────────────────────────

export function readQueue(): PendingOp[] {
  return mmkv.getObject<PendingOp[]>(MMKV_KEYS.SYNC_QUEUE) ?? [];
}

function writeQueue(ops: PendingOp[]): void {
  mmkv.setObject(MMKV_KEYS.SYNC_QUEUE, ops);
}

export function enqueue(op: PendingOp): void {
  const q = readQueue();
  // Merge with existing entry for the same id + same field (last write wins)
  const existing = q.findIndex((o) => o.id === op.id);
  if (existing !== -1) {
    q[existing] = { ...q[existing], patch: { ...q[existing].patch, ...op.patch }, enqueuedAt: op.enqueuedAt };
  } else {
    q.push(op);
  }
  writeQueue(q);
}

export function dequeue(id: string): void {
  writeQueue(readQueue().filter((o) => o.id !== id));
}

export function clearQueue(): void {
  writeQueue([]);
}

// ── Local applications cache ──────────────────────────────────────────────

export function readCachedApplications(): Application[] | null {
  return mmkv.getObject<Application[]>(MMKV_KEYS.APPLICATIONS);
}

export function writeCachedApplications(apps: Application[]): void {
  mmkv.setObject(MMKV_KEYS.APPLICATIONS, apps);
}

export function patchCachedApplication(id: string, patch: Partial<Application>): void {
  const apps = readCachedApplications();
  if (!apps) return;
  writeCachedApplications(apps.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function addCachedApplication(app: Application): void {
  const apps = readCachedApplications() ?? [];
  writeCachedApplications([app, ...apps]);
}

export function removeCachedApplication(id: string): void {
  const apps = readCachedApplications();
  if (!apps) return;
  writeCachedApplications(apps.filter((a) => a.id !== id));
}

// ── Flush ─────────────────────────────────────────────────────────────────

let flushing = false;

/**
 * Re-sends every pending op to the API in FIFO order.
 * Safe to call on every foreground / reconnect event.
 * Skips individual failed ops (leaves them in the queue for next attempt).
 */
export async function flushQueue(
  onPatch?: (id: string, updated: Application) => void,
): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;

  const q = readQueue();
  if (q.length === 0) { flushing = false; return { flushed: 0, failed: 0 }; }

  let flushed = 0;
  let failed = 0;

  for (const op of q) {
    try {
      // Cast: PendingOp allows follow_up_date: null but API accepts string | undefined.
      // Null means "clear the date" — the backend PATCH handles it fine.
      const updated = await api.updateApplication(op.id, op.patch as Parameters<typeof api.updateApplication>[1]);
      patchCachedApplication(op.id, updated);
      onPatch?.(op.id, updated);
      dequeue(op.id);
      flushed++;
    } catch {
      failed++;
      // Leave in queue — will retry on next flush
    }
  }

  flushing = false;
  return { flushed, failed };
}

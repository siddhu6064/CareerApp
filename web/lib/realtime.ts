// Supabase Realtime subscription for the applications table.
//
// BLOCKED: requires a live Supabase project.
// Enabled via: NEXT_PUBLIC_SUPABASE_REALTIME_ENABLED=true
//              NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//              NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
//
// When enabled, the hook subscribes to INSERT/UPDATE/DELETE on the
// applications table (filtered by user_id via RLS) and calls the
// provided callbacks so the Zustand store stays live without polling.
//
// When disabled (default), the hook is a no-op — the tracker falls
// back to the existing load-on-mount + optimistic-update pattern.

"use client";

import { useEffect } from "react";

const ENABLED = process.env.NEXT_PUBLIC_SUPABASE_REALTIME_ENABLED === "true";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Dynamically import to avoid bundling the SDK when Realtime is disabled.
async function getSupabase() {
  if (!ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

interface UseApplicationsRealtimeOpts {
  enabled: boolean; // pass `authed` from store — don't subscribe before login
  onInsert?: (row: Record<string, unknown>) => void;
  onUpdate?: (row: Record<string, unknown>) => void;
  onDelete?: (row: Record<string, unknown>) => void;
}

export function useApplicationsRealtime({
  enabled,
  onInsert,
  onUpdate,
  onDelete,
}: UseApplicationsRealtimeOpts) {
  useEffect(() => {
    if (!ENABLED || !enabled) return;

    let cleanup: (() => void) | undefined;

    getSupabase().then((client) => {
      if (!client) return;

      const channel = client
        .channel("applications-changes")
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "applications" },
          (payload: RealtimePayload) => {
            if (payload.eventType === "INSERT") onInsert?.(payload.new);
            if (payload.eventType === "UPDATE") onUpdate?.(payload.new);
            if (payload.eventType === "DELETE") onDelete?.(payload.old);
          },
        )
        .subscribe();

      cleanup = () => {
        client.removeChannel(channel);
      };
    });

    return () => cleanup?.();
  }, [enabled, onInsert, onUpdate, onDelete]);
}

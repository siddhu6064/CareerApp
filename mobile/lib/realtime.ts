// Supabase Realtime for mobile — mirrors web/lib/realtime.ts.
//
// BLOCKED: requires a live Supabase project.
// Enable via env vars in app.json extra or .env:
//   EXPO_PUBLIC_SUPABASE_REALTIME_ENABLED=true
//   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
//
// When disabled (default), the hook is a complete no-op.

import { useEffect } from "react";
import type { Application } from "./types";

const ENABLED = process.env.EXPO_PUBLIC_SUPABASE_REALTIME_ENABLED === "true";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

type SupabaseClient = ReturnType<typeof import("@supabase/supabase-js").createClient>;
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (_client) return _client;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}

interface Opts {
  enabled: boolean;
  onInsert?: (row: Application) => void;
  onUpdate?: (row: Application) => void;
  onDelete?: (row: Partial<Application>) => void;
}

export function useApplicationsRealtime({ enabled, onInsert, onUpdate, onDelete }: Opts) {
  useEffect(() => {
    if (!ENABLED || !enabled) return;

    const client = getClient();
    if (!client) return;

    const channel = client
      .channel("mobile-applications-changes")
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "applications" },
        (payload: { eventType: string; new: Application; old: Partial<Application> }) => {
          if (payload.eventType === "INSERT") onInsert?.(payload.new);
          if (payload.eventType === "UPDATE") onUpdate?.(payload.new);
          if (payload.eventType === "DELETE") onDelete?.(payload.old);
        },
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [enabled, onInsert, onUpdate, onDelete]);
}

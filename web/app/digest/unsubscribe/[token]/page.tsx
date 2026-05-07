"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type State = "loading" | "done" | "error";

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!params?.token) { setState("error"); return; }
    api.digestUnsubscribe(params.token)
      .then((r) => { setMsg(r.message); setState("done"); })
      .catch(() => { setState("error"); });
  }, [params?.token]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-[var(--color-border)] rounded-xl p-8 text-center space-y-4">
        {state === "loading" && (
          <>
            <div className="text-4xl">⏳</div>
            <p className="text-[var(--color-ink-soft)]">Processing…</p>
          </>
        )}
        {state === "done" && (
          <>
            <div className="text-5xl">✅</div>
            <h1 className="text-xl font-semibold">Unsubscribed</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">{msg}</p>
            <p className="text-xs text-[var(--color-ink-soft)]">
              You can re-enable digest emails at any time in{" "}
              <button
                onClick={() => router.push("/settings")}
                className="text-[var(--color-brand)] underline"
              >
                Settings
              </button>
              .
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <div className="text-5xl">⚠️</div>
            <h1 className="text-xl font-semibold">Link expired or invalid</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              You can manage digest preferences in{" "}
              <button
                onClick={() => router.push("/settings")}
                className="text-[var(--color-brand)] underline"
              >
                Settings
              </button>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}

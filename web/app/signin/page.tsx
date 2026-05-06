"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [token, setTok] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    setToken(token.trim());
    try {
      await api.me();
      router.push("/jobs");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-2">Sign in</h1>
      <p className="text-sm text-[var(--color-ink-soft)] mb-6">
        Desktop dev: paste the API token printed by the FastAPI server on launch
        (look for <code className="bg-[var(--color-brand-bg)] px-1 rounded">api_token=</code>).
        SaaS auth (Google / email) lands when Supabase is wired up.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          value={token}
          onChange={(e) => setTok(e.target.value)}
          placeholder="Bearer token"
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded font-mono text-sm"
          autoFocus
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="w-full px-4 py-2 bg-[var(--color-brand)] text-white rounded font-medium disabled:opacity-50 hover:bg-[var(--color-brand-lt)]"
        >
          {busy ? "Verifying…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

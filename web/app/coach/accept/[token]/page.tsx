"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { CoachClient } from "@/lib/types";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = decodeURIComponent(params?.token ?? "");
  const authed = useStore((s) => s.authed);

  const [invite, setInvite] = useState<CoachClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!authed || !token) return;
    setLoading(true);
    api.coachLookupInvite(token)
      .then(setInvite)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          setErr("This invite link is invalid or has already been used.");
        } else {
          setErr((e as Error).message);
        }
      })
      .finally(() => setLoading(false));
  }, [authed, token]);

  async function accept() {
    setAccepting(true);
    setErr(null);
    try {
      await api.coachAcceptInvite(token);
      setAccepted(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (!authed) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">
          Sign in to accept invite
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          You need to be signed in to accept a coach invitation.
        </p>
        <Link
          href={`/signin?redirect=/coach/accept/${encodeURIComponent(token)}`}
          className="inline-block px-4 py-2 bg-[var(--color-brand)] text-white rounded text-sm font-semibold hover:bg-[var(--color-brand-lt)]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading invite…</p>;

  if (err) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-3">
        <h1 className="text-xl font-bold text-[var(--color-ink)]">Can't load this invite</h1>
        <p className="text-sm text-[var(--color-ink-soft)]">{err}</p>
        <Link href="/jobs" className="inline-block text-sm text-[var(--color-brand)] hover:underline">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">You're connected</h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Your coach can now see your tracker and tailor resumes for you.
        </p>
        <Link
          href="/jobs"
          className="inline-block px-4 py-2 bg-[var(--color-brand)] text-white rounded text-sm font-semibold hover:bg-[var(--color-brand-lt)]"
        >
          Continue
        </Link>
      </div>
    );
  }

  if (!invite) return null;

  // /api/coach/invite/{token} response repurposes client_email_actual to be
  // the *coach's* email (since the invite hasn't been linked yet).
  const coachEmail = invite.client_email_actual || "your coach";

  return (
    <div className="max-w-md mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-ink)]">Coach invitation</h1>
      <div className="border border-[var(--color-border)] rounded-lg bg-white p-5 space-y-3">
        <p className="text-sm">
          <strong className="text-[var(--color-ink)]">{coachEmail}</strong>{" "}
          has invited you to be their client on [AppName].
        </p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          If you accept, they'll be able to:
        </p>
        <ul className="text-sm space-y-1 ml-4">
          <li>· View your application tracker (read-only)</li>
          <li>· See your application analytics</li>
          <li>· Tailor resumes for you against jobs you're applying to</li>
        </ul>
        <p className="text-xs text-[var(--color-ink-soft)] pt-2">
          You can disconnect at any time from your account settings.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={accept}
          disabled={accepting}
          className="flex-1 px-4 py-2 bg-[var(--color-brand)] text-white rounded text-sm font-semibold hover:bg-[var(--color-brand-lt)] disabled:opacity-40"
        >
          {accepting ? "Accepting…" : "Accept invitation"}
        </button>
        <Link
          href="/jobs"
          className="px-4 py-2 border border-[var(--color-border)] rounded text-sm hover:bg-gray-50"
        >
          Decline
        </Link>
      </div>
    </div>
  );
}

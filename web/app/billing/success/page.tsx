"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function BillingSuccessPage() {
  const router = useRouter();
  const { setQuota } = useStore();
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    // Poll quota until plan upgrades (webhook may lag a few seconds)
    let attempts = 0;
    const check = async () => {
      try {
        const q = await api.tailorQuota();
        setQuota(q);
        if (q.plan !== "free" || attempts >= 8) {
          setPlan(q.plan);
          return;
        }
      } catch { /* ignore */ }
      attempts++;
      setTimeout(check, 1500);
    };
    check();
  }, [setQuota]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-[var(--color-border)] rounded-xl p-8 text-center space-y-5">
        {plan === null ? (
          <>
            <div className="text-5xl animate-pulse">⏳</div>
            <h1 className="text-xl font-semibold">Activating your plan…</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              This usually takes a few seconds.
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl">🎉</div>
            <h1 className="text-xl font-semibold">
              Welcome to {plan === "coach" ? "Coach" : "Pro"}!
            </h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {plan === "pro"
                ? "You now have 100 tailors/month, cover letters, interview prep, and full analytics."
                : "You now have all Pro features plus 10 client profiles and white-label PDF export."}
            </p>
            <button
              onClick={() => router.push("/jobs")}
              className="w-full py-2.5 bg-[var(--color-brand)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--color-brand-lt)]"
            >
              Go to dashboard →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

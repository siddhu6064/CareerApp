"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type Cadence = "monthly" | "annual";

const VARIANTS = {
  pro: {
    monthly: process.env.NEXT_PUBLIC_LS_PRO_MONTHLY_VARIANT_ID ?? "",
    annual:  process.env.NEXT_PUBLIC_LS_PRO_ANNUAL_VARIANT_ID ?? "",
  },
  coach: {
    monthly: process.env.NEXT_PUBLIC_LS_COACH_MONTHLY_VARIANT_ID ?? "",
    annual:  process.env.NEXT_PUBLIC_LS_COACH_ANNUAL_VARIANT_ID ?? "",
  },
};

const PRICE = {
  pro:   { monthly: 19, annual: 190 },
  coach: { monthly: 49, annual: 490 },
};

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightPlan = searchParams?.get("plan"); // "pro" | "coach"

  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function subscribe(plan: "pro" | "coach") {
    const variantId = VARIANTS[plan][cadence];
    if (!variantId) {
      setErr("Billing not configured yet — contact support.");
      return;
    }
    setBusy(plan); setErr(null);
    try {
      const { url } = await api.billingCheckout(variantId);
      window.location.href = url;
    } catch {
      setErr("Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  const annualSaving = (monthly: number) =>
    Math.round(((monthly * 12 - PRICE[monthly === 19 ? "pro" : "coach"].annual) / (monthly * 12)) * 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">Simple, honest pricing</h1>
        <p className="text-[var(--color-ink-soft)]">
          Start free. Upgrade when you're ready.
        </p>

        {/* Cadence toggle */}
        <div className="inline-flex items-center gap-1 mt-6 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-1">
          {(["monthly", "annual"] as Cadence[]).map((c) => (
            <button
              key={c}
              onClick={() => setCadence(c)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                cadence === c
                  ? "bg-white shadow text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              }`}
            >
              {c === "monthly" ? "Monthly" : "Annual"}
              {c === "annual" && (
                <span className="ml-1.5 text-xs font-bold text-green-600">
                  Save 17%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Free */}
        <PlanCard
          name="Free"
          price={0}
          cadence={cadence}
          highlight={false}
          features={[
            "3 AI tailors / month",
            "10 tracked applications",
            "Daily job digest",
            "Basic job feed",
          ]}
          cta="Current plan"
          ctaDisabled
          onSubscribe={() => {}}
        />

        {/* Pro */}
        <PlanCard
          name="Pro"
          price={cadence === "monthly" ? PRICE.pro.monthly : PRICE.pro.annual}
          cadence={cadence}
          highlight={highlightPlan === "pro" || !highlightPlan}
          badge="Most popular"
          trial="7-day free trial"
          features={[
            "100 AI tailors / month",
            "Unlimited tracker",
            "ATS match % in digest",
            "Cover letter generation",
            "Interview prep",
            "Full analytics dashboard",
          ]}
          cta={busy === "pro" ? "Redirecting…" : cadence === "monthly" ? "Start free trial" : "Subscribe"}
          ctaDisabled={busy !== null}
          onSubscribe={() => subscribe("pro")}
        />

        {/* Coach */}
        <PlanCard
          name="Coach"
          price={cadence === "monthly" ? PRICE.coach.monthly : PRICE.coach.annual}
          cadence={cadence}
          highlight={highlightPlan === "coach"}
          features={[
            "Everything in Pro",
            "10 client profiles",
            "Bulk tailor for clients",
            "White-label PDF export",
            "Client tracker access",
            "Coach branding",
          ]}
          cta={busy === "coach" ? "Redirecting…" : "Subscribe"}
          ctaDisabled={busy !== null}
          onSubscribe={() => subscribe("coach")}
        />
      </div>

      <p className="text-center text-xs text-[var(--color-ink-soft)] mt-8">
        Prices in USD · Billed by LemonSqueezy · Cancel any time · No contracts
      </p>
    </div>
  );
}

function PlanCard({
  name, price, cadence, highlight, badge, trial, features, cta, ctaDisabled, onSubscribe,
}: {
  name: string;
  price: number;
  cadence: Cadence;
  highlight: boolean;
  badge?: string;
  trial?: string;
  features: string[];
  cta: string;
  ctaDisabled: boolean;
  onSubscribe: () => void;
}) {
  return (
    <div className={`relative rounded-xl border p-6 flex flex-col gap-4 ${
      highlight
        ? "border-[var(--color-brand)] shadow-lg shadow-[var(--color-brand)]/10"
        : "border-[var(--color-border)]"
    }`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-[var(--color-brand)] text-white text-xs font-bold px-3 py-0.5 rounded-full">
            {badge}
          </span>
        </div>
      )}

      <div>
        <p className="font-semibold text-lg">{name}</p>
        <div className="flex items-end gap-1 mt-1">
          {price === 0 ? (
            <span className="text-3xl font-bold">Free</span>
          ) : (
            <>
              <span className="text-3xl font-bold">${price}</span>
              <span className="text-sm text-[var(--color-ink-soft)] mb-1">
                {cadence === "monthly" ? "/mo" : "/yr"}
              </span>
            </>
          )}
        </div>
        {cadence === "annual" && price > 0 && (
          <p className="text-xs text-green-600 font-medium mt-0.5">
            ≈ ${Math.round(price / 12)}/mo · 2 months free
          </p>
        )}
        {trial && cadence === "monthly" && (
          <p className="text-xs text-[var(--color-brand)] font-medium mt-0.5">
            ✦ {trial}
          </p>
        )}
      </div>

      <ul className="flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className="text-green-500 mt-0.5 shrink-0">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSubscribe}
        disabled={ctaDisabled || price === 0}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          price === 0
            ? "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink-soft)] cursor-default"
            : highlight
            ? "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-lt)] disabled:opacity-60"
            : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-brand)] disabled:opacity-60"
        }`}
      >
        {cta}
      </button>
    </div>
  );
}

"use client";

interface Props {
  feature?: string;   // e.g. "cover letters", "interview prep", "tailoring"
  onClose: () => void;
}

const PRO_FEATURES = [
  "100 AI tailors / month",
  "Cover letter generator",
  "Interview prep questions",
  "Full analytics dashboard",
  "Daily digest with ATS match %",
  "Unlimited tracker applications",
];

const COACH_EXTRAS = [
  "Everything in Pro",
  "10 client profiles",
  "Bulk tailor for all clients",
  "White-label PDF export",
];

export function UpgradeModal({ feature = "this feature", onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-lt)] px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-semibold uppercase tracking-widest opacity-70">
              Pro required
            </span>
            <button
              onClick={onClose}
              className="opacity-60 hover:opacity-100 text-white text-xl leading-none"
            >
              ✕
            </button>
          </div>
          <h2 className="text-xl font-bold">Unlock {feature}</h2>
          <p className="text-sm opacity-80 mt-1">
            You&apos;ve reached the Free tier limit. Upgrade to keep going.
          </p>
        </div>

        {/* Plans */}
        <div className="p-6 space-y-4">
          {/* Pro */}
          <div className="border-2 border-[var(--color-brand)] rounded-xl p-4 bg-[var(--color-brand-bg)]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-mono font-bold text-[var(--color-brand)] uppercase tracking-wider">
                  Pro
                </span>
                <p className="text-lg font-bold mt-0.5">$19 / month</p>
              </div>
              <span className="text-xs bg-[var(--color-brand)] text-white px-2 py-1 rounded-full font-semibold">
                Most popular
              </span>
            </div>
            <ul className="space-y-1.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
                  <span className="text-[var(--color-brand)] text-xs">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { window.location.href = "/billing"; }}
              className="mt-4 w-full py-2.5 bg-[var(--color-brand)] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Upgrade to Pro →
            </button>
          </div>

          {/* Coach */}
          <div className="border border-[var(--color-border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-mono font-bold text-[var(--color-ink-soft)] uppercase tracking-wider">
                  Coach
                </span>
                <p className="text-lg font-bold mt-0.5">$49 / month</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {COACH_EXTRAS.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                  <span className="text-green-600 text-xs">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { window.location.href = "/billing?plan=coach"; }}
              className="mt-4 w-full py-2 border border-[var(--color-border)] text-sm rounded-lg font-medium hover:bg-[var(--color-bg)] transition-colors"
            >
              Upgrade to Coach →
            </button>
          </div>

          <p className="text-center text-xs text-[var(--color-ink-soft)]">
            Cancel anytime · Billed monthly via LemonSqueezy
          </p>
        </div>
      </div>
    </div>
  );
}

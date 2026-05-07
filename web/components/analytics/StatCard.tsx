// Tile for a single headline metric: big number + label + optional subline.
interface Props {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}

export function StatCard({ label, value, sub, tone = "default" }: Props) {
  const toneCls =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-[var(--color-ink)]";
  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
        {label}
      </div>
      <div className={`text-3xl font-bold mt-1 ${toneCls}`}>{value}</div>
      {sub && (
        <div className="text-xs text-[var(--color-ink-soft)] mt-1">{sub}</div>
      )}
    </div>
  );
}

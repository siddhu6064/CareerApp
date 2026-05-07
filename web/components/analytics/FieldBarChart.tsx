import type { FieldBreakdown } from "@/lib/types";

interface Props {
  data: FieldBreakdown[];
}

export function FieldBarChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        Apply to jobs across multiple fields to see breakdown.
      </p>
    );
  }
  const rowHeight = 32;
  const width = 600;
  const labelWidth = 140;
  const barAreaWidth = width - labelWidth - 100;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${data.length * rowHeight + 16}`}
        className="w-full h-auto"
        role="img"
        aria-label="Response rate by field"
      >
        {data.map((row, i) => {
          const y = i * rowHeight + 8;
          const w = row.response_rate * barAreaWidth;
          const pct = `${Math.round(row.response_rate * 100)}%`;
          return (
            <g key={row.field}>
              <text
                x={labelWidth - 8}
                y={y + rowHeight / 2 + 4}
                textAnchor="end"
                fontSize="12"
                fill="var(--color-ink-soft)"
              >
                {row.field}
              </text>
              <rect
                x={labelWidth}
                y={y + 2}
                width={barAreaWidth}
                height={rowHeight - 12}
                rx="3"
                fill="var(--color-border)"
                opacity="0.5"
              />
              <rect
                x={labelWidth}
                y={y + 2}
                width={Math.max(2, w)}
                height={rowHeight - 12}
                rx="3"
                fill="#0d9488"
              />
              <text
                x={labelWidth + barAreaWidth + 8}
                y={y + rowHeight / 2 + 4}
                fontSize="12"
                fontWeight="600"
                fill="var(--color-ink)"
              >
                {pct} ({row.responded}/{row.applied})
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

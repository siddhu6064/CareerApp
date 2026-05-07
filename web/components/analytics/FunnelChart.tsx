import { STATUS_LABEL, type ApplicationStatus } from "@/lib/types";

interface Stage {
  status: ApplicationStatus;
  count: number;
}

interface Props {
  stages: Stage[];
}

export function FunnelChart({ stages }: Props) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const rowHeight = 28;
  const width = 600;
  const labelWidth = 120;
  const barAreaWidth = width - labelWidth - 40;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${stages.length * rowHeight + 16}`}
        className="w-full h-auto"
        role="img"
        aria-label="Application funnel by stage"
      >
        {stages.map((s, i) => {
          const y = i * rowHeight + 8;
          const w = (s.count / maxCount) * barAreaWidth;
          return (
            <g key={s.status}>
              <text
                x={labelWidth - 8}
                y={y + rowHeight / 2 + 4}
                textAnchor="end"
                fontSize="12"
                fill="var(--color-ink-soft)"
              >
                {STATUS_LABEL[s.status]}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={Math.max(2, w)}
                height={rowHeight - 8}
                rx="3"
                fill="var(--color-brand)"
                opacity={s.count === 0 ? 0.15 : 0.85}
              />
              <text
                x={labelWidth + Math.max(2, w) + 6}
                y={y + rowHeight / 2 + 4}
                fontSize="12"
                fontWeight="600"
                fill="var(--color-ink)"
              >
                {s.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

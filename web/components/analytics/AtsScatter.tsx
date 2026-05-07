"use client";

import type { AnalyticsAtsCorrelation } from "@/lib/types";

interface Props {
  data: AnalyticsAtsCorrelation;
}

export function AtsScatter({ data }: Props) {
  const width = 600;
  const height = 280;
  const padX = 80;
  const padY = 40;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  // Two columns: left = not_responded, right = responded
  const colX = (responded: boolean) =>
    responded ? padX + innerW * 0.7 : padX + innerW * 0.3;

  // Y axis: ATS 0–100, top=100
  const scoreY = (score: number) => padY + ((100 - score) / 100) * innerH;

  // Jitter dots horizontally so they don't overlap
  const jittered = data.points.map((p, i) => {
    const baseX = colX(p.responded);
    const jitter = ((i % 11) - 5) * 4;
    return { ...p, x: baseX + jitter, y: scoreY(p.ats_score) };
  });

  const respondedAvg = data.responded.avg_ats;
  const notRespondedAvg = data.not_responded.avg_ats;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="ATS score for responded vs non-responded applications"
      >
        {/* Y-axis gridlines */}
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padX}
              x2={width - padX}
              y1={scoreY(tick)}
              y2={scoreY(tick)}
              stroke="var(--color-border)"
              strokeDasharray={tick === 0 || tick === 100 ? "" : "3 3"}
            />
            <text
              x={padX - 8}
              y={scoreY(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-ink-soft)"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Column labels */}
        <text
          x={colX(false)}
          y={height - 10}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          No response ({data.not_responded.count})
        </text>
        <text
          x={colX(true)}
          y={height - 10}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          Responded ({data.responded.count})
        </text>

        {/* Avg lines */}
        {notRespondedAvg !== null && (
          <line
            x1={colX(false) - 50}
            x2={colX(false) + 50}
            y1={scoreY(notRespondedAvg)}
            y2={scoreY(notRespondedAvg)}
            stroke="#ef4444"
            strokeWidth="2"
          />
        )}
        {respondedAvg !== null && (
          <line
            x1={colX(true) - 50}
            x2={colX(true) + 50}
            y1={scoreY(respondedAvg)}
            y2={scoreY(respondedAvg)}
            stroke="#10b981"
            strokeWidth="2"
          />
        )}

        {/* Avg labels */}
        {notRespondedAvg !== null && (
          <text
            x={colX(false) + 56}
            y={scoreY(notRespondedAvg) + 4}
            fontSize="11"
            fontWeight="700"
            fill="#ef4444"
          >
            avg {notRespondedAvg.toFixed(1)}
          </text>
        )}
        {respondedAvg !== null && (
          <text
            x={colX(true) + 56}
            y={scoreY(respondedAvg) + 4}
            fontSize="11"
            fontWeight="700"
            fill="#10b981"
          >
            avg {respondedAvg.toFixed(1)}
          </text>
        )}

        {/* Dots */}
        {jittered.map((p) => (
          <circle
            key={p.application_id}
            cx={p.x}
            cy={p.y}
            r="5"
            fill={p.responded ? "#10b981" : "#ef4444"}
            opacity="0.55"
          >
            <title>
              {p.company} · {p.title} · ATS {p.ats_score}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

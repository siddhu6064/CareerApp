// A/B/C/D/F badge derived from ATS score (0–100).
// Used on job cards, application cards, and the tailor panel.

type Props = {
  score: number;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
  className?: string;
};

export function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const GRADE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  A: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  B: { bg: "bg-blue-50",    text: "text-blue-700",    ring: "ring-blue-200"    },
  C: { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200"   },
  D: { bg: "bg-orange-50",  text: "text-orange-700",  ring: "ring-orange-200"  },
  F: { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200"     },
};

const SIZE_CLS = {
  sm: "text-[11px] px-1.5 py-0.5 rounded font-bold ring-1",
  md: "text-xs px-2 py-1 rounded-md font-bold ring-1",
  lg: "text-sm px-3 py-1.5 rounded-lg font-extrabold ring-2",
};

export function GradeBadge({ score, size = "md", showScore = false, className = "" }: Props) {
  const grade = scoreToGrade(score);
  const { bg, text, ring } = GRADE_STYLES[grade];

  return (
    <span
      className={`inline-flex items-center gap-1 ${SIZE_CLS[size]} ${bg} ${text} ${ring} ${className}`}
      title={`ATS match score: ${score}/100`}
    >
      <span>{grade}</span>
      {showScore && <span className="opacity-70">{score}</span>}
    </span>
  );
}

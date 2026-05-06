import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { colors } from "@/lib/theme";

export function ScoreCircle({ score, size = 56 }: { score: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = colors.score(score);

  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} stroke="#E5E7EB" strokeWidth={stroke} fill="none" />
      <Circle
        cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
      />
      <SvgText
        x={c} y={c + 4}
        fontSize={size * 0.34} fontWeight="700"
        fill={color}
        textAnchor="middle"
      >
        {score}
      </SvgText>
    </Svg>
  );
}

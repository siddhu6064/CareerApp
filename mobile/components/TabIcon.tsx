import Svg, { Path, Rect, Circle, Polyline, Line } from "react-native-svg";

type Name = "briefcase" | "kanban" | "file" | "sparkles";

export function TabIcon({ name, color, size = 22 }: { name: Name; color: string; size?: number }) {
  const stroke = color;
  const props = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "briefcase":
      return (
        <Svg {...props}>
          <Rect x={2} y={7} width={20} height={14} rx={2} />
          <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </Svg>
      );
    case "kanban":
      return (
        <Svg {...props}>
          <Rect x={3} y={3} width={6} height={18} rx={1} />
          <Rect x={10} y={3} width={6} height={12} rx={1} />
          <Rect x={17} y={3} width={4} height={8} rx={1} />
        </Svg>
      );
    case "file":
      return (
        <Svg {...props}>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
        </Svg>
      );
    case "sparkles":
      return (
        <Svg {...props}>
          <Path d="M12 3l2.5 6L21 11l-6 2.5L12 20l-2.5-6L3 11l6-2.5z" />
        </Svg>
      );
  }
}

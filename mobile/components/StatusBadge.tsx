import { View, Text, StyleSheet } from "react-native";
import type { ApplicationStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import { colors, fontSize, radius } from "@/lib/theme";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const c = colors.status[status];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.text, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  text: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
});

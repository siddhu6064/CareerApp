import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import type { Application, ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES, STATUS_LABEL } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { colors, fontSize, radius, space } from "@/lib/theme";

export function ApplicationCard({
  app, onMove, onDelete,
}: {
  app: Application;
  onMove: (status: ApplicationStatus) => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);

  function openDetail() {
    router.push({ pathname: "/applications/[id]", params: { id: app.id } });
  }

  function pickStatus() {
    if (moving) return;
    const options = APPLICATION_STATUSES.map((s) => STATUS_LABEL[s]).concat(["Cancel"]);
    const cancelIdx = options.length - 1;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIdx, title: "Move to…" },
        (i) => {
          if (i !== cancelIdx) {
            setMoving(true);
            onMove(APPLICATION_STATUSES[i]);
            setMoving(false);
          }
        },
      );
    } else {
      // Cheap Android fallback — full-stage Alert with the 4 most common
      Alert.alert("Move to…", undefined, [
        ...APPLICATION_STATUSES.map((stat) => ({
          text: STATUS_LABEL[stat],
          onPress: () => onMove(stat),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete application?", `${app.title} @ ${app.company}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  }

  return (
    <TouchableOpacity style={s.card} onPress={openDetail} activeOpacity={0.7}>
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{app.title}</Text>
          <Text style={s.subtitle} numberOfLines={1}>{app.company}</Text>
        </View>
        <TouchableOpacity onPress={confirmDelete} hitSlop={10}>
          <Text style={s.delete}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={s.metaRow}>
        <StatusBadge status={app.status} />
        {app.applied_at && (
          <Text style={s.meta}>
            Applied {new Date(app.applied_at).toLocaleDateString()}
          </Text>
        )}
      </View>

      {app.notes && (
        <Text style={s.notes} numberOfLines={2}>{app.notes}</Text>
      )}

      <View style={s.actionRow}>
        <TouchableOpacity style={s.moveBtn} onPress={pickStatus}>
          <Text style={s.moveBtnText}>Move →</Text>
        </TouchableOpacity>
        <Text style={s.detailHint}>Tap to open →</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: space.md,
    gap: space.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  subtitle: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: 2 },
  delete: { color: colors.inkMuted, fontSize: 18, paddingHorizontal: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meta: { fontSize: fontSize.xs, color: colors.inkSoft },
  notes: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 19 },
  moveBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md, paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brandBg,
  },
  moveBtnText: { color: colors.brand, fontSize: fontSize.sm, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailHint: { color: colors.inkMuted, fontSize: fontSize.xs },
});

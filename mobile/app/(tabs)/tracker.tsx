import { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Alert,
} from "react-native";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ApplicationCard } from "@/components/ApplicationCard";
import { colors, fontSize, radius, space } from "@/lib/theme";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  type ApplicationStatus,
} from "@/lib/types";

const FILTERS: { key: ApplicationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...APPLICATION_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] })),
];

export default function TrackerScreen() {
  const authed = useStore((s) => s.authed);
  const apps = useStore((s) => s.applications);
  const setApps = useStore((s) => s.setApplications);
  const patch = useStore((s) => s.patchApplication);
  const remove = useStore((s) => s.removeApplication);

  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.applications();
      setApps(r);
    } catch (e) {
      Alert.alert("Load failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [setApps]);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  async function move(id: string, status: ApplicationStatus) {
    const before = apps.find((a) => a.id === id);
    if (!before || before.status === status) return;
    patch(id, { status });
    try {
      const updated = await api.updateApplication(id, { status });
      patch(id, updated);
    } catch (e) {
      patch(id, { status: before.status });
      Alert.alert("Move failed", (e as Error).message);
    }
  }

  async function deleteApp(id: string) {
    const before = apps;
    remove(id);
    try {
      await api.deleteApplication(id);
    } catch (e) {
      setApps(before);
      Alert.alert("Delete failed", (e as Error).message);
    }
  }

  const filtered = filter === "all" ? apps : apps.filter((a) => a.status === filter);
  const counts: Record<string, number> = { all: apps.length };
  for (const stat of APPLICATION_STATUSES) {
    counts[stat] = apps.filter((a) => a.status === stat).length;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>
          Tracker <Text style={s.titleMuted}>({apps.length})</Text>
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const c = counts[f.key as string] || 0;
          if (f.key !== "all" && c === 0) return null;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, active && s.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {f.label}{c > 0 ? ` · ${c}` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!busy && apps.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No applications yet.</Text>
          <Text style={s.emptyHint}>
            Open a job and tap "Save to tracker".
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <ApplicationCard
              app={item}
              onMove={(st) => move(item.id, st)}
              onDelete={() => deleteApp(item.id)}
            />
          )}
          contentContainerStyle={{
            padding: space.md, gap: space.sm, paddingBottom: 96,
          }}
          refreshControl={
            <RefreshControl
              refreshing={busy} onRefresh={load} tintColor={colors.brand}
            />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  titleMuted: { fontWeight: "400", color: colors.inkSoft },
  filterRow: { padding: space.md, gap: 6 },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.inkSoft, fontSize: fontSize.sm, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyText: { fontSize: fontSize.md, color: colors.inkSoft },
  emptyHint: { fontSize: fontSize.sm, color: colors.inkMuted, marginTop: space.xs },
});

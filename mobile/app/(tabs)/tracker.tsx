// Tracker screen — horizontal kanban scroll.
// - Loads from MMKV cache immediately (offline-first), then fetches fresh in background.
// - Flushes pending sync queue after each successful network load.
// - Columns horizontally scrollable; adjacent columns peek at ~18% screen width.
// - SwipeableApplicationCard: swipe right = advance, swipe left = reject.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, FlatList, StyleSheet,
  RefreshControl, TouchableOpacity, Alert, Dimensions,
} from "react-native";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { SwipeableApplicationCard } from "@/components/SwipeableApplicationCard";
import { colors, fontSize, radius, space } from "@/lib/theme";
import { flushQueue, readQueue, enqueue } from "@/lib/sync";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
} from "@/lib/types";

const COL_WIDTH = Math.min(300, Dimensions.get("window").width * 0.82);

// Active stages (exclude terminal for default view)
const ACTIVE_COLS: ApplicationStatus[] = [
  "saved", "applied", "phone_screen", "technical", "onsite", "offer",
];

export default function TrackerScreen() {
  const authed         = useStore((s) => s.authed);
  const apps           = useStore((s) => s.applications);
  const setApps        = useStore((s) => s.setApplications);
  const patch          = useStore((s) => s.patchApplication);
  const remove         = useStore((s) => s.removeApplication);
  const hydrateCache   = useStore((s) => s.hydrateFromCache);

  const [busy, setBusy]         = useState(false);
  const [showAll, setShowAll]   = useState(false);
  const [pending, setPending]   = useState(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Boot: hydrate MMKV immediately so UI works offline
  useEffect(() => {
    hydrateCache();
    setPending(readQueue().length);
  }, [hydrateCache]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const r = await api.applications();
      if (mounted.current) setApps(r);
      const { flushed } = await flushQueue((id, updated) => {
        if (mounted.current) patch(id, updated);
      });
      if (flushed > 0 && mounted.current) setPending(0);
    } catch {
      // Offline — MMKV data stays visible, no alert
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [setApps, patch]);

  useEffect(() => {
    if (authed) load(false);
  }, [authed, load]);

  async function move(id: string, status: ApplicationStatus) {
    const before = apps.find((a) => a.id === id);
    if (!before || before.status === status) return;
    patch(id, { status });
    try {
      const updated = await api.updateApplication(id, { status });
      if (mounted.current) patch(id, updated);
    } catch {
      enqueue({ id, patch: { status }, enqueuedAt: new Date().toISOString() });
      setPending((n) => n + 1);
    }
  }

  async function deleteApp(id: string) {
    const snapshot = apps;
    remove(id);
    try {
      await api.deleteApplication(id);
    } catch (e) {
      setApps(snapshot);
      Alert.alert("Delete failed", (e as Error).message);
    }
  }

  const cols = showAll ? APPLICATION_STATUSES : ACTIVE_COLS;
  const grouped = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, [] as Application[]])
  ) as Record<ApplicationStatus, Application[]>;
  for (const a of apps) grouped[a.status].push(a);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>
          Tracker <Text style={s.titleMuted}>({apps.length})</Text>
        </Text>
        <View style={s.headerRight}>
          {pending > 0 && (
            <View style={s.syncBadge}>
              <Text style={s.syncText}>{pending} pending</Text>
            </View>
          )}
          <TouchableOpacity style={s.toggleWrap} onPress={() => setShowAll((v) => !v)}>
            <Text style={s.toggleText}>{showAll ? "Active" : "All"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Terminal counts */}
      {(grouped.accepted.length > 0 || grouped.rejected.length > 0) && (
        <View style={s.termRow}>
          {grouped.accepted.length > 0 && (
            <Text style={[s.termStat, { color: colors.status.accepted.fg }]}>
              ✓ {grouped.accepted.length} accepted
            </Text>
          )}
          {grouped.rejected.length > 0 && (
            <Text style={[s.termStat, { color: colors.status.rejected.fg }]}>
              ✕ {grouped.rejected.length} rejected
            </Text>
          )}
        </View>
      )}

      {/* Kanban horizontal scroll */}
      {apps.length === 0 && !busy ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>No applications yet.</Text>
          <Text style={s.emptyHint}>Open a job and tap "Save to tracker".</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={COL_WIDTH + space.md}
          decelerationRate="fast"
          contentContainerStyle={s.kanban}
          refreshControl={
            <RefreshControl refreshing={busy} onRefresh={() => load(false)} tintColor={colors.brand} />
          }
        >
          {cols.map((status) => {
            const colApps = grouped[status];
            const col = colors.status[status];
            return (
              <View key={status} style={[s.col, { width: COL_WIDTH }]}>
                <View style={s.colHead}>
                  <Text style={s.colLabel}>{STATUS_LABEL[status]}</Text>
                  <View style={[s.colCount, { backgroundColor: col.bg }]}>
                    <Text style={[s.colCountText, { color: col.fg }]}>{colApps.length}</Text>
                  </View>
                </View>
                <FlatList
                  data={colApps}
                  keyExtractor={(a) => a.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <View style={{ marginBottom: space.sm }}>
                      <SwipeableApplicationCard
                        app={item}
                        onMove={(st) => move(item.id, st)}
                        onDelete={() => deleteApp(item.id)}
                      />
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={s.emptyCol}>
                      <Text style={s.emptyColText}>Empty</Text>
                    </View>
                  }
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title:      { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  titleMuted: { fontWeight: "400", color: colors.inkSoft },
  toggleWrap: {
    paddingHorizontal: space.sm, paddingVertical: 4,
    borderRadius: radius.sm, backgroundColor: colors.brandBg,
  },
  toggleText:  { fontSize: fontSize.sm, color: colors.brand, fontWeight: "600" },
  syncBadge:   { backgroundColor: "#FEF3C7", borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  syncText:    { fontSize: fontSize.xs, color: "#92400E", fontWeight: "600" },
  termRow:     { flexDirection: "row", gap: space.lg, paddingHorizontal: space.md, paddingBottom: space.sm },
  termStat:    { fontSize: fontSize.sm, fontWeight: "600" },
  kanban:      { paddingHorizontal: space.md, paddingBottom: 100, gap: space.md, alignItems: "flex-start" },
  col: {
    backgroundColor: "#F3F4F6",
    borderRadius: radius.lg,
    padding: space.sm,
    minHeight: 200,
  },
  colHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: space.sm, paddingHorizontal: 2,
  },
  colLabel: {
    fontSize: fontSize.xs, fontWeight: "700", color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  colCount:     { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  colCountText: { fontSize: fontSize.xs, fontWeight: "700" },
  emptyCol:     { alignItems: "center", paddingVertical: space.xl },
  emptyColText: { fontSize: fontSize.xs, color: colors.inkMuted },
  emptyWrap:    { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyTitle:   { fontSize: fontSize.md, color: colors.inkSoft },
  emptyHint:    { fontSize: fontSize.sm, color: colors.inkMuted, marginTop: space.xs },
});

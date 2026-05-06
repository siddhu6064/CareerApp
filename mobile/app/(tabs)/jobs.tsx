import { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert,
} from "react-native";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { JobCard } from "@/components/JobCard";
import { colors, fontSize, radius, space } from "@/lib/theme";
import type { Job } from "@/lib/types";

export default function JobsScreen() {
  const authed = useStore((s) => s.authed);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.jobs({ page: 1, page_size: 50 });
      setJobs(r.items);
      setTotal(r.total);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  async function ingestSample() {
    try {
      const r = await api.ingestJobs(["software engineer", "designer", "data scientist"]);
      Alert.alert("Sample ingested", `${r.inserted} new jobs added.`);
      load();
    } catch (e) {
      Alert.alert("Ingest failed", (e as Error).message);
    }
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>
          Jobs <Text style={s.titleMuted}>({total})</Text>
        </Text>
      </View>

      {err && <Text style={s.errorText}>{err}</Text>}

      {!busy && jobs.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyText}>No jobs yet.</Text>
          <TouchableOpacity style={s.ingestBtn} onPress={ingestSample}>
            <Text style={s.ingestBtnText}>Ingest sample jobs</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => <JobCard job={item} />}
        contentContainerStyle={{ padding: space.md, gap: space.sm, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.brand} />
        }
        ListFooterComponent={
          jobs.length > 0 ? (
            <TouchableOpacity style={s.ingestBtnSmall} onPress={ingestSample}>
              <Text style={s.ingestBtnSmallText}>+ Ingest more sample jobs</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.md, paddingBottom: space.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  titleMuted: { fontWeight: "400", color: colors.inkSoft },
  errorText: { color: "#DC2626", padding: space.md },
  empty: { padding: space.xl, alignItems: "center", marginTop: space.xxl },
  emptyText: { color: colors.inkSoft, fontSize: fontSize.md, marginBottom: space.md },
  ingestBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md,
  },
  ingestBtnText: { color: "#fff", fontWeight: "600" },
  ingestBtnSmall: {
    marginTop: space.md, alignItems: "center", paddingVertical: space.md,
  },
  ingestBtnSmallText: { color: colors.brand, fontWeight: "500" },
});

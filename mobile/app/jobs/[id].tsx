import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { TailorPanel } from "@/components/TailorPanel";
import { colors, fontSize, radius, space } from "@/lib/theme";
import type { Job } from "@/lib/types";

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(true);
  const [savingApp, setSavingApp] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.job(id)
      .then(setJob)
      .catch((e: Error) => Alert.alert("Load failed", e.message))
      .finally(() => setBusy(false));
  }, [id]);

  async function saveToTracker() {
    if (!job) return;
    setSavingApp(true);
    try {
      await api.createApplication({
        job_id: job.id,
        title: job.title,
        company: job.company,
        platform: job.source,
        status: "saved",
      });
      setSaved(true);
    } catch (e) {
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSavingApp(false);
    }
  }

  if (busy) {
    return (
      <View style={s.center}><ActivityIndicator color={colors.brand} /></View>
    );
  }
  if (!job) {
    return <View style={s.center}><Text>Not found.</Text></View>;
  }

  const salary =
    job.salary_min && job.salary_max
      ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
      : null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: space.md, gap: space.md, paddingBottom: 96 }}>
      <View style={s.headerCard}>
        <Text style={s.title}>{job.title}</Text>
        <Text style={s.subtitle}>
          {job.company}
          {job.location && ` · ${job.location}`}
          {job.remote_type && job.remote_type !== "any" && ` · ${job.remote_type}`}
        </Text>

        <View style={s.metaRow}>
          {job.field && <Pill text={job.field} bg={colors.status.saved.bg} fg={colors.status.saved.fg} />}
          {job.level && job.level !== "any" && (
            <Pill text={job.level} bg={colors.status.applied.bg} fg={colors.status.applied.fg} />
          )}
          {salary && <Pill text={salary} bg={colors.status.offer.bg} fg={colors.status.offer.fg} />}
          {job.quality_score !== null && (
            <Pill text={`Q${job.quality_score}`} bg={colors.brandBg} fg={colors.brand} />
          )}
        </View>

        <View style={s.btnRow}>
          {saved ? (
            <TouchableOpacity
              style={[s.btnFilled, { backgroundColor: colors.brandBg }]}
              onPress={() => router.push("/(tabs)/tracker")}
            >
              <Text style={[s.btnFilledText, { color: colors.brand }]}>Saved → Tracker</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.btnOutline}
              onPress={saveToTracker}
              disabled={savingApp}
            >
              <Text style={s.btnOutlineText}>
                {savingApp ? "Saving…" : "Save to tracker"}
              </Text>
            </TouchableOpacity>
          )}
          {job.apply_url && (
            <TouchableOpacity
              style={s.btnFilled}
              onPress={() => job.apply_url && Linking.openURL(job.apply_url)}
            >
              <Text style={s.btnFilledText}>Apply ↗</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {job.tech_stack && job.tech_stack.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Tech Stack</Text>
          <Text style={s.body}>{job.tech_stack.join(" · ")}</Text>
        </View>
      )}

      <TailorPanel jobId={job.id} />

      {job.jd_raw && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Job Description</Text>
          <Text style={s.body}>{job.jd_raw}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles_pill, { backgroundColor: bg }]}>
      <Text style={[styles_pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles_pill = {
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: radius.pill,
};
const styles_pillText = {
  fontSize: fontSize.xs,
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.sm },
  btnRow: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  btnFilled: {
    flex: 1, backgroundColor: colors.brand,
    padding: space.sm, borderRadius: radius.md,
    alignItems: "center",
  },
  btnFilledText: { color: "#fff", fontWeight: "600" },
  btnOutline: {
    flex: 1, borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.card,
    padding: space.sm, borderRadius: radius.md,
    alignItems: "center",
  },
  btnOutlineText: { color: colors.brand, fontWeight: "600" },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: fontSize.xs, color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.4,
    marginBottom: space.sm,
  },
  body: { fontSize: fontSize.sm, color: colors.ink, lineHeight: 21 },
});

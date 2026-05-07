// Interview Prep screen — /interview-prep/[jobId]
//
// Offline-first: checks MMKV cache first, fetches from API if not cached.
// Caches result per job_id so it's available without network on interview day.
// Pro-gated: shows upgrade prompt on 402.

import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { mmkv, MMKV_KEYS } from "@/lib/mmkv";
import type { InterviewPrepOut } from "@/lib/types";
import { colors, fontSize, radius, space } from "@/lib/theme";

const PREP_KEY = (jobId: string) => `${MMKV_KEYS.INTERVIEW_PREP_PREFIX}${jobId}`;

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  behavioral:   { bg: "#DBEAFE", fg: "#1E40AF" },
  technical:    { bg: "#EDE9FE", fg: "#5B21B6" },
  situational:  { bg: "#FEF3C7", fg: "#92400E" },
  motivational: { bg: "#DCFCE7", fg: "#166534" },
};

export default function InterviewPrepScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  const [prep, setPrep]       = useState<InterviewPrepOut | null>(null);
  const [busy, setBusy]       = useState(true);
  const [generating, setGen]  = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [isProGated, setProGated] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    // 1. Try MMKV cache first
    const cached = mmkv.getObject<InterviewPrepOut>(PREP_KEY(jobId));
    if (cached) {
      setPrep(cached);
      setFromCache(true);
      setBusy(false);
      return;
    }
    // 2. Try fetching existing prep from API
    api.listInterviewPrep(jobId)
      .then((list) => {
        if (list.length > 0) {
          const latest = list[0];
          setPrep(latest);
          mmkv.setObject(PREP_KEY(jobId), latest);
        }
      })
      .catch(() => {/* Offline — stay empty */})
      .finally(() => setBusy(false));
  }, [jobId]);

  async function generate() {
    if (!jobId) return;
    setGen(true);
    try {
      const r = await api.interviewPrep(jobId);
      setPrep(r);
      setFromCache(false);
      setOpenIdx(0);
      // Cache for offline use
      mmkv.setObject(PREP_KEY(jobId), r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setProGated(true);
      } else {
        Alert.alert("Generate failed", (e as Error).message);
      }
    } finally {
      setGen(false);
    }
  }

  if (busy) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (isProGated) {
    return (
      <>
        <Stack.Screen options={{ title: "Interview Prep" }} />
        <View style={s.center}>
          <Text style={s.gateIcon}>🔒</Text>
          <Text style={s.gateTitle}>Pro feature</Text>
          <Text style={s.gateSub}>
            Interview prep questions are available on the Pro plan ($19/mo).
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Interview Prep" }} />
      <ScrollView style={s.root} contentContainerStyle={s.content}>

        {/* Header */}
        <View style={s.headerCard}>
          <Text style={s.headerTitle}>AI Interview Prep</Text>
          <Text style={s.headerSub}>
            Questions and answer frameworks based on the JD and your experience.
            {fromCache ? "\n📴 Loaded from offline cache." : ""}
          </Text>
          <TouchableOpacity
            style={[s.genBtn, generating && s.genBtnDisabled]}
            onPress={generate}
            disabled={generating}
          >
            <Text style={s.genBtnText}>
              {generating ? "Generating…" : prep ? "Regenerate" : "Generate questions"}
            </Text>
          </TouchableOpacity>
        </View>

        {prep && (
          <>
            {/* Strengths */}
            {prep.strengths.length > 0 && (
              <View style={[s.infoBox, { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" }]}>
                <Text style={[s.infoTitle, { color: "#166534" }]}>
                  💪 Strengths to emphasise
                </Text>
                {prep.strengths.map((str, i) => (
                  <Text key={i} style={[s.infoItem, { color: "#166534" }]}>✓ {str}</Text>
                ))}
              </View>
            )}

            {/* Gaps */}
            {prep.gaps_to_address.length > 0 && (
              <View style={[s.infoBox, { borderColor: "#FCD34D", backgroundColor: "#FFFBEB" }]}>
                <Text style={[s.infoTitle, { color: "#92400E" }]}>
                  ⚠ Address these proactively
                </Text>
                {prep.gaps_to_address.map((gap, i) => (
                  <Text key={i} style={[s.infoItem, { color: "#92400E" }]}>→ {gap}</Text>
                ))}
              </View>
            )}

            {/* Questions */}
            <Text style={s.sectionLabel}>
              Questions ({prep.questions.length})
            </Text>

            {prep.questions.map((q, i) => {
              const colrs = TYPE_COLORS[q.type] ?? { bg: "#F3F4F6", fg: "#374151" };
              const isOpen = openIdx === i;
              return (
                <View key={i} style={s.qCard}>
                  <TouchableOpacity
                    style={s.qHeader}
                    onPress={() => setOpenIdx(isOpen ? null : i)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={s.qMeta}>
                        <Text style={s.qNum}>Q{i + 1}</Text>
                        <View style={[s.typeTag, { backgroundColor: colrs.bg }]}>
                          <Text style={[s.typeTagText, { color: colrs.fg }]}>
                            {q.type}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.qText}>{q.question}</Text>
                    </View>
                    <Text style={s.qChevron}>{isOpen ? "▼" : "▶"}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={s.qBody}>
                      {q.why_asked ? (
                        <View style={s.qSection}>
                          <Text style={s.qSectionLabel}>Why they ask this</Text>
                          <Text style={s.qSectionText}>{q.why_asked}</Text>
                        </View>
                      ) : null}
                      {q.suggested_approach ? (
                        <View style={s.qSection}>
                          <Text style={s.qSectionLabel}>Suggested approach</Text>
                          <Text style={s.qSectionText}>{q.suggested_approach}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Talking points */}
            {prep.talking_points.length > 0 && (
              <View style={s.talkingPoints}>
                <Text style={s.sectionLabel}>Talking points to weave in</Text>
                {prep.talking_points.map((t, i) => (
                  <Text key={i} style={s.talkingItem}>• {t}</Text>
                ))}
              </View>
            )}

            <Text style={s.cacheNote}>
              {fromCache
                ? "📴 Loaded from cache — available offline"
                : `Generated ${new Date(prep.created_at).toLocaleString()}`}
            </Text>
          </>
        )}

        {!prep && !busy && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🎯</Text>
            <Text style={s.emptyTitle}>No prep questions yet</Text>
            <Text style={s.emptySub}>
              Tap "Generate questions" to get AI-powered interview prep based on this job.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: 100 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },

  headerCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: space.md, gap: space.sm,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  headerSub:   { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 20 },
  genBtn: {
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center", marginTop: space.xs,
  },
  genBtnDisabled: { opacity: 0.5 },
  genBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },

  infoBox: {
    borderRadius: radius.lg, borderWidth: 1,
    padding: space.md, gap: 4,
  },
  infoTitle: { fontSize: fontSize.sm, fontWeight: "700", marginBottom: 4 },
  infoItem:  { fontSize: fontSize.sm, lineHeight: 20 },

  sectionLabel: {
    fontSize: fontSize.xs, fontWeight: "700", color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: space.xs,
  },

  qCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  qHeader: {
    flexDirection: "row", alignItems: "flex-start",
    gap: space.sm, padding: space.md,
  },
  qMeta:   { flexDirection: "row", alignItems: "center", gap: space.sm },
  qNum:    { fontSize: fontSize.xs, fontWeight: "700", color: colors.inkSoft, fontFamily: "monospace" },
  typeTag: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  typeTagText: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "capitalize" },
  qText:    { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink, lineHeight: 20 },
  qChevron: { fontSize: 10, color: colors.inkMuted, marginTop: 4 },

  qBody: {
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: "#F9FAFB", padding: space.md, gap: space.md,
  },
  qSection:      { gap: 4 },
  qSectionLabel: {
    fontSize: fontSize.xs, fontWeight: "700", color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  qSectionText:  { fontSize: fontSize.sm, color: colors.ink, lineHeight: 20 },

  talkingPoints: { gap: space.sm },
  talkingItem:   { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 20 },

  cacheNote: {
    textAlign: "center", fontSize: fontSize.xs, color: colors.inkMuted,
    fontFamily: "monospace", marginTop: space.sm,
  },

  emptyState: { alignItems: "center", paddingVertical: space.xxl, gap: space.sm },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.inkSoft },
  emptySub:   { fontSize: fontSize.sm, color: colors.inkMuted, textAlign: "center", lineHeight: 20 },

  // Pro gate
  gateIcon:  { fontSize: 48, marginBottom: space.md },
  gateTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  gateSub:   { fontSize: fontSize.sm, color: colors.inkSoft, textAlign: "center", lineHeight: 20, maxWidth: 280 },
});

import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { colors, fontSize, radius, space } from "@/lib/theme";
import { ScoreCircle } from "./ScoreCircle";
import type { TailorResponse } from "@/lib/types";

export function TailorPanel({ jobId }: { jobId: string }) {
  const setQuota = useStore((s) => s.setQuota);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TailorResponse | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await api.tailor(jobId);
      setResult(r);
      setQuota({
        plan: "",
        tailor_count_month: r.tailor_count_month,
        tailor_limit: r.tailor_limit,
      });
    } catch (e) {
      Alert.alert("Tailor failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    if (!result) return;
    try {
      const { url, token } = await api.fetchTailoredPdfBytes(result.id);
      const ext = result.pdf_extension;
      const dest = `${FileSystem.cacheDirectory}tailored-${result.id}.${ext}`;
      const dl = await FileSystem.downloadAsync(url, dest, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, {
          mimeType: ext === "pdf" ? "application/pdf" : "text/html",
          dialogTitle: "Tailored Resume",
          UTI: ext === "pdf" ? "com.adobe.pdf" : "public.html",
        });
      } else {
        Alert.alert("Saved", `Resume saved to ${dl.uri}`);
      }
    } catch (e) {
      Alert.alert("Download failed", (e as Error).message);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>Tailor your resume</Text>
        <TouchableOpacity
          style={[s.btn, busy && { opacity: 0.5 }]}
          onPress={run}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnText}>{result ? "Re-run" : "Run tailor"}</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <>
          <View style={s.scoreRow}>
            <ScoreCircle score={result.ats_score} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={s.label}>ATS Score</Text>
              <Text style={s.scoreValue}>{result.ats_score}/100</Text>
              <Text style={s.meta}>
                via {result.sonnet_method} · {result.tailor_count_month}/
                {result.tailor_limit > 1000 ? "∞" : result.tailor_limit}
              </Text>
            </View>
            <TouchableOpacity style={s.btnOutline} onPress={openPdf}>
              <Text style={s.btnOutlineText}>Open {result.pdf_extension.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>

          {result.match_points.length > 0 && (
            <Section label={`✓ ${result.match_points.length} matches`} color="#15803D">
              {result.match_points.slice(0, 5).map((m, i) => (
                <Text key={i} style={s.bullet}>• {m}</Text>
              ))}
            </Section>
          )}

          {result.gaps.length > 0 && (
            <Section label={`⚠ ${result.gaps.length} gaps`} color="#B45309">
              {result.gaps.slice(0, 5).map((g, i) => (
                <Text key={i} style={s.bullet}>• {g}</Text>
              ))}
            </Section>
          )}

          <Section label="Preview" color={colors.ink}>
            <ScrollView
              horizontal={false}
              style={s.preview}
              showsVerticalScrollIndicator
            >
              <Text style={s.previewText}>{result.content_markdown}</Text>
            </ScrollView>
          </Section>
        </>
      )}
    </View>
  );
}

function Section({
  label, color, children,
}: { label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={[s.sectionLabel, { color }]}>{label}</Text>
      <View style={{ marginTop: space.xs }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  btn: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderRadius: radius.md,
    minWidth: 100, alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  btnOutline: {
    borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.card,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  btnOutlineText: { color: colors.brand, fontWeight: "600", fontSize: fontSize.sm },
  scoreRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: space.md, gap: space.sm,
  },
  label: { fontSize: fontSize.xs, color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 },
  scoreValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  meta: { fontSize: fontSize.xs, color: colors.inkSoft },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: "600" },
  bullet: { fontSize: fontSize.sm, color: colors.inkSoft, marginVertical: 1 },
  preview: {
    backgroundColor: colors.bg, borderRadius: radius.sm,
    padding: space.sm, maxHeight: 240,
  },
  previewText: { fontSize: fontSize.xs, fontFamily: "Courier", color: colors.ink },
});

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { colors, fontSize, radius, space } from "@/lib/theme";
import type { MasterResume } from "@/lib/types";

export default function ResumeScreen() {
  const authed = useStore((s) => s.authed);
  const master = useStore((s) => s.master);
  const setMaster = useStore((s) => s.setMaster);

  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState("");
  const [skillsCsv, setSkillsCsv] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.masterResume();
      setMaster(r);
      setSummary(r.summary ?? "");
      setSkillsCsv((r.skills ?? []).join(", "));
    } catch (e) {
      const ae = e as ApiError;
      if (ae.status === 404) {
        setMaster(null);
      } else {
        setErr(ae.message);
      }
    } finally {
      setBusy(false);
    }
  }, [setMaster]);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/plain", "text/markdown"],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];

    setBusy(true);
    setErr(null);
    try {
      const upload = await api.uploadResumeFromUri(
        asset.uri,
        asset.name,
        asset.mimeType ?? "text/plain",
      );
      Alert.alert(
        "Resume parsed",
        `Method: ${upload.parse_method}\nSkills: ${upload.skills_count}\nExperience: ${upload.experience_count}`,
      );
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBuilder() {
    setBusy(true);
    setErr(null);
    try {
      const skills = skillsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const body: Partial<MasterResume> = {
        contact_info: master?.contact_info ?? {
          name: "",
          email: "",
          phone: "",
          location: "",
          linkedin: "",
          github: "",
          website: "",
        },
        summary,
        experience: master?.experience ?? [],
        education: master?.education ?? [],
        skills,
        projects: master?.projects ?? [],
        certifications: master?.certifications ?? [],
      };
      const r = await api.putMasterResume(body);
      setMaster(r);
      setEditMode(false);
      Alert.alert("Saved", "Master resume updated.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h1}>Master resume</Text>

        {err ? <Text style={styles.error}>{err}</Text> : null}

        {!master && !busy ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No master resume yet. Upload a PDF or .txt — Claude Sonnet
              parses it into a structured profile that drives every tailor.
            </Text>
            <Pressable
              onPress={pickAndUpload}
              style={styles.primaryBtn}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>Upload resume</Text>
            </Pressable>
            <Pressable onPress={() => setEditMode(true)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>or build manually</Text>
            </Pressable>
          </View>
        ) : null}

        {master && !editMode ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>
                {master.contact_info?.name || "—"}
              </Text>

              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>
                {master.contact_info?.email || "—"}
              </Text>

              {master.contact_info?.linkedin ? (
                <>
                  <Text style={styles.label}>LinkedIn</Text>
                  <Text style={styles.value}>
                    {master.contact_info.linkedin}
                  </Text>
                </>
              ) : null}

              {master.contact_info?.github ? (
                <>
                  <Text style={styles.label}>GitHub</Text>
                  <Text style={styles.value}>{master.contact_info.github}</Text>
                </>
              ) : null}

              <Text style={styles.label}>Summary</Text>
              <Text style={styles.value}>{master.summary || "—"}</Text>

              <Text style={styles.label}>Skills ({master.skills?.length ?? 0})</Text>
              <Text style={styles.value}>
                {(master.skills ?? []).join(" · ") || "—"}
              </Text>

              <Text style={styles.label}>
                Experience ({master.experience?.length ?? 0} roles)
              </Text>
              {(master.experience ?? []).slice(0, 3).map((e, i) => (
                <Text key={i} style={styles.experience}>
                  • {e.role} @ {e.company} ({e.period})
                </Text>
              ))}

              <Text style={styles.metaLine}>
                Parsed via{" "}
                <Text style={styles.parseMethod}>
                  {master.parse_method ?? "unknown"}
                </Text>
                {master.raw_filename ? ` from ${master.raw_filename}` : ""}
              </Text>
            </View>

            <Pressable
              onPress={pickAndUpload}
              style={styles.primaryBtn}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>Replace with new upload</Text>
            </Pressable>
            <Pressable onPress={() => setEditMode(true)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Edit summary & skills</Text>
            </Pressable>
          </>
        ) : null}

        {editMode ? (
          <View style={styles.card}>
            <Text style={styles.label}>Summary</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={summary}
              onChangeText={setSummary}
              placeholder="1-3 sentences about your professional brand"
              placeholderTextColor={colors.inkMuted}
              multiline
            />

            <Text style={styles.label}>Skills (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={skillsCsv}
              onChangeText={setSkillsCsv}
              placeholder="Python, React, PostgreSQL"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
            />

            <Pressable
              onPress={saveBuilder}
              disabled={busy}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Saving…" : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setEditMode(false)}
              style={styles.linkBtn}
            >
              <Text style={styles.linkBtnText}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  h1: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: space.md,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.xl,
  },
  emptyText: {
    color: colors.inkSoft,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: space.lg,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: space.md,
  },
  value: {
    fontSize: fontSize.md,
    color: colors.ink,
    marginTop: space.xs,
  },
  experience: {
    fontSize: fontSize.sm,
    color: colors.inkSoft,
    marginTop: space.xs,
  },
  metaLine: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: space.lg,
  },
  parseMethod: {
    color: colors.brand,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.md,
    fontSize: fontSize.md,
    color: colors.ink,
    marginTop: space.xs,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: space.md,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.md,
  },
  secondaryBtn: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: fontSize.md,
  },
  linkBtn: {
    paddingVertical: space.md,
    alignItems: "center",
  },
  linkBtnText: {
    color: colors.brand,
    fontSize: fontSize.sm,
  },
  error: {
    color: "#B91C1C",
    paddingVertical: space.sm,
    fontSize: fontSize.sm,
  },
});

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { ScoreCircle } from "@/components/ScoreCircle";
import { api, ApiError, BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { colors, fontSize, radius, space } from "@/lib/theme";
import type { TailoredResume } from "@/lib/types";

export default function TailoredScreen() {
  const authed = useStore((s) => s.authed);
  const [items, setItems] = useState<TailoredResume[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.tailoredResumes();
      setItems(r);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  async function downloadAndShare(t: TailoredResume) {
    setDownloadingId(t.id);
    try {
      const token = await getToken();
      const remote = `${BASE}/api/tailored-resumes/${t.id}/pdf`;
      const ext = (t.pdf_path ?? "").endsWith(".html") ? "html" : "pdf";
      const local = `${FileSystem.cacheDirectory}tailored-${t.id}.${ext}`;

      const dl = await FileSystem.downloadAsync(remote, local, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (dl.status !== 200) {
        throw new Error(`download failed: HTTP ${dl.status}`);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, {
          mimeType: ext === "pdf" ? "application/pdf" : "text/html",
          dialogTitle: "Tailored resume",
        });
      } else {
        Alert.alert("Saved", `Downloaded to ${dl.uri}`);
      }
    } catch (e) {
      Alert.alert("Download failed", (e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TailoredRow
            item={item}
            downloading={downloadingId === item.id}
            onDownload={() => downloadAndShare(item)}
          />
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={load}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          !busy ? (
            <Text style={styles.empty}>
              No tailored resumes yet. Open a job and tap "Tailor for this job".
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function TailoredRow({
  item,
  onDownload,
  downloading,
}: {
  item: TailoredResume;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <ScoreCircle score={item.ats_score ?? 0} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.method}>
            {item.sonnet_method === "sonnet" ? "Claude Sonnet" : "Heuristic"}
            {" · "}
            {item.created_at.slice(0, 10)}
          </Text>
          <Text style={styles.matchCount}>
            {item.match_points.length} match · {item.gaps.length} gaps
          </Text>
        </View>
      </View>

      {item.match_points.slice(0, 2).map((p, i) => (
        <Text key={`m-${i}`} style={styles.match} numberOfLines={2}>
          + {p}
        </Text>
      ))}
      {item.gaps.slice(0, 2).map((g, i) => (
        <Text key={`g-${i}`} style={styles.gap} numberOfLines={2}>
          − {g}
        </Text>
      ))}

      <Pressable
        onPress={onDownload}
        disabled={downloading}
        style={[styles.dlBtn, downloading && { opacity: 0.6 }]}
      >
        <Text style={styles.dlBtnText}>
          {downloading ? "Downloading…" : "Download / share PDF"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, paddingBottom: space.xxl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.md,
  },
  method: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.ink,
  },
  matchCount: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
  match: {
    fontSize: fontSize.sm,
    color: "#065F46",
    marginTop: space.xs,
    lineHeight: 18,
  },
  gap: {
    fontSize: fontSize.sm,
    color: "#991B1B",
    marginTop: space.xs,
    lineHeight: 18,
  },
  dlBtn: {
    backgroundColor: colors.brandBg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: space.md,
  },
  dlBtnText: {
    color: colors.brand,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  empty: {
    textAlign: "center",
    color: colors.inkMuted,
    paddingVertical: space.xxl,
  },
  error: {
    color: "#B91C1C",
    fontSize: fontSize.sm,
    paddingHorizontal: space.lg,
  },
});

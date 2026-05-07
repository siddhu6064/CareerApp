import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from "react-native";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { colors, fontSize, radius, space } from "@/lib/theme";
import type { AnalyticsDigest, AnalyticsSummary } from "@/lib/types";

const PCT = (x: number) => `${Math.round(x * 100)}%`;

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
}

function StatCard({ label, value, sub, good }: CardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.cardValue, good && styles.cardValueGood]}>{value}</Text>
      {sub && <Text style={styles.cardSub}>{sub}</Text>}
    </View>
  );
}

export default function AnalyticsScreen() {
  const authed = useStore((s) => s.authed);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [digest, setDigest] = useState<AnalyticsDigest | null>(null);
  const [busy, setBusy] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setGated(false);
    try {
      const [s, d] = await Promise.all([
        api.analyticsSummary(),
        api.analyticsDigest(),
      ]);
      setSummary(s);
      setDigest(d);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 402) {
        setGated(true);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to view analytics.</Text>
      </View>
    );
  }

  if (busy && !summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (gated) {
    return (
      <ScrollView contentContainerStyle={styles.gateContainer}>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Analytics is a Pro feature</Text>
          <Text style={styles.gateBody}>
            See response, interview, and offer rates over the last 90 days, plus
            digest open and conversion tracking.
          </Text>
          <View style={styles.gateBullets}>
            {[
              "Response, interview, and offer rates",
              "Avg days to first response",
              "Digest open / click / conversion %",
            ].map((b) => (
              <Text key={b} style={styles.gateBullet}>
                ✓ {b}
              </Text>
            ))}
          </View>
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => Linking.openURL("https://[appname].com/upgrade")}
          >
            <Text style={styles.upgradeBtnText}>Upgrade to Pro · $19/mo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{err}</Text>
      </View>
    );
  }

  if (!summary || !digest) return null;

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
    >
      <Text style={styles.h1}>Last {summary.window.days} days</Text>
      <Text style={styles.muted}>{summary.total_applications} applications tracked</Text>

      <View style={styles.section}>
        <Text style={styles.h2}>Pipeline</Text>
        <View style={styles.grid}>
          <StatCard label="Applied" value={String(summary.applied_count)} />
          <StatCard
            label="Response rate"
            value={PCT(summary.response_rate)}
            sub={`${summary.responded_count}/${summary.applied_count}`}
            good={summary.response_rate >= 0.2}
          />
          <StatCard
            label="Interview rate"
            value={PCT(summary.interview_rate)}
            sub={`${summary.interviewed_count} interviews`}
          />
          <StatCard
            label="Offer rate"
            value={PCT(summary.offer_rate)}
            sub={`${summary.offered_count} offers`}
            good={summary.offer_rate > 0}
          />
          <StatCard
            label="Avg days to response"
            value={
              summary.avg_days_to_response !== null
                ? summary.avg_days_to_response.toFixed(1)
                : "—"
            }
            sub={`${summary.response_sample_size} samples`}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Daily digest</Text>
        <View style={styles.grid}>
          <StatCard label="Sent" value={String(digest.sent_count)} sub="last 90 days" />
          <StatCard
            label="Open rate"
            value={PCT(digest.open_rate)}
            sub={`${digest.opened_count} opened`}
          />
          <StatCard
            label="Click rate"
            value={PCT(digest.click_rate)}
            sub={`${digest.clicked_count} clicked`}
          />
          <StatCard
            label="Conversions"
            value={String(digest.tailor_conversions)}
            sub={`of ${digest.tailor_count_total} tailors`}
            good={digest.tailor_conversions > 0}
          />
        </View>
      </View>

      <Text style={styles.footnote}>
        For charts and per-field breakdown, view on the web at /analytics.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: colors.bg, flex: 1 },
  container: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  muted: { color: colors.inkSoft, fontSize: fontSize.sm },
  errorText: { color: "#DC2626", fontSize: fontSize.sm },

  h1: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  h2: { fontSize: fontSize.lg, fontWeight: "600", color: colors.ink, marginBottom: space.sm },

  section: { gap: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    minWidth: "47%",
    flex: 1,
  },
  cardLabel: { fontSize: fontSize.xs, color: colors.inkSoft, letterSpacing: 0.5 },
  cardValue: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 2,
  },
  cardValueGood: { color: "#047857" },
  cardSub: { fontSize: fontSize.xs, color: colors.inkSoft, marginTop: 2 },

  footnote: {
    color: colors.inkMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
    marginTop: space.md,
  },

  // Gate
  gateContainer: { padding: space.lg, justifyContent: "center", flexGrow: 1 },
  gateCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  gateTitle: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  gateBody: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 20 },
  gateBullets: { gap: 4 },
  gateBullet: { fontSize: fontSize.sm, color: colors.ink },
  upgradeBtn: {
    backgroundColor: colors.brand,
    padding: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: space.sm,
  },
  upgradeBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
});

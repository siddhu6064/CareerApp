import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
} from "react-native";
import { api } from "@/lib/api";
import { colors, radius, space, fontSize } from "@/lib/theme";

// LemonSqueezy variant IDs — injected from app.config.js / eas.json extra
const VARIANTS = {
  pro_monthly:   process.env.EXPO_PUBLIC_LS_PRO_MONTHLY_VARIANT_ID ?? "",
  pro_annual:    process.env.EXPO_PUBLIC_LS_PRO_ANNUAL_VARIANT_ID ?? "",
  coach_monthly: process.env.EXPO_PUBLIC_LS_COACH_MONTHLY_VARIANT_ID ?? "",
  coach_annual:  process.env.EXPO_PUBLIC_LS_COACH_ANNUAL_VARIANT_ID ?? "",
};

type Cadence = "monthly" | "annual";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Which plan to highlight. Defaults to "pro". */
  highlight?: "pro" | "coach";
}

export function UpgradeSheet({ visible, onClose, highlight = "pro" }: Props) {
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function subscribe(plan: "pro" | "coach") {
    const key = `${plan}_${cadence}` as keyof typeof VARIANTS;
    const variantId = VARIANTS[key];
    if (!variantId) {
      setErr("Billing not configured. Try again later.");
      return;
    }
    setBusy(plan); setErr(null);
    try {
      const { url } = await api.billingCheckout(variantId);
      await Linking.openURL(url);
      onClose();
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Upgrade your plan</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Cadence toggle */}
        <View style={s.toggleRow}>
          {(["monthly", "annual"] as Cadence[]).map((c) => (
            <TouchableOpacity
              key={c}
              style={[s.toggleBtn, cadence === c && s.toggleBtnActive]}
              onPress={() => setCadence(c)}
            >
              <Text style={[s.toggleLabel, cadence === c && s.toggleLabelActive]}>
                {c === "monthly" ? "Monthly" : "Annual  💚 Save 17%"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {err && <Text style={s.err}>{err}</Text>}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.plans}>
          {/* Pro */}
          <PlanCard
            name="Pro"
            price={cadence === "monthly" ? 19 : 190}
            cadence={cadence}
            highlight={highlight === "pro"}
            trial={cadence === "monthly" ? "7-day free trial" : undefined}
            features={[
              "100 tailors / month",
              "Unlimited tracker",
              "Cover letter generation",
              "Interview prep (offline)",
              "Full analytics",
              "ATS match % in digest",
            ]}
            cta={busy === "pro" ? "Opening…" : cadence === "monthly" ? "Start free trial" : "Subscribe"}
            disabled={busy !== null}
            onPress={() => subscribe("pro")}
          />

          {/* Coach */}
          <PlanCard
            name="Coach"
            price={cadence === "monthly" ? 49 : 490}
            cadence={cadence}
            highlight={highlight === "coach"}
            features={[
              "Everything in Pro",
              "10 client profiles",
              "Bulk tailor for clients",
              "White-label PDF",
            ]}
            cta={busy === "coach" ? "Opening…" : "Subscribe"}
            disabled={busy !== null}
            onPress={() => subscribe("coach")}
          />
        </ScrollView>

        <Text style={s.footer}>
          Billed by LemonSqueezy · Cancel any time · Prices in USD
        </Text>
      </View>
    </Modal>
  );
}

function PlanCard({
  name, price, cadence, highlight, trial, features, cta, disabled, onPress,
}: {
  name: string;
  price: number;
  cadence: Cadence;
  highlight: boolean;
  trial?: string;
  features: string[];
  cta: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[s.card, highlight && s.cardHighlight]}>
      <View style={s.cardHeader}>
        <Text style={s.planName}>{name}</Text>
        <View>
          <Text style={s.price}>
            ${price}
            <Text style={s.priceSub}>{cadence === "monthly" ? "/mo" : "/yr"}</Text>
          </Text>
          {cadence === "annual" && (
            <Text style={s.annualNote}>≈ ${Math.round(price / 12)}/mo</Text>
          )}
          {trial && <Text style={s.trial}>✦ {trial}</Text>}
        </View>
      </View>

      {features.map((f) => (
        <Text key={f} style={s.feature}>✓  {f}</Text>
      ))}

      <TouchableOpacity
        style={[s.cta, highlight ? s.ctaPrimary : s.ctaSecondary, disabled && s.ctaDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={[s.ctaLabel, !highlight && s.ctaLabelSecondary]}>
          {cta}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: space.lg },
  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.xl, paddingBottom: space.lg },
  title:     { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  close:     { fontSize: 18, color: colors.inkSoft },
  toggleRow: { flexDirection: "row", marginHorizontal: space.xl, marginBottom: space.lg, backgroundColor: colors.bg, borderRadius: radius.lg, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: space.sm, borderRadius: radius.md, alignItems: "center" },
  toggleBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  toggleLabel: { fontSize: fontSize.sm, color: colors.inkSoft, fontWeight: "500" },
  toggleLabelActive: { color: colors.ink, fontWeight: "600" },
  err:       { marginHorizontal: space.xl, marginBottom: space.md, fontSize: fontSize.sm, color: "#DC2626", textAlign: "center" },
  plans:     { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },
  card:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.xl, gap: space.sm },
  cardHighlight: { borderColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: space.xs },
  planName:  { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  price:     { fontSize: fontSize.xl, fontWeight: "800", color: colors.ink, textAlign: "right" },
  priceSub:  { fontSize: fontSize.sm, fontWeight: "400", color: colors.inkSoft },
  annualNote:{ fontSize: fontSize.xs, color: "#16A34A", textAlign: "right" },
  trial:     { fontSize: fontSize.xs, color: colors.brand, fontWeight: "600", textAlign: "right" },
  feature:   { fontSize: fontSize.sm, color: colors.ink },
  cta:       { marginTop: space.md, paddingVertical: space.md, borderRadius: radius.lg, alignItems: "center" },
  ctaPrimary:  { backgroundColor: colors.brand },
  ctaSecondary:{ borderWidth: 1, borderColor: colors.border },
  ctaDisabled: { opacity: 0.5 },
  ctaLabel:  { fontSize: fontSize.sm, fontWeight: "700", color: "#fff" },
  ctaLabelSecondary: { color: colors.ink },
  footer:    { textAlign: "center", fontSize: fontSize.xs, color: colors.inkSoft, paddingVertical: space.lg, paddingHorizontal: space.xl },
});

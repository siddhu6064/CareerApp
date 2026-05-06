import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Link } from "expo-router";
import type { Job } from "@/lib/types";
import { colors, fontSize, radius, space } from "@/lib/theme";

export function JobCard({ job }: { job: Job }) {
  const salary =
    job.salary_min && job.salary_max
      ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
      : null;

  return (
    <Link href={{ pathname: "/jobs/[id]", params: { id: job.id } }} asChild>
      <TouchableOpacity style={s.card}>
        <View style={s.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title} numberOfLines={1}>{job.title}</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {job.company}{job.location ? ` · ${job.location}` : ""}
            </Text>
          </View>
          {job.quality_score !== null && (
            <View style={s.qBadge}>
              <Text style={s.qBadgeText}>Q{job.quality_score}</Text>
            </View>
          )}
        </View>

        <View style={s.badgeRow}>
          {job.field && <Pill label={job.field} bg={colors.status.saved.bg} fg={colors.status.saved.fg} />}
          {job.level && job.level !== "any" && (
            <Pill label={job.level} bg={colors.status.applied.bg} fg={colors.status.applied.fg} />
          )}
          {job.remote_type && job.remote_type !== "any" && (
            <Pill label={job.remote_type} bg={colors.status.onsite.bg} fg={colors.status.onsite.fg} />
          )}
          {salary && <Pill label={salary} bg={colors.status.offer.bg} fg={colors.status.offer.fg} />}
        </View>

        {job.tech_stack && job.tech_stack.length > 0 && (
          <Text style={s.techStack} numberOfLines={1}>
            {job.tech_stack.slice(0, 6).join(" · ")}
          </Text>
        )}
      </TouchableOpacity>
    </Link>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
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
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  subtitle: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: 2 },
  qBadge: {
    paddingHorizontal: space.sm, paddingVertical: 2,
    borderRadius: radius.sm, backgroundColor: colors.brandBg,
  },
  qBadgeText: { fontSize: fontSize.xs, color: colors.brand, fontWeight: "600" },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: space.sm, flexWrap: "wrap" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  techStack: { marginTop: space.sm, fontSize: fontSize.xs, color: colors.inkSoft },
});

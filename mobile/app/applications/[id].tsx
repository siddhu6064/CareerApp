import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Platform, ActionSheetIOS,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";
import { colors, fontSize, radius, space } from "@/lib/theme";
import {
  APPLICATION_STATUSES,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
  type Interview,
  type RecruiterContact,
  type SalaryDetails,
} from "@/lib/types";

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const patchInStore = useStore((s) => s.patchApplication);
  const removeFromStore = useStore((s) => s.removeApplication);

  const [app, setApp] = useState<Application | null>(null);
  const [contacts, setContacts] = useState<RecruiterContact[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [salary, setSalary] = useState<SalaryDetails[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.application(id),
      api.contacts(id),
      api.interviews(id),
      api.salary(id),
    ])
      .then(([a, c, i, s]) => {
        setApp(a);
        setContacts(c);
        setInterviews(i);
        setSalary(s);
      })
      .catch((e: Error) => Alert.alert("Load failed", e.message))
      .finally(() => setBusy(false));
  }, [id]);

  function pickStatus() {
    if (!app) return;
    const opts = APPLICATION_STATUSES.map((s) => STATUS_LABEL[s]).concat(["Cancel"]);
    const cancelIdx = opts.length - 1;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: cancelIdx, title: "Move to…" },
        (i) => {
          if (i !== cancelIdx) move(APPLICATION_STATUSES[i]);
        },
      );
    } else {
      Alert.alert("Move to…", undefined, [
        ...APPLICATION_STATUSES.map((stat) => ({
          text: STATUS_LABEL[stat],
          onPress: () => move(stat),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  async function move(status: ApplicationStatus) {
    if (!app || app.status === status) return;
    const before = app.status;
    setApp({ ...app, status });
    patchInStore(app.id, { status });
    try {
      const updated = await api.updateApplication(app.id, { status });
      setApp(updated);
      patchInStore(app.id, updated);
    } catch (e) {
      setApp({ ...app, status: before });
      patchInStore(app.id, { status: before });
      Alert.alert("Move failed", (e as Error).message);
    }
  }

  function confirmDelete() {
    if (!app) return;
    Alert.alert("Delete application?", `${app.title} @ ${app.company}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteApplication(app.id);
            removeFromStore(app.id);
            router.back();
          } catch (e) {
            Alert.alert("Delete failed", (e as Error).message);
          }
        },
      },
    ]);
  }

  if (busy) {
    return <View style={s.center}><ActivityIndicator color={colors.brand} /></View>;
  }
  if (!app) return null;

  return (
    <>
      <Stack.Screen options={{ title: app.company || "Application" }} />
      <ScrollView
        style={s.container}
        contentContainerStyle={{ padding: space.md, gap: space.md, paddingBottom: 96 }}
      >
        {/* Header */}
        <View style={s.headerCard}>
          <Text style={s.title}>{app.title}</Text>
          <Text style={s.subtitle}>
            {app.company}
            {app.platform ? ` · via ${app.platform}` : ""}
          </Text>

          <View style={s.metaRow}>
            <StatusBadge status={app.status} />
            {app.applied_at && (
              <Text style={s.meta}>
                Applied {new Date(app.applied_at).toLocaleDateString()}
              </Text>
            )}
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity style={s.btnFilled} onPress={pickStatus}>
              <Text style={s.btnFilledText}>Move stage →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnDanger} onPress={confirmDelete}>
              <Text style={s.btnDangerText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <NotesCard
          appId={app.id}
          initial={app.notes ?? ""}
          onSaved={(notes) => {
            setApp({ ...app, notes });
            patchInStore(app.id, { notes });
          }}
        />

        {/* Status history */}
        {app.status_history.length > 1 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Status history</Text>
            {app.status_history.map((h, i) => (
              <View key={i} style={s.historyRow}>
                <View style={s.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.historyText}>
                    <Text style={{ fontWeight: "600" }}>{STATUS_LABEL[h.status]}</Text>
                    {"  "}
                    <Text style={s.meta}>
                      {new Date(h.changed_at).toLocaleString()}
                    </Text>
                  </Text>
                  {h.note ? <Text style={[s.meta, { marginTop: 1 }]}>{h.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <ContactsBlock
          appId={app.id}
          items={contacts}
          onChange={setContacts}
        />

        <InterviewsBlock
          appId={app.id}
          items={interviews}
          onChange={setInterviews}
        />

        {/* Interview Prep quick-link (Pro) */}
        {app.job_id && (
          <TouchableOpacity
            style={s.prepBtn}
            onPress={() =>
              router.push({ pathname: "/interview-prep/[jobId]", params: { jobId: app.job_id! } })
            }
          >
            <Text style={s.prepBtnText}>🎯 Interview Prep (Pro)</Text>
            <Text style={s.prepBtnSub}>AI questions + frameworks — cached offline →</Text>
          </TouchableOpacity>
        )}

        <SalaryBlock
          appId={app.id}
          items={salary}
          onChange={setSalary}
        />
      </ScrollView>
    </>
  );
}

// ─── Notes ──────────────────────────────────────────────────────────
function NotesCard({
  appId, initial, onSaved,
}: {
  appId: string;
  initial: string;
  onSaved: (notes: string) => void;
}) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateApplication(appId, { notes: val });
      onSaved(val);
    } catch (e) {
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = val !== initial;

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Notes</Text>
      <TextInput
        value={val}
        onChangeText={setVal}
        multiline
        numberOfLines={4}
        placeholder="Recruiter pitch, comp signal, prep links…"
        placeholderTextColor={colors.inkMuted}
        style={s.textarea}
      />
      <TouchableOpacity
        onPress={save}
        disabled={!dirty || saving}
        style={[s.btnFilled, (!dirty || saving) && { opacity: 0.5 }, { marginTop: space.sm, alignSelf: "flex-start" }]}
      >
        <Text style={s.btnFilledText}>{saving ? "Saving…" : "Save notes"}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Contacts ──────────────────────────────────────────────────────
function ContactsBlock({
  appId, items, onChange,
}: {
  appId: string;
  items: RecruiterContact[];
  onChange: (cs: RecruiterContact[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("recruiter");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api.addContact(appId, {
        name: name.trim(),
        role: role || undefined,
        email: email || undefined,
        linkedin_url: linkedin || undefined,
      });
      onChange([created, ...items]);
      setName(""); setEmail(""); setLinkedin(""); setRole("recruiter"); setOpen(false);
    } catch (e) {
      Alert.alert("Add contact failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>
          Contacts <Text style={s.sectionCount}>({items.length})</Text>
        </Text>
        <TouchableOpacity onPress={() => setOpen((v) => !v)}>
          <Text style={s.linkText}>{open ? "Cancel" : "+ Add"}</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={s.formBox}>
          <TextInput
            autoFocus value={name} onChangeText={setName}
            placeholder="Name (required)" placeholderTextColor={colors.inkMuted}
            style={s.input}
          />
          <TextInput
            value={role} onChangeText={setRole}
            placeholder="recruiter / hiring_manager / interviewer"
            placeholderTextColor={colors.inkMuted}
            style={s.input}
          />
          <TextInput
            value={email} onChangeText={setEmail}
            placeholder="email@example.com" placeholderTextColor={colors.inkMuted}
            keyboardType="email-address" autoCapitalize="none"
            style={s.input}
          />
          <TextInput
            value={linkedin} onChangeText={setLinkedin}
            placeholder="LinkedIn URL" placeholderTextColor={colors.inkMuted}
            autoCapitalize="none" style={s.input}
          />
          <TouchableOpacity
            onPress={add} disabled={busy || !name.trim()}
            style={[s.btnFilled, (busy || !name.trim()) && { opacity: 0.5 }, { alignSelf: "flex-start", marginTop: space.xs }]}
          >
            <Text style={s.btnFilledText}>{busy ? "Adding…" : "Add"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={s.empty}>No contacts yet.</Text>
      ) : (
        items.map((c) => (
          <View key={c.id} style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle}>
                {c.name}
                {c.role ? <Text style={s.meta}>  ·  {c.role.replace("_", " ")}</Text> : null}
              </Text>
              {(c.email || c.phone) && (
                <Text style={s.meta} numberOfLines={1}>
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Interviews ────────────────────────────────────────────────────
function InterviewsBlock({
  appId, items, onChange,
}: {
  appId: string;
  items: Interview[];
  onChange: (is: Interview[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState("phone_screen");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("remote");
  const [interviewers, setInterviewers] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const names = interviewers.split(",").map((s) => s.trim()).filter(Boolean);
      const created = await api.addInterview(appId, {
        round,
        duration_min: duration ? Number(duration) : undefined,
        interviewer_names: names,
        location: location || undefined,
      });
      onChange([...items, created]);
      setRound("phone_screen"); setDuration(""); setLocation("remote"); setInterviewers(""); setOpen(false);
    } catch (e) {
      Alert.alert("Add interview failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickOutcome(iv: Interview) {
    const opts = ["Pending", "Passed", "Failed", "Cancel"];
    const handle = (i: number) => {
      const map = ["pending", "passed", "failed"];
      if (i < 3) setOutcome(iv.id, map[i]);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: 3, title: "Outcome" },
        handle,
      );
    } else {
      Alert.alert("Outcome", undefined, [
        { text: "Pending", onPress: () => handle(0) },
        { text: "Passed", onPress: () => handle(1) },
        { text: "Failed", onPress: () => handle(2) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  async function setOutcome(id: string, outcome: string) {
    onChange(items.map((iv) => iv.id === id ? { ...iv, outcome } : iv));
    try {
      await api.updateInterview(appId, id, { outcome });
    } catch (e) {
      Alert.alert("Update failed", (e as Error).message);
    }
  }

  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>
          Interviews <Text style={s.sectionCount}>({items.length})</Text>
        </Text>
        <TouchableOpacity onPress={() => setOpen((v) => !v)}>
          <Text style={s.linkText}>{open ? "Cancel" : "+ Add"}</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={s.formBox}>
          <TextInput
            value={round} onChangeText={setRound}
            placeholder="round (recruiter | phone_screen | technical | onsite | final)"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none" style={s.input}
          />
          <TextInput
            value={duration} onChangeText={setDuration}
            placeholder="Duration (minutes)" placeholderTextColor={colors.inkMuted}
            keyboardType="numeric" style={s.input}
          />
          <TextInput
            value={location} onChangeText={setLocation}
            placeholder="remote / Zoom / SF office"
            placeholderTextColor={colors.inkMuted}
            style={s.input}
          />
          <TextInput
            value={interviewers} onChangeText={setInterviewers}
            placeholder="Interviewer names, comma-separated"
            placeholderTextColor={colors.inkMuted}
            style={s.input}
          />
          <TouchableOpacity
            onPress={add} disabled={busy}
            style={[s.btnFilled, busy && { opacity: 0.5 }, { alignSelf: "flex-start", marginTop: space.xs }]}
          >
            <Text style={s.btnFilledText}>{busy ? "Adding…" : "Add"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={s.empty}>No interviews scheduled.</Text>
      ) : (
        items.map((iv) => (
          <TouchableOpacity key={iv.id} onPress={() => pickOutcome(iv)} style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle}>{iv.round.replace("_", " ")}</Text>
              <Text style={s.meta}>
                {iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "no time set"}
                {iv.duration_min ? ` · ${iv.duration_min}m` : ""}
                {iv.location ? ` · ${iv.location}` : ""}
              </Text>
              {iv.interviewer_names && iv.interviewer_names.length > 0 && (
                <Text style={s.meta}>with {iv.interviewer_names.join(", ")}</Text>
              )}
            </View>
            <View style={[s.outcomePill, outcomeStyle(iv.outcome)]}>
              <Text style={[s.outcomePillText, outcomeTextStyle(iv.outcome)]}>
                {iv.outcome ?? "pending"}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function outcomeStyle(o: string | null | undefined) {
  if (o === "passed") return { backgroundColor: colors.status.offer.bg };
  if (o === "failed") return { backgroundColor: colors.status.rejected.bg };
  return { backgroundColor: colors.status.saved.bg };
}
function outcomeTextStyle(o: string | null | undefined) {
  if (o === "passed") return { color: colors.status.offer.fg };
  if (o === "failed") return { color: colors.status.rejected.fg };
  return { color: colors.status.saved.fg };
}

// ─── Salary ────────────────────────────────────────────────────────
function SalaryBlock({
  appId, items, onChange,
}: {
  appId: string;
  items: SalaryDetails[];
  onChange: (s: SalaryDetails[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [baseMin, setBaseMin] = useState("");
  const [baseMax, setBaseMax] = useState("");
  const [bonus, setBonus] = useState("");
  const [equity, setEquity] = useState("");
  const [vesting, setVesting] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const created = await api.addSalary(appId, {
        base_min: baseMin ? Number(baseMin) : undefined,
        base_max: baseMax ? Number(baseMax) : undefined,
        bonus: bonus ? Number(bonus) : undefined,
        equity_value: equity ? Number(equity) : undefined,
        equity_vesting: vesting || undefined,
        currency: "USD",
      });
      onChange([created, ...items]);
      setBaseMin(""); setBaseMax(""); setBonus(""); setEquity(""); setVesting(""); setOpen(false);
    } catch (e) {
      Alert.alert("Add comp failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function fmt(n: number | null | undefined): string {
    if (n === null || n === undefined) return "—";
    return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  }

  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>
          Comp <Text style={s.sectionCount}>({items.length})</Text>
        </Text>
        <TouchableOpacity onPress={() => setOpen((v) => !v)}>
          <Text style={s.linkText}>{open ? "Cancel" : "+ Add"}</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={s.formBox}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <TextInput
              value={baseMin} onChangeText={setBaseMin}
              placeholder="Base min" placeholderTextColor={colors.inkMuted}
              keyboardType="numeric" style={[s.input, { flex: 1 }]}
            />
            <TextInput
              value={baseMax} onChangeText={setBaseMax}
              placeholder="Base max" placeholderTextColor={colors.inkMuted}
              keyboardType="numeric" style={[s.input, { flex: 1 }]}
            />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <TextInput
              value={bonus} onChangeText={setBonus}
              placeholder="Bonus" placeholderTextColor={colors.inkMuted}
              keyboardType="numeric" style={[s.input, { flex: 1 }]}
            />
            <TextInput
              value={equity} onChangeText={setEquity}
              placeholder="Equity total" placeholderTextColor={colors.inkMuted}
              keyboardType="numeric" style={[s.input, { flex: 1 }]}
            />
          </View>
          <TextInput
            value={vesting} onChangeText={setVesting}
            placeholder="Vesting (e.g. 4y / 1y cliff)" placeholderTextColor={colors.inkMuted}
            style={s.input}
          />
          <TouchableOpacity
            onPress={add} disabled={busy}
            style={[s.btnFilled, busy && { opacity: 0.5 }, { alignSelf: "flex-start", marginTop: space.xs }]}
          >
            <Text style={s.btnFilledText}>{busy ? "Adding…" : "Add"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={s.empty}>No comp data yet.</Text>
      ) : (
        items.map((it) => (
          <View key={it.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>
                {fmt(it.base_min)}–{fmt(it.base_max)} base
                {it.bonus ? `  · ${fmt(it.bonus)} bonus` : ""}
              </Text>
              {it.equity_value !== null && it.equity_value !== undefined && (
                <Text style={s.meta}>
                  {fmt(it.equity_value)} equity
                  {it.equity_vesting ? ` · ${it.equity_vesting}` : ""}
                </Text>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  headerCard: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: space.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: 4 },
  metaRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    marginTop: space.sm, flexWrap: "wrap",
  },
  meta: { fontSize: fontSize.xs, color: colors.inkSoft },
  btnRow: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  btnFilled: {
    backgroundColor: colors.brand,
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderRadius: radius.md, alignItems: "center",
  },
  btnFilledText: { color: "#fff", fontWeight: "600", fontSize: fontSize.sm },
  btnDanger: {
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, alignItems: "center",
  },
  btnDangerText: { color: "#B91C1C", fontWeight: "600", fontSize: fontSize.sm },

  section: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: space.md,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  sectionCount: { fontWeight: "400", color: colors.inkSoft, fontSize: fontSize.sm },
  linkText: { color: colors.brand, fontSize: fontSize.sm, fontWeight: "500" },
  empty: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: space.xs },

  formBox: {
    padding: space.sm, marginBottom: space.sm,
    backgroundColor: colors.bg, borderRadius: radius.md,
    gap: space.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: space.sm, paddingVertical: space.sm,
    fontSize: fontSize.sm, color: colors.ink,
  },
  textarea: {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: space.sm,
    fontSize: fontSize.sm, color: colors.ink, minHeight: 80, textAlignVertical: "top",
  },

  row: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: fontSize.sm, fontWeight: "500", color: colors.ink },
  outcomePill: {
    paddingHorizontal: space.sm, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  outcomePillText: {
    fontSize: fontSize.xs, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.4,
  },

  historyRow: { flexDirection: "row", paddingVertical: space.xs, gap: space.sm },
  historyDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.brand, marginTop: 6,
  },
  historyText: { fontSize: fontSize.sm, color: colors.ink },

  // interview prep quick-link
  prepBtn: {
    backgroundColor: colors.brandBg,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.brand,
    padding: space.md, gap: 4,
  },
  prepBtnText: { fontSize: fontSize.sm, fontWeight: "700" as const, color: colors.brand },
  prepBtnSub:  { fontSize: fontSize.xs, color: colors.brand, opacity: 0.7 },
});

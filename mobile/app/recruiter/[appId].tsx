// Recruiter contact screen.
// Route: /recruiter/[appId]
// Shows existing contacts + add/edit form.
// One-tap to call (tel:) or email (mailto:).
// Linked from application detail screen.

import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, Linking, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { api } from "@/lib/api";
import type { RecruiterContact } from "@/lib/types";
import { colors, fontSize, radius, space } from "@/lib/theme";

export default function RecruiterScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const router = useRouter();

  const [contacts, setContacts] = useState<RecruiterContact[]>([]);
  const [busy, setBusy]         = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName]       = useState("");
  const [role, setRole]       = useState("");
  const [email, setEmail]     = useState("");
  const [phone, setPhone]     = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [notes, setNotes]     = useState("");

  useEffect(() => {
    if (!appId) return;
    api.contacts(appId)
      .then(setContacts)
      .catch((e: Error) => Alert.alert("Load failed", e.message))
      .finally(() => setBusy(false));
  }, [appId]);

  function resetForm() {
    setName(""); setRole(""); setEmail(""); setPhone(""); setLinkedin(""); setNotes("");
    setShowForm(false);
  }

  async function saveContact() {
    if (!name.trim()) { Alert.alert("Name is required"); return; }
    setSaving(true);
    try {
      const c = await api.addContact(appId!, {
        name: name.trim(),
        role: role.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setContacts((prev) => [...prev, c]);
      resetForm();
    } catch (e) {
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function call(tel: string) {
    const url = `tel:${tel.replace(/\s/g, "")}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) Linking.openURL(url);
    else Alert.alert("Cannot open dialer");
  }

  async function mail(address: string) {
    Linking.openURL(`mailto:${address}`);
  }

  async function openLinkedIn(url: string) {
    const full = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(full);
  }

  if (busy) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Recruiter Contacts" }} />
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        {/* Contact list */}
        {contacts.length === 0 && !showForm && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No contacts added yet.</Text>
            <Text style={s.emptyHint}>Add a recruiter name and contact details below.</Text>
          </View>
        )}

        {contacts.map((c) => (
          <View key={c.id} style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.contactName}>{c.name}</Text>
                {c.role && <Text style={s.contactRole}>{c.role}</Text>}
              </View>
            </View>

            {/* Action buttons */}
            <View style={s.actions}>
              {c.phone && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#DCFCE7" }]}
                  onPress={() => call(c.phone!)}
                >
                  <Text style={[s.actionBtnText, { color: "#166534" }]}>📞 Call</Text>
                </TouchableOpacity>
              )}
              {c.email && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#DBEAFE" }]}
                  onPress={() => mail(c.email!)}
                >
                  <Text style={[s.actionBtnText, { color: "#1E40AF" }]}>✉️ Email</Text>
                </TouchableOpacity>
              )}
              {c.linkedin_url && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#E0E7FF" }]}
                  onPress={() => openLinkedIn(c.linkedin_url!)}
                >
                  <Text style={[s.actionBtnText, { color: "#3730A3" }]}>in LinkedIn</Text>
                </TouchableOpacity>
              )}
            </View>

            {c.email && <Text style={s.meta}>{c.email}</Text>}
            {c.phone && <Text style={s.meta}>{c.phone}</Text>}
            {c.notes && <Text style={s.notes}>{c.notes}</Text>}
          </View>
        ))}

        {/* Add contact form */}
        {showForm ? (
          <View style={s.form}>
            <Text style={s.formTitle}>Add Contact</Text>

            <Field label="Name *">
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Recruiter name"
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <Field label="Role / Title">
              <TextInput
                style={s.input}
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Technical Recruiter"
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <Field label="Email">
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="recruiter@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <Field label="Phone">
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 000 0000"
                keyboardType="phone-pad"
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <Field label="LinkedIn URL">
              <TextInput
                style={s.input}
                value={linkedin}
                onChangeText={setLinkedin}
                placeholder="linkedin.com/in/handle"
                autoCapitalize="none"
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <Field label="Notes">
              <TextInput
                style={[s.input, s.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any notes…"
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.inkMuted}
              />
            </Field>

            <View style={s.formBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, saving && s.disabled]}
                onPress={saveContact}
                disabled={saving}
              >
                <Text style={s.saveText}>{saving ? "Saving…" : "Save contact"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
            <Text style={s.addBtnText}>+ Add contact</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, paddingBottom: 100, gap: space.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyText: { fontSize: fontSize.md, color: colors.inkSoft },
  emptyHint: { fontSize: fontSize.sm, color: colors.inkMuted, marginTop: space.xs, textAlign: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1, borderColor: colors.border,
    gap: space.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandBg,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: fontSize.lg, fontWeight: "700", color: colors.brand },
  contactName: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  contactRole: { fontSize: fontSize.sm, color: colors.inkSoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actionBtn: {
    paddingHorizontal: space.md, paddingVertical: 6,
    borderRadius: radius.pill,
  },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: "600" },
  meta: { fontSize: fontSize.sm, color: colors.inkSoft },
  notes: { fontSize: fontSize.sm, color: colors.inkSoft, fontStyle: "italic" },
  form: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  formTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink, marginBottom: space.md },
  fieldLabel: { fontSize: fontSize.xs, color: colors.inkSoft, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.ink, backgroundColor: colors.card,
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  formBtns: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  cancelBtn: {
    flex: 1, paddingVertical: 12, alignItems: "center",
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  cancelText: { fontSize: fontSize.sm, color: colors.inkSoft, fontWeight: "600" },
  saveBtn: {
    flex: 2, paddingVertical: 12, alignItems: "center",
    borderRadius: radius.md, backgroundColor: colors.brand,
  },
  saveText: { fontSize: fontSize.sm, color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  addBtn: {
    padding: space.md, alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 2, borderStyle: "dashed", borderColor: colors.border,
  },
  addBtnText: { fontSize: fontSize.sm, color: colors.brand, fontWeight: "600" },
});

import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { setToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { colors, fontSize, radius, space } from "@/lib/theme";

export default function SignInScreen() {
  const router = useRouter();
  const setAuthed = useStore((s) => s.setAuthed);
  const [token, setTok] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!token.trim()) return;
    setBusy(true);
    try {
      await setToken(token.trim());
      await api.me(); // verify
      setAuthed(true);
      router.replace("/(tabs)/jobs");
    } catch (e) {
      Alert.alert("Sign-in failed", (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.box}>
        <Text style={s.title}>AppName</Text>
        <Text style={s.subtitle}>
          Paste the bearer token from your FastAPI server's stdout
          (look for <Text style={s.mono}>api_token=…</Text>).
          {"\n\n"}
          SaaS auth (Google / email) lands when Supabase is wired in.
        </Text>
        <TextInput
          style={s.input}
          value={token}
          onChangeText={setTok}
          placeholder="Bearer token"
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!busy}
        />
        <TouchableOpacity
          style={[s.button, (busy || !token.trim()) && s.buttonDisabled]}
          disabled={busy || !token.trim()}
          onPress={submit}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center" },
  box: { padding: space.xl },
  title: {
    fontSize: fontSize.xxl, fontWeight: "700",
    color: colors.brand, marginBottom: space.sm,
  },
  subtitle: {
    fontSize: fontSize.sm, color: colors.inkSoft,
    marginBottom: space.xl, lineHeight: 20,
  },
  mono: { fontFamily: "Courier", color: colors.brand },
  input: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md, fontSize: fontSize.sm,
    backgroundColor: colors.card,
    fontFamily: "Courier",
    marginBottom: space.md,
  },
  button: {
    backgroundColor: colors.brand,
    padding: space.md, borderRadius: radius.md,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: fontSize.md },
});

import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { registerPushTokenIfPossible } from "@/lib/notifications";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const setAuthed = useStore((s) => s.setAuthed);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      setHasToken(!!t);
      setAuthed(!!t);
      setReady(true);
      // Once we know the user is signed in, attempt push registration.
      // The helper is idempotent and silent on failure.
      if (t) registerPushTokenIfPossible();
    });
  }, [setAuthed]);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === "signin";
    if (!hasToken && !inAuthGroup) {
      router.replace("/signin");
    } else if (hasToken && inAuthGroup) {
      router.replace("/(tabs)/jobs");
    }
  }, [ready, hasToken, segments, router]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="signin" />
          <Stack.Screen name="jobs/[id]" options={{ headerShown: true, title: "Job" }} />
          <Stack.Screen name="applications/[id]" options={{ headerShown: true, title: "Application" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

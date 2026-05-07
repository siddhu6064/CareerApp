import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { getToken } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { registerPushTokenIfPossible } from "@/lib/notifications";

// Deep link URL pattern: appname://jobs/[id] or https://app.appname.io/jobs/[id]
// The digest email CTA links to /jobs/[id] — this handler navigates after auth.
function useDeepLinks(ready: boolean, hasToken: boolean) {
  const router = useRouter();

  function handleUrl(url: string | null) {
    if (!url || !ready || !hasToken) return;
    try {
      // Strip custom scheme or domain — keep only the path portion
      const parsed = Linking.parse(url);
      const path = parsed.path ?? "";

      // /jobs/[id]
      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (jobMatch) {
        router.push({ pathname: "/jobs/[id]", params: { id: jobMatch[1] } });
        return;
      }

      // /applications/[id]
      const appMatch = path.match(/^\/applications\/([^/]+)$/);
      if (appMatch) {
        router.push({ pathname: "/applications/[id]", params: { id: appMatch[1] } });
        return;
      }

      // /tracker — go to tracker tab
      if (path === "/tracker" || path === "/tracker/") {
        router.push("/(tabs)/tracker");
        return;
      }
    } catch {
      // Malformed URL — silently ignore
    }
  }

  useEffect(() => {
    if (!ready) return;

    // Handle URL that launched the app cold
    Linking.getInitialURL().then(handleUrl);

    // Handle URLs when app is already running
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasToken]);
}

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

  // Wire deep link handler — routes after auth is confirmed
  useDeepLinks(ready, hasToken);

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
          <Stack.Screen name="recruiter/[appId]" options={{ headerShown: true, title: "Recruiter Contacts" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

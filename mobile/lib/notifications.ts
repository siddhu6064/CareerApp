// Mobile push notification registration. Requests permission on first launch,
// gets the Expo Push token, and registers it with the backend.
//
// Deep link on notification tap: the push payload includes `data.application_id`.
// Call `subscribeToNotificationTaps(handler)` in _layout.tsx to navigate on tap.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "./api";

let _registered = false;

/** Request permission, get the Expo push token, and register it with the API.
 *  Idempotent — first successful call wins per app launch. Errors are logged
 *  but never thrown (push is non-critical). */
export async function registerPushTokenIfPossible(): Promise<string | null> {
  if (_registered) return null;

  // Push tokens are physical-device only.
  if (!Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      finalStatus = requested;
    }
    if (finalStatus !== "granted") return null;

    // projectId comes from app.json's `extra.eas.projectId` once EAS is set up.
    // Until then, getExpoPushTokenAsync uses a default account-bound token.
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenResponse.data;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    await api.registerPushToken(expoToken, {
      platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
      deviceName: Device.deviceName ?? undefined,
    });
    _registered = true;
    return expoToken;
  } catch (err) {
    if (__DEV__) console.warn("Push registration failed:", err);
    return null;
  }
}

/**
 * Subscribe to notification tap events.
 * The backend sends `data: { application_id: "..." }` in every push.
 * Call the returned cleanup function in useEffect to unsubscribe.
 *
 * Usage in _layout.tsx:
 *   useEffect(() => subscribeToNotificationTaps((appId) => {
 *     router.push({ pathname: "/applications/[id]", params: { id: appId } });
 *   }), []);
 */
export function subscribeToNotificationTaps(
  onTap: (applicationId: string) => void,
): () => void {
  // Set the handler that controls how notifications appear when foregrounded
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | null;
    const appId = data?.application_id as string | undefined;
    if (appId) {
      onTap(appId);
    }
  });

  return () => sub.remove();
}


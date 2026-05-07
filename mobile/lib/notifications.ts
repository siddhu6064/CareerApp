// Mobile push notification registration. Requests permission on first launch,
// gets the Expo Push token, and registers it with the backend.
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

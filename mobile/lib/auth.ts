// Token persistence. expo-secure-store wraps iOS Keychain / Android Keystore —
// far better than AsyncStorage for credential material. MMKV (PRD-listed)
// arrives once we run `expo prebuild` for native builds; SecureStore covers
// the dev-build case fully.
import * as SecureStore from "expo-secure-store";

const KEY = "appname_token";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

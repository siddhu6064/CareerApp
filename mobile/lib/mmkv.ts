// MMKV storage wrapper.
// react-native-mmkv requires a development/production build (not Expo Go).
// EAS build is configured in mobile/eas.json — use `eas build --profile development`
// to get a build that includes MMKV native code.
//
// Graceful fallback: if MMKV is not available (Expo Go), operations
// are no-ops that log a warning. The offline-first layer handles null
// reads by fetching from the API anyway.

let _storage: import("react-native-mmkv").MMKV | null = null;

function getStorage(): import("react-native-mmkv").MMKV | null {
  if (_storage) return _storage;
  try {
    // Dynamic require so the module crash only happens at call-time,
    // not at import time (keeps Expo Go from erroring on boot).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require("react-native-mmkv") as typeof import("react-native-mmkv");
    _storage = new MMKV({ id: "appname-store" });
    return _storage;
  } catch {
    return null;
  }
}

export const mmkv = {
  getString(key: string): string | null {
    return getStorage()?.getString(key) ?? null;
  },
  setString(key: string, value: string): void {
    getStorage()?.set(key, value);
  },
  delete(key: string): void {
    getStorage()?.delete(key);
  },
  getObject<T>(key: string): T | null {
    const raw = mmkv.getString(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  setObject<T>(key: string, value: T): void {
    mmkv.setString(key, JSON.stringify(value));
  },
  isAvailable(): boolean {
    return getStorage() !== null;
  },
};

// ── Key constants ──────────────────────────────────────────────────────────
export const MMKV_KEYS = {
  APPLICATIONS: "tracker:applications",
  SYNC_QUEUE:   "tracker:sync_queue",
  INTERVIEW_PREP_PREFIX: "prep:job:", // key = "prep:job:{jobId}"
} as const;

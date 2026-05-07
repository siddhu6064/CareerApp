// Phase 10.5 — Tauri boot integration.
//
// In desktop mode, the Rust shell injects {api_url, api_token} into the
// webview as a one-shot 'appname://boot' event AND exposes a `get_boot_info`
// IPC command. This module reads from both, persists into localStorage so
// the existing api.ts client continues to work unchanged, and wires up an
// event listener so reloads (or sidecar restarts) update the values.
//
// SaaS users never see this code path — `isTauri()` returns false in the
// browser build and the module is a no-op.

"use client";

const TOKEN_KEY = "appname_token";
const URL_KEY = "appname_api_url";

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri 2 exposes window.__TAURI_INTERNALS__ when the page loads inside
  // the webview. Cheaper to check than importing @tauri-apps/api.
  return Boolean((window as any).__TAURI_INTERNALS__);
}

interface BootInfo {
  api_url: string;
  api_token: string;
}

function persist(info: BootInfo) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, info.api_token);
  window.localStorage.setItem(URL_KEY, info.api_url);
}

export async function ensureTauriBoot(): Promise<void> {
  if (!isTauri()) return;

  // Lazy-import so the SaaS bundle never pulls in @tauri-apps/api.
  let invoke: (cmd: string) => Promise<BootInfo | null>;
  let listen: (event: string, cb: (e: { payload: BootInfo }) => void) => Promise<() => void>;
  try {
    const core = await import("@tauri-apps/api/core");
    const ev = await import("@tauri-apps/api/event");
    invoke = core.invoke;
    listen = ev.listen;
  } catch (e) {
    // @tauri-apps/api isn't installed in the SaaS dev tree — silent no-op.
    console.debug("Tauri APIs unavailable:", e);
    return;
  }

  // 1) Try to read whatever the Rust shell already has.
  try {
    const info = await invoke("get_boot_info");
    if (info) persist(info as BootInfo);
  } catch (e) {
    console.warn("get_boot_info failed:", e);
  }

  // 2) Listen for the 'appname://boot' event (sidecar might still be
  //    starting; the token arrives async).
  try {
    await listen("appname://boot", (event) => {
      const payload = event.payload as BootInfo;
      if (payload?.api_token) persist(payload);
    });
  } catch (e) {
    console.warn("listen failed:", e);
  }
}

export function getDesktopApiUrl(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(URL_KEY);
}

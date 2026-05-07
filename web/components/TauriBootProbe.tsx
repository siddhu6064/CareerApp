"use client";

import { useEffect } from "react";
import { ensureTauriBoot } from "@/lib/boot";

/** No-op in SaaS. In Tauri, pulls api_url + token from the Rust shell. */
export function TauriBootProbe() {
  useEffect(() => {
    void ensureTauriBoot();
  }, []);
  return null;
}

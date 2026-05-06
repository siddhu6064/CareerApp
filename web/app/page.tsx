"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/jobs" : "/signin");
  }, [router]);
  return (
    <div className="text-center text-[var(--color-ink-soft)] py-20">Loading…</div>
  );
}

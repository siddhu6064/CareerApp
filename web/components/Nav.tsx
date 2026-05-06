"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "@/lib/api";
import { useStore } from "@/lib/store";

const links = [
  { href: "/jobs", label: "Jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/resume", label: "Resume" },
  { href: "/tailored", label: "Tailored" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { quota, setQuota, setAuthed } = useStore();
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    setTokenState(t);
    setAuthed(!!t);
    if (t) {
      api.tailorQuota().then(setQuota).catch(() => setQuota(null));
    }
  }, [path, setAuthed, setQuota]);

  function signOut() {
    clearToken();
    setAuthed(false);
    setTokenState(null);
    setQuota(null);
    router.push("/signin");
  }

  return (
    <nav className="border-b border-[var(--color-border)] bg-white">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/jobs" className="font-bold text-[var(--color-brand)] text-lg">
          AppName
        </Link>
        {token ? (
          <>
            <ul className="flex gap-4 flex-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`px-2 py-1 rounded text-sm ${
                      path?.startsWith(l.href)
                        ? "bg-[var(--color-brand-bg)] text-[var(--color-brand)] font-medium"
                        : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            {quota && (
              <span className="text-xs text-[var(--color-ink-soft)]">
                Tailor:{" "}
                <strong>
                  {quota.tailor_count_month}/
                  {quota.tailor_limit > 1000 ? "∞" : quota.tailor_limit}
                </strong>
                {" · "}
                {quota.plan}
              </span>
            )}
            <button
              onClick={signOut}
              className="text-xs text-[var(--color-ink-soft)] hover:text-red-600"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/signin"
            className="ml-auto px-3 py-1.5 text-sm bg-[var(--color-brand)] text-white rounded hover:bg-[var(--color-brand-lt)]"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}

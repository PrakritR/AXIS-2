"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Warm the marketing home route while portal shells are mounted. */
export function PublicHomePrefetch() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");

    if (typeof window.requestIdleCallback !== "function") return;
    const id = window.requestIdleCallback(() => router.prefetch("/"), { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }, [router]);

  return null;
}

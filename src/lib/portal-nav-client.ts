"use client";

import { portalBackgroundPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, type MouseEvent } from "react";

/** Smooth client navigation — keeps modified clicks (new tab, etc.) on the native link. */
export function portalNavClick(router: ReturnType<typeof useRouter>, href: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    startTransition(() => router.push(href));
  };
}

export function prefetchPortalHref(router: ReturnType<typeof useRouter>, href: string) {
  if (!portalBackgroundPrefetchEnabled()) return;
  try {
    router.prefetch(href);
  } catch {
    /* prefetch is best-effort */
  }
}

export function usePortalNavigate() {
  const router = useRouter();
  return useCallback((href: string) => {
    startTransition(() => router.push(href));
  }, [router]);
}

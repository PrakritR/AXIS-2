"use client";

import { portalBackgroundPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import { DEMO_NAVIGATE_EVENT, isDemoModeActive } from "@/lib/demo/demo-session";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, type MouseEvent } from "react";

/** Smooth client navigation — keeps modified clicks (new tab, etc.) on the native link. */
export function portalNavClick(
  router: ReturnType<typeof useRouter>,
  href: string,
  options?: { preferFullNavigation?: boolean },
) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (isDemoModeActive()) {
      window.dispatchEvent(new CustomEvent(DEMO_NAVIGATE_EVENT, { detail: { href } }));
      return;
    }
    if (options?.preferFullNavigation) {
      window.location.assign(href);
      return;
    }
    startTransition(() => {
      router.push(href);
    });
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
    // Reused portal panels also render inside the public /demo sandbox where a
    // real route push would hit the auth-gated portal layout and bounce the
    // visitor to /auth/sign-in. In demo mode, hand the target to the demo shell
    // to resolve as an in-sandbox section switch instead.
    if (isDemoModeActive()) {
      window.dispatchEvent(new CustomEvent(DEMO_NAVIGATE_EVENT, { detail: { href } }));
      return;
    }
    startTransition(() => router.push(href));
  }, [router]);
}

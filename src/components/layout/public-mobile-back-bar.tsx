"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Back control for public legal/support pages on mobile and in the native app (no marketing navbar). */
export function PublicMobileBackBar({
  label = "Back",
  fallbackHref = "/auth/sign-in",
}: {
  label?: string;
  fallbackHref?: string;
}) {
  const router = useRouter();

  const onBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [router, fallbackHref]);

  return (
    <div className="mx-auto mb-4 max-w-3xl lg:hidden [html[data-native]_&]:mb-3">
      <button
        type="button"
        data-attr="public-mobile-back"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 active:bg-primary/15 [html[data-native]_&]:min-h-9 [html[data-native]_&]:py-1"
      >
        <ChevronLeftIcon />
        <span>{label}</span>
      </button>
    </div>
  );
}

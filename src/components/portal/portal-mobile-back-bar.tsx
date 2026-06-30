"use client";

import { resolvePortalMobileBackTarget } from "@/lib/portal-mobile-back";
import type { PortalDefinition } from "@/lib/portal-types";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

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

export function PortalMobileBackBar({ definition }: { definition: PortalDefinition }) {
  const pathname = usePathname();
  const router = useRouter();

  const back = useMemo(() => resolvePortalMobileBackTarget(pathname, definition), [pathname, definition]);

  if (!back) return null;

  return (
    <div className="portal-mobile-back-bar -mx-1 mb-3 lg:hidden">
      <button
        type="button"
        onClick={() => router.push(back.href)}
        className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 active:bg-primary/15"
      >
        <ChevronLeftIcon />
        <span className="truncate">{back.label}</span>
      </button>
    </div>
  );
}

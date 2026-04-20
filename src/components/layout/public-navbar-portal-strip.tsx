"use client";

import Link from "next/link";

/**
 * Marketing nav: single Portal entry point to the shared portal sign-in page.
 */
export function PublicNavbarPortalStrip({
  className = "",
  onInteract,
}: {
  className?: string;
  /** e.g. close mobile drawer before navigating */
  onInteract?: () => void;
}) {
  return (
    <Link
      href="/auth/sign-in"
      onClick={() => onInteract?.()}
      className={`inline-flex items-center justify-center rounded-full border border-slate-200/90 bg-white px-5 py-2 text-[14px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] ${className}`}
    >
      Portal
    </Link>
  );
}

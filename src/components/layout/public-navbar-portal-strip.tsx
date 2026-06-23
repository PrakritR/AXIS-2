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
      className={`btn-metallic inline-flex items-center justify-center rounded-full px-5 py-2 text-[14px] font-semibold transition hover:brightness-105 active:scale-[0.98] ${className}`}
    >
      Open portal
    </Link>
  );
}

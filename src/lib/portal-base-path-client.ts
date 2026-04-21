"use client";

import { usePathname } from "next/navigation";

/** Canonical prefix for paid workspace URLs (`/pro` preferred; `/manager`/`/owner` legacy). */
export function usePaidPortalBasePath(): "/manager" | "/owner" | "/pro" {
  const pathname = usePathname();
  if (pathname.startsWith("/pro")) return "/pro";
  if (pathname.startsWith("/owner")) return "/owner";
  return "/manager";
}

"use client";

import { usePortalSession } from "@/hooks/use-portal-session";

/**
 * Signed-in Supabase user id for scoping portal data.
 * Returns null while loading or when not signed in.
 */
export function useManagerUserId(initial?: {
  userId?: string | null;
  email?: string | null;
}): { userId: string | null; email: string | null; ready: boolean } {
  return usePortalSession(initial);
}

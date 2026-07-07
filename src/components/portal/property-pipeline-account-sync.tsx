"use client";

import { useEffect, useRef } from "react";
import { resetPropertyPipelineClientCache } from "@/lib/demo-property-pipeline";
import { invalidateAccountLinksCache } from "@/lib/portal-data-store";
import { usePortalSession } from "@/hooks/use-portal-session";

/** Clear cross-account property pipeline cache when the signed-in portal user changes. */
export function PropertyPipelineAccountSync() {
  const session = usePortalSession();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUserId = session.userId?.trim() || null;
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && nextUserId && previousUserId !== nextUserId) {
      resetPropertyPipelineClientCache();
      invalidateAccountLinksCache();
    }
    previousUserIdRef.current = nextUserId;
  }, [session.userId]);

  return null;
}

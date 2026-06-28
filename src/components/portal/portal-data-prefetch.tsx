"use client";

import { useEffect } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { usePortalSession } from "@/hooks/use-portal-session";
import { notifyManagerApplicationsSynced, prefetchPortalData } from "@/lib/portal-data-store";
import type { PortalKind } from "@/lib/portal-types";

export function PortalDataPrefetch({ kind }: { kind: PortalKind }) {
  const session = usePortalSession();
  const { userId } = useManagerUserId();

  useEffect(() => {
    if (!session.ready) return;
    void prefetchPortalData(kind, userId ?? session.userId).then(() => {
      if (kind === "manager" || kind === "pro") {
        notifyManagerApplicationsSynced();
      }
    });
  }, [kind, session.ready, session.userId, userId]);

  return null;
}

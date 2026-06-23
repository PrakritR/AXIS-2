"use client";

import { useEffect } from "react";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  proRelationshipRowsFromInvites,
  readProRelationships,
  writeProRelationships,
} from "@/lib/pro-relationships";
import { usePortalSession } from "@/hooks/use-portal-session";

export function AccountLinksSync() {
  const session = usePortalSession();

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        if (!session.userId || cancelled) return;

        await fetch("/api/pro/purge-orphaned-co-manager-links", {
          method: "POST",
          credentials: "include",
        }).catch(() => undefined);

        const res = await fetch("/api/pro/account-links", { credentials: "include" });
        const body = (await res.json()) as {
          invites?: AccountLinkInviteDto[];
          migrationRequired?: boolean;
        };
        if (!res.ok || body.migrationRequired || cancelled) return;

        const active = (body.invites ?? []).filter((inv) => inv.status === "accepted");
        const next = proRelationshipRowsFromInvites(active);
        const existing = readProRelationships(session.userId);
        const nextIds = new Set(next.map((row) => row.id));
        const nextAxisIds = new Set(next.map((row) => row.linkedAxisId.trim().toLowerCase()));
        const changed =
          next.length !== existing.length ||
          existing.some(
            (row) =>
              !nextIds.has(row.id) ||
              !nextAxisIds.has(row.linkedAxisId.trim().toLowerCase()) ||
              !active.some((inv) => inv.id === row.id),
          ) ||
          next.some((row) => {
            const prev = existing.find((item) => item.id === row.id);
            return !prev || JSON.stringify(prev) !== JSON.stringify(row);
          });

        if (changed) {
          writeProRelationships(session.userId, next);
        }
      } catch {
        /* ignore */
      }
    };

    void sync();

    const rerun = () => {
      void sync();
    };

    window.addEventListener("focus", rerun);
    window.addEventListener("axis-pro-relationships", rerun);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", rerun);
      window.removeEventListener("axis-pro-relationships", rerun);
    };
  }, [session.userId]);

  return null;
}

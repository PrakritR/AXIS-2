"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import { readProRelationships, writeProRelationships, type ProRelationshipPerspective } from "@/lib/pro-relationships";

function perspectiveForInvite(inv: AccountLinkInviteDto): ProRelationshipPerspective {
  return inv.tabKind === "owner" ? "owner_tab" : "manager_tab";
}

export function AccountLinksSync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const res = await fetch("/api/pro/account-links", { credentials: "include" });
        const body = (await res.json()) as {
          invites?: AccountLinkInviteDto[];
          migrationRequired?: boolean;
        };
        if (!res.ok || body.migrationRequired || cancelled) return;

        const active = (body.invites ?? []).filter((inv) => inv.status === "accepted");
        const existing = readProRelationships(user.id);
        const existingById = new Map(existing.map((row) => [row.id, row]));

        let changed = false;
        const next = [...existing];

        for (const inv of active) {
          const perspective = perspectiveForInvite(inv);
          const prev = existingById.get(inv.id);
          if (
            prev &&
            prev.linkedAxisId === inv.linkedAxisId &&
            prev.linkedDisplayName === (inv.linkedDisplayName ?? undefined) &&
            prev.perspective === perspective &&
            prev.payoutPercentForManager === inv.payoutPercentForManager &&
            prev.assignedPropertyIds.join("|") === inv.assignedPropertyIds.join("|")
          ) {
            continue;
          }

          const row = {
            id: inv.id,
            linkedAxisId: inv.linkedAxisId,
            linkedDisplayName: inv.linkedDisplayName ?? undefined,
            perspective,
            payoutPercentForManager: inv.payoutPercentForManager,
            assignedPropertyIds: inv.assignedPropertyIds,
            createdAt: inv.createdAt,
          };

          if (prev) {
            const idx = next.findIndex((item) => item.id === inv.id);
            if (idx >= 0) next[idx] = row;
          } else {
            next.push(row);
          }
          changed = true;
        }

        const activeIds = new Set(active.map((inv) => inv.id));
        const filtered = next.filter((row) => {
          if (!existingById.has(row.id)) return true;
          if (!active.some((inv) => inv.id === row.id)) return true;
          return activeIds.has(row.id);
        });

        if (filtered.length !== next.length) {
          changed = true;
        }

        if (changed) {
          writeProRelationships(user.id, filtered);
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
  }, []);

  return null;
}

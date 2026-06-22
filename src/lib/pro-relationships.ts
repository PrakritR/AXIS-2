/**
 * Fallback persistence for paid-account links when Supabase invites are unavailable (offline demo).
 * Primary flow: `/api/pro/account-links` + `account_link_invites` table.
 */

import type { CoManagerPermissions } from "@/lib/co-manager-permissions";
import { coManagerPermissionsFromLegacy } from "@/lib/co-manager-permissions";
import type { AccountLinkInviteDto } from "@/lib/account-links";

export const AXIS_ID_LABEL = "Axis ID";

/** @deprecated Owner tab removed — all links are co-manager (manager) links. */
export type ProRelationshipPerspective = "manager_tab";

export type ProRelationshipRecord = {
  id: string;
  linkedAxisId: string;
  linkedDisplayName?: string;
  perspective: ProRelationshipPerspective;
  /** Amount of managed revenue this manager receives on the linked properties (0–100). */
  payoutPercentForManager: number;
  assignedPropertyIds: string[];
  /** Permissions granted by the primary manager to this co-manager. */
  coManagerPermissions?: CoManagerPermissions;
  /** @deprecated Use coManagerPermissions.editListings */
  canEditListing?: boolean;
  createdAt: string;
};

const memoryByUser = new Map<string, ProRelationshipRecord[]>();

function migrateLegacyPerspective(p: string): ProRelationshipPerspective {
  return "manager_tab";
}

export function normalizeProRelationshipRecord(raw: unknown): ProRelationshipRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const linkedAxisId = r.linkedAxisId;
  if (typeof id !== "string" || typeof linkedAxisId !== "string") return null;
  const perspective = migrateLegacyPerspective(String(r.perspective ?? ""));
  const payout = Number(r.payoutPercentForManager);
  const assigned = Array.isArray(r.assignedPropertyIds)
    ? (r.assignedPropertyIds as unknown[]).filter((x) => typeof x === "string")
    : [];
  return {
    id,
    linkedAxisId,
    linkedDisplayName: typeof r.linkedDisplayName === "string" ? r.linkedDisplayName : undefined,
    perspective,
    payoutPercentForManager: Number.isFinite(payout) ? payout : 15,
    assignedPropertyIds: assigned as string[],
    coManagerPermissions: coManagerPermissionsFromLegacy({
      canEditListing: r.canEditListing === true,
      coManagerPermissions: r.coManagerPermissions,
    }),
    canEditListing: r.canEditListing === true ? true : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
  };
}

function migrateRow(r: Record<string, unknown>): ProRelationshipRecord | null {
  return normalizeProRelationshipRecord(r);
}

export function proRelationshipRowsFromInvites(invites: AccountLinkInviteDto[]): ProRelationshipRecord[] {
  return invites
    .filter((inv) => inv.status === "accepted")
    .map((inv) => {
      const perms = coManagerPermissionsFromLegacy({
        coManagerPermissions: inv.coManagerPermissions,
      });
      return {
        id: inv.id,
        linkedAxisId: inv.linkedAxisId,
        linkedDisplayName: inv.linkedDisplayName ?? undefined,
        perspective: "manager_tab" as const,
        payoutPercentForManager: inv.payoutPercentForManager,
        assignedPropertyIds: inv.assignedPropertyIds,
        coManagerPermissions: perms,
        canEditListing: perms.editListings ? true : undefined,
        createdAt: inv.createdAt,
      };
    });
}

export function readProRelationships(userId: string): ProRelationshipRecord[] {
  if (typeof window === "undefined" || !userId.trim()) return [];
  if (!memoryByUser.has(userId)) void syncProRelationshipsFromServer(userId).catch(() => undefined);
  return memoryByUser.get(userId) ?? [];
}

export function writeProRelationships(userId: string, rows: ProRelationshipRecord[]): void {
  if (typeof window === "undefined") return;
  memoryByUser.set(userId, rows);
  window.dispatchEvent(new Event("axis-pro-relationships"));
  void fetch("/api/portal-pro-relationships", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "replace",
      rows: rows.map((row) => ({ ...row, managerUserId: userId })),
    }),
  }).catch(() => undefined);
}

export async function syncProRelationshipsFromServer(userId: string): Promise<ProRelationshipRecord[]> {
  if (typeof window === "undefined" || !userId.trim()) return [];
  const res = await fetch("/api/portal-pro-relationships", { credentials: "include", cache: "no-store" });
  if (!res.ok) return memoryByUser.get(userId) ?? [];
  const body = (await res.json()) as { rows?: unknown[] };
  const rows = (body.rows ?? []).map((x) => migrateRow(x as Record<string, unknown>)).filter(Boolean) as ProRelationshipRecord[];
  memoryByUser.set(userId, rows);
  window.dispatchEvent(new Event("axis-pro-relationships"));
  return rows;
}

export function generateRelationshipId(): string {
  return `rel-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

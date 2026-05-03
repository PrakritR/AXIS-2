/**
 * Fallback persistence for paid-account links when Supabase invites are unavailable (offline demo).
 * Primary flow: `/api/pro/account-links` + `account_link_invites` table.
 */

export const AXIS_ID_LABEL = "Axis ID";

/** Owner tab ↔ owner workspaces; Manager tab ↔ manager workspaces. */
export type ProRelationshipPerspective = "owner_tab" | "manager_tab";

export type ProRelationshipRecord = {
  id: string;
  linkedAxisId: string;
  linkedDisplayName?: string;
  perspective: ProRelationshipPerspective;
  /** Amount of managed revenue this manager receives on the linked properties (0–100). */
  payoutPercentForManager: number;
  assignedPropertyIds: string[];
  /** Whether the linked account is allowed to edit the assigned listings. */
  canEditListing?: boolean;
  createdAt: string;
};

const memoryByUser = new Map<string, ProRelationshipRecord[]>();

function migrateLegacyPerspective(p: string): ProRelationshipPerspective {
  if (p === "manager_tab" || p === "owner_tab") return p;
  /** @deprecated inverted names from earlier build */
  if (p === "owner_linked_manager") return "owner_tab";
  if (p === "manager_linked_owner") return "manager_tab";
  return "owner_tab";
}

function migrateRow(r: Record<string, unknown>): ProRelationshipRecord | null {
  if (!r || typeof r !== "object") return null;
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
    canEditListing: r.canEditListing === true ? true : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
  };
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

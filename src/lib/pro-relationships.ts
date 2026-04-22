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
  createdAt: string;
};

const STORAGE_VERSION = "v2";

function storageKey(userId: string): string {
  return `axis_pro_relationships_${userId}_${STORAGE_VERSION}`;
}

function legacyStorageKey(userId: string): string {
  return `axis_pro_relationships_${userId}_v1`;
}

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
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
  };
}

export function readProRelationships(userId: string): ProRelationshipRecord[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) {
      const leg = window.localStorage.getItem(legacyStorageKey(userId));
      if (leg) {
        const parsed = JSON.parse(leg) as unknown;
        const arr = Array.isArray(parsed) ? parsed : [];
        const rows = arr.map((x) => migrateRow(x as Record<string, unknown>)).filter(Boolean) as ProRelationshipRecord[];
        window.localStorage.setItem(storageKey(userId), JSON.stringify(rows));
        raw = window.localStorage.getItem(storageKey(userId));
      }
    }
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((x) => migrateRow(x as Record<string, unknown>)).filter(Boolean) as ProRelationshipRecord[];
  } catch {
    return [];
  }
}

export function writeProRelationships(userId: string, rows: ProRelationshipRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(rows));
    window.dispatchEvent(new Event("axis-pro-relationships"));
  } catch {
    /* ignore quota */
  }
}

export function generateRelationshipId(): string {
  return `rel-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

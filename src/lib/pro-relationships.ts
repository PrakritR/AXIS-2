/**
 * Demo persistence for owner↔manager paid-account links (browser localStorage).
 * Production can swap for Supabase tables matching the same shape.
 */

export const AXIS_ID_LABEL = "Axis ID";

export type ProRelationshipPerspective = "owner_linked_manager" | "manager_linked_owner";

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

function storageKey(userId: string): string {
  return `axis_pro_relationships_${userId}_v1`;
}

export function readProRelationships(userId: string): ProRelationshipRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(Boolean) as ProRelationshipRecord[];
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

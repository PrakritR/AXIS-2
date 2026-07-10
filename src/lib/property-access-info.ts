import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

/** Manager-maintained per-property entry details. Stored in the owner-only
 * manager_property_access table — never on the publicly-readable property row. */
export type PropertyAccessInfo = {
  gateCode?: string;
  lockboxCode?: string;
  lockboxLocation?: string;
  entryNotes?: string;
  /** Default standing permission when a work order doesn't say otherwise. */
  permissionToEnterDefault?: boolean;
};

/** Property defaults overlaid with the resident's per-work-order answers. */
export type WorkOrderAccessInfo = PropertyAccessInfo & {
  permissionToEnter?: "allowed" | "call_first" | "resident_present";
  residentEntryNotes?: string;
};

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
};

export function normalizePropertyAccessInfo(raw: unknown): PropertyAccessInfo {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: PropertyAccessInfo = {
    gateCode: trimmed(r.gateCode),
    lockboxCode: trimmed(r.lockboxCode),
    lockboxLocation: trimmed(r.lockboxLocation),
    entryNotes: trimmed(r.entryNotes),
    permissionToEnterDefault: typeof r.permissionToEnterDefault === "boolean" ? r.permissionToEnterDefault : undefined,
  };
  return out;
}

export async function loadPropertyAccessInfo(
  db: SupabaseClient,
  managerUserId: string,
  propertyId: string,
): Promise<PropertyAccessInfo> {
  const { data } = await db
    .from("manager_property_access")
    .select("access_info")
    .eq("property_id", propertyId)
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  return normalizePropertyAccessInfo(data?.access_info ?? null);
}

export async function savePropertyAccessInfo(
  db: SupabaseClient,
  managerUserId: string,
  propertyId: string,
  raw: unknown,
): Promise<PropertyAccessInfo> {
  const normalized = normalizePropertyAccessInfo(raw);
  const { error } = await db.from("manager_property_access").upsert(
    {
      property_id: propertyId,
      manager_user_id: managerUserId,
      access_info: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "property_id,manager_user_id" },
  );
  if (error) throw error;
  return normalized;
}

/** Pure overlay: resident answers on the work order beat property defaults. */
export function overlayWorkOrderAccess(
  propertyDefaults: PropertyAccessInfo,
  row: Pick<DemoManagerWorkOrderRow, "entryPermission" | "entryNotes">,
): WorkOrderAccessInfo {
  return {
    ...propertyDefaults,
    permissionToEnter:
      row.entryPermission ?? (propertyDefaults.permissionToEnterDefault === true ? "allowed" : undefined),
    residentEntryNotes: trimmed(row.entryNotes),
  };
}

/** Everything a vendor may be told about entering for THIS job, resolved
 * server-side. Callers gate on assignment/scheduling before releasing it. */
export async function resolveWorkOrderAccessInfo(
  db: SupabaseClient,
  row: Pick<DemoManagerWorkOrderRow, "propertyId" | "assignedPropertyId" | "managerUserId" | "entryPermission" | "entryNotes">,
): Promise<WorkOrderAccessInfo> {
  const propertyId = row.propertyId || row.assignedPropertyId;
  const managerUserId = row.managerUserId?.trim();
  const defaults =
    propertyId && managerUserId ? await loadPropertyAccessInfo(db, managerUserId, propertyId) : {};
  return overlayWorkOrderAccess(defaults, row);
}

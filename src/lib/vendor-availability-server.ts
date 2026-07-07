import type { SupabaseClient } from "@supabase/supabase-js";
import {
  vendorAvailabilityStorageKey,
  vendorFlexiblePreferencesStorageKey,
} from "@/lib/demo-admin-scheduling";
import {
  DEFAULT_VISIT_DURATION_MINUTES,
  DEFAULT_FLEXIBLE_TIMING_RANK,
  flexibleWeekdaysFromRules,
  normalizeFlexibleTimingRank,
  resolveNextAvailableSlot,
  vendorEventRulesToBusyWindows,
  type VendorAvailabilityRule,
  type VendorFlexiblePreferences,
} from "@/lib/vendor-availability";

type RuleRecord = {
  id: string;
  kind: "weekly" | "block" | "open" | "event";
  weekday: number | null;
  specific_date: string | null;
  start_minute: number;
  end_minute: number;
  note?: string | null;
};

function toRule(rule: RuleRecord): VendorAvailabilityRule {
  if (rule.kind === "weekly") {
    return {
      id: rule.id,
      kind: "weekly",
      weekday: rule.weekday as number,
      startMinute: rule.start_minute,
      endMinute: rule.end_minute,
      note: rule.note ?? null,
    };
  }
  return {
    id: rule.id,
    kind: rule.kind,
    specificDate: rule.specific_date as string,
    startMinute: rule.start_minute,
    endMinute: rule.end_minute,
    note: rule.note ?? null,
  };
}

export type VendorBusyWindow = { startIso: string; endIso: string };

async function readScheduleRecordPayload(db: SupabaseClient, id: string): Promise<unknown> {
  const { data } = await db.from("portal_schedule_records").select("row_data").eq("id", id).maybeSingle();
  const rowData = data?.row_data;
  if (!rowData || typeof rowData !== "object") return undefined;
  const nested = (rowData as { payload?: unknown }).payload;
  return nested !== undefined ? nested : rowData;
}

async function loadVendorSlotKeys(db: SupabaseClient, vendorUserId: string): Promise<string[]> {
  const payload = await readScheduleRecordPayload(db, vendorAvailabilityStorageKey(vendorUserId));
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is string => typeof item === "string");
}

async function loadVendorFlexiblePreferences(db: SupabaseClient, vendorUserId: string): Promise<VendorFlexiblePreferences> {
  const payload = await readScheduleRecordPayload(db, vendorFlexiblePreferencesStorageKey(vendorUserId));
  const raw =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { timingRank?: unknown }).timingRank
      : undefined;
  return { timingRank: normalizeFlexibleTimingRank(raw ?? DEFAULT_FLEXIBLE_TIMING_RANK) };
}

/** A vendor's next open slot from drag-painted blocks, flexible days, and legacy rules,
 * minus already-scheduled visits. Tenant-requested time wins when it fits. */
export async function resolveVendorNextAvailableSlot(
  db: SupabaseClient,
  vendorUserId: string,
  options: {
    durationMinutes?: number;
    extraBusy?: VendorBusyWindow[];
    excludeWorkOrderId?: string;
    tenantPreferredIso?: string | null;
  } = {},
): Promise<{ iso: string | null; reason?: "no_availability" | "no_open_slot" }> {
  const durationMinutes = options.durationMinutes ?? DEFAULT_VISIT_DURATION_MINUTES;

  const [{ data: ruleRows }, slotKeys, preferences] = await Promise.all([
    db
      .from("vendor_availability_rules")
      .select("id, kind, weekday, specific_date, start_minute, end_minute, note")
      .eq("vendor_user_id", vendorUserId),
    loadVendorSlotKeys(db, vendorUserId),
    loadVendorFlexiblePreferences(db, vendorUserId),
  ]);

  const rules = (ruleRows ?? []).map((r) => toRule(r as RuleRecord));
  const flexibleWeekdays = flexibleWeekdaysFromRules(rules);
  const hasLegacyOpen = rules.some((r) => r.kind === "open" || (r.kind === "weekly" && r.note?.trim().toLowerCase() !== "flexible"));
  const hasAvailability = slotKeys.length > 0 || flexibleWeekdays.size > 0 || hasLegacyOpen;
  if (!hasAvailability) {
    return { iso: null, reason: "no_availability" };
  }

  let busyQuery = db.from("portal_work_order_records").select("id, row_data").eq("vendor_user_id", vendorUserId);
  if (options.excludeWorkOrderId) busyQuery = busyQuery.neq("id", options.excludeWorkOrderId);
  const { data: busyRows } = await busyQuery;
  const scheduledBusy = (busyRows ?? [])
    .map((r) => r.row_data as { scheduledAtIso?: string; bucket?: string })
    .filter((r) => r?.scheduledAtIso && r.bucket !== "completed")
    .map((r) => {
      const start = new Date(r.scheduledAtIso as string);
      return { startIso: start.toISOString(), endIso: new Date(start.getTime() + durationMinutes * 60_000).toISOString() };
    });

  const busy = [...scheduledBusy, ...vendorEventRulesToBusyWindows(rules), ...(options.extraBusy ?? [])];
  const iso = resolveNextAvailableSlot({
    rules,
    busy,
    durationMinutes,
    from: new Date(),
    slotKeys,
    flexibleWeekdays,
    timingRank: preferences.timingRank,
    tenantPreferredIso: options.tenantPreferredIso,
  });
  return iso ? { iso } : { iso: null, reason: "no_open_slot" };
}

export async function readVendorFlexiblePreferencesForServer(
  db: SupabaseClient,
  vendorUserId: string,
): Promise<VendorFlexiblePreferences> {
  return loadVendorFlexiblePreferences(db, vendorUserId);
}

export async function writeVendorFlexiblePreferencesForServer(
  db: SupabaseClient,
  vendorUserId: string,
  preferences: VendorFlexiblePreferences,
): Promise<void> {
  const key = vendorFlexiblePreferencesStorageKey(vendorUserId);
  const now = new Date().toISOString();
  const timingRank = normalizeFlexibleTimingRank(preferences.timingRank);
  const row = {
    id: key,
    manager_user_id: vendorUserId,
    property_id: null,
    record_type: "vendor_flexible_preferences",
    starts_at: null,
    ends_at: null,
    row_data: {
      id: key,
      recordType: "vendor_flexible_preferences",
      managerUserId: vendorUserId,
      payload: { timingRank },
    },
    updated_at: now,
  };
  const { error } = await db.from("portal_schedule_records").upsert(row);
  if (error) throw new Error(error.message);
}

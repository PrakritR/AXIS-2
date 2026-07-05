import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_VISIT_DURATION_MINUTES, resolveNextAvailableSlot, type VendorAvailabilityRule } from "@/lib/vendor-availability";

type RuleRecord = {
  id: string;
  kind: "weekly" | "block" | "open";
  weekday: number | null;
  specific_date: string | null;
  start_minute: number;
  end_minute: number;
};

function toRule(rule: RuleRecord): VendorAvailabilityRule {
  if (rule.kind === "weekly") {
    return { id: rule.id, kind: "weekly", weekday: rule.weekday as number, startMinute: rule.start_minute, endMinute: rule.end_minute };
  }
  return { id: rule.id, kind: rule.kind, specificDate: rule.specific_date as string, startMinute: rule.start_minute, endMinute: rule.end_minute };
}

export type VendorBusyWindow = { startIso: string; endIso: string };

/** A vendor's next open slot from their set availability (weekly windows minus blocked
 * dates) minus already-scheduled work order visits and any extra busy windows the caller
 * supplies (e.g. other pending consultations). Shared by the manager's auto-schedule route
 * (booking on a vendor's behalf) and the vendor's own consultation self-scheduling. */
export async function resolveVendorNextAvailableSlot(
  db: SupabaseClient,
  vendorUserId: string,
  options: { durationMinutes?: number; extraBusy?: VendorBusyWindow[]; excludeWorkOrderId?: string } = {},
): Promise<{ iso: string | null; reason?: "no_availability" | "no_open_slot" }> {
  const durationMinutes = options.durationMinutes ?? DEFAULT_VISIT_DURATION_MINUTES;

  const { data: ruleRows } = await db
    .from("vendor_availability_rules")
    .select("id, kind, weekday, specific_date, start_minute, end_minute")
    .eq("vendor_user_id", vendorUserId);
  const rules = (ruleRows ?? []).map((r) => toRule(r as RuleRecord));
  if (rules.filter((r) => r.kind === "weekly" || r.kind === "open").length === 0) {
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

  const busy = [...scheduledBusy, ...(options.extraBusy ?? [])];
  const iso = resolveNextAvailableSlot({ rules, busy, durationMinutes, from: new Date() });
  return iso ? { iso } : { iso: null, reason: "no_open_slot" };
}

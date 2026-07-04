import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { DEFAULT_VISIT_DURATION_MINUTES, resolveNextAvailableSlot, type VendorAvailabilityRule } from "@/lib/vendor-availability";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

type RuleRecord = {
  id: string;
  kind: "weekly" | "block";
  weekday: number | null;
  specific_date: string | null;
  start_minute: number;
  end_minute: number;
};

function toRule(rule: RuleRecord): VendorAvailabilityRule {
  if (rule.kind === "weekly") {
    return { id: rule.id, kind: "weekly", weekday: rule.weekday as number, startMinute: rule.start_minute, endMinute: rule.end_minute };
  }
  return { id: rule.id, kind: "block", specificDate: rule.specific_date as string, startMinute: rule.start_minute, endMinute: rule.end_minute };
}

/** Manager -> the vendor_user_id of a directory row they own, or null if unresolvable/unlinked. */
async function resolveManagerOwnedVendorUserId(db: Db, managerUserId: string, vendorDirectoryId: string): Promise<string | null> {
  const { data } = await db
    .from("manager_vendor_records")
    .select("vendor_user_id")
    .eq("id", vendorDirectoryId)
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  return (data?.vendor_user_id as string | null) ?? null;
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);

    const body = (await req.json().catch(() => ({}))) as {
      workOrderId?: string;
      vendorId?: string;
      durationMinutes?: number;
    };
    const workOrderId = body.workOrderId?.trim();
    const vendorId = body.vendorId?.trim();
    if (!workOrderId || !vendorId) {
      return NextResponse.json({ error: "Work order and vendor are required." }, { status: 400 });
    }

    const { data: workOrder } = await db
      .from("portal_work_order_records")
      .select("manager_user_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!workOrder || (!admin && workOrder.manager_user_id !== user.id)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const vendorUserId = await resolveManagerOwnedVendorUserId(db, admin ? (workOrder.manager_user_id as string) : user.id, vendorId);
    if (!vendorUserId) {
      return NextResponse.json({ error: "This vendor hasn't linked their account yet, so no availability is on file." }, { status: 400 });
    }

    const durationMinutes =
      Number.isFinite(body.durationMinutes) && Number(body.durationMinutes) > 0
        ? Math.round(Number(body.durationMinutes))
        : DEFAULT_VISIT_DURATION_MINUTES;

    const { data: ruleRows, error: ruleError } = await db
      .from("vendor_availability_rules")
      .select("id, kind, weekday, specific_date, start_minute, end_minute")
      .eq("vendor_user_id", vendorUserId);
    if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 500 });

    const rules = (ruleRows ?? []).map((r) => toRule(r as RuleRecord));
    if (rules.filter((r) => r.kind === "weekly").length === 0) {
      return NextResponse.json({ iso: null, reason: "no_availability" });
    }

    const { data: busyRows, error: busyError } = await db
      .from("portal_work_order_records")
      .select("id, row_data")
      .eq("vendor_user_id", vendorUserId)
      .neq("id", workOrderId);
    if (busyError) return NextResponse.json({ error: busyError.message }, { status: 500 });

    const busy = (busyRows ?? [])
      .map((r) => r.row_data as DemoManagerWorkOrderRow)
      .filter((r) => r?.scheduledAtIso && r.bucket !== "completed")
      .map((r) => {
        const start = new Date(r.scheduledAtIso as string);
        return { startIso: start.toISOString(), endIso: new Date(start.getTime() + durationMinutes * 60_000).toISOString() };
      });

    const iso = resolveNextAvailableSlot({ rules, busy, durationMinutes, from: new Date() });
    if (!iso) return NextResponse.json({ iso: null, reason: "no_open_slot" });
    return NextResponse.json({ iso });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to auto-schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

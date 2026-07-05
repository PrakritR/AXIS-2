import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { DEFAULT_VISIT_DURATION_MINUTES } from "@/lib/vendor-availability";
import { resolveVendorNextAvailableSlot } from "@/lib/vendor-availability-server";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

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

    const { iso, reason } = await resolveVendorNextAvailableSlot(db, vendorUserId, {
      durationMinutes,
      excludeWorkOrderId: workOrderId,
    });
    if (!iso) return NextResponse.json({ iso: null, reason });
    return NextResponse.json({ iso });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to auto-schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

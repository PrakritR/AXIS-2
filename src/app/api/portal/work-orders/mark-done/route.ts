import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { notifyWorkOrderEvent } from "@/lib/work-order-notification.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

async function sessionActor(db: Db) {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const admin = await isAdminUser(user.id);
  const { data: profile } = await db.from("profiles").select("email, role, full_name").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  return {
    userId: user.id,
    email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
    fullName: profile?.full_name?.trim() || "",
    admin,
    role,
  };
}

/** Vendor's one-tap "job done" signal — sets automationStatus only, never touches
 * bucket/status. The manager still owns the completion + expense-logging transition
 * via /api/portal/work-orders/approve-pay. */
export async function POST(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!actor.admin && actor.role !== "vendor") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { workOrderId?: string; note?: string };
    const workOrderId = String(body.workOrderId ?? "").trim();
    if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
    const note = String(body.note ?? "").trim().slice(0, 2000);

    const { data: workOrder } = await db
      .from("portal_work_order_records")
      .select("manager_user_id, vendor_user_id, row_data")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!workOrder) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (!actor.admin && workOrder.vendor_user_id !== actor.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const rowData = (workOrder.row_data ?? {}) as DemoManagerWorkOrderRow;
    if (rowData.bucket !== "scheduled") {
      return NextResponse.json({ error: "This work order isn't ready to be marked done." }, { status: 400 });
    }
    if (rowData.automationStatus) {
      return NextResponse.json({ error: "This work order has already been marked done." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextRowData: DemoManagerWorkOrderRow = {
      ...rowData,
      automationStatus: "vendor_marked_done",
      vendorMarkedDoneAt: now,
      vendorMarkedDoneNote: note || undefined,
    };

    const { error } = await db
      .from("portal_work_order_records")
      .update({ row_data: nextRowData, updated_at: now })
      .eq("id", workOrderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await notifyWorkOrderEvent(db, {
      event: "vendor_marked_done",
      senderUserId: actor.userId,
      senderEmail: actor.email,
      senderName: actor.fullName || "PropLane Portal",
      subject: `${rowData.title || "Work order"} marked done — approval needed`,
      text: `${actor.fullName || "Your vendor"} marked "${rowData.title || "the work order"}"${
        rowData.propertyName ? ` at ${rowData.propertyName}` : ""
      } as done.${note ? ` Note: ${note}` : ""} Review and approve payment in Work Orders.`,
      title: rowData.title || "Work order",
      propertyLabel: rowData.propertyName,
      note,
      toUserIds: [workOrder.manager_user_id],
    });

    track("work_order_vendor_marked_done", actor.userId, { work_order_id: workOrderId });
    return NextResponse.json({ ok: true, workOrder: nextRowData });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not mark done.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
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
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  return { userId: user.id, admin, role };
}

/** Vendor sets labor + materials on a scheduled work order before marking done.
 * Updates the work order row the manager uses for outgoing vendor payment. */
export async function POST(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!actor.admin && actor.role !== "vendor") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      workOrderId?: string;
      amountCents?: number;
      materialsCents?: number;
    };
    const workOrderId = String(body.workOrderId ?? "").trim();
    const amountCents = Math.round(Number(body.amountCents));
    const materialsCents = body.materialsCents === undefined ? 0 : Math.round(Number(body.materialsCents));

    if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Enter a valid labor cost." }, { status: 400 });
    }
    if (!Number.isFinite(materialsCents) || materialsCents < 0) {
      return NextResponse.json({ error: "Enter a valid equipment/materials cost." }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Price can only be set on scheduled work orders." }, { status: 400 });
    }
    if (rowData.automationStatus) {
      return NextResponse.json({ error: "This work order has already been marked done." }, { status: 400 });
    }

    const totalCents = amountCents + materialsCents;
    const now = new Date().toISOString();
    const nextRowData: DemoManagerWorkOrderRow = {
      ...rowData,
      vendorCostCents: amountCents,
      materialsCostCents: materialsCents,
      cost: `$${(totalCents / 100).toFixed(2)}`,
    };

    const { error } = await db
      .from("portal_work_order_records")
      .update({ row_data: nextRowData, updated_at: now })
      .eq("id", workOrderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const vendorUserId = String(workOrder.vendor_user_id ?? actor.userId);
    const { data: bid } = await db
      .from("work_order_bids")
      .select("id, status")
      .eq("work_order_id", workOrderId)
      .eq("vendor_user_id", vendorUserId)
      .maybeSingle();
    if (bid?.status === "submitted") {
      await db
        .from("work_order_bids")
        .update({
          amount_cents: amountCents,
          materials_cents: materialsCents,
          updated_at: now,
        })
        .eq("id", bid.id);
    }

    track("work_order_vendor_price_set", actor.userId, { work_order_id: workOrderId });
    return NextResponse.json({ ok: true, workOrder: nextRowData });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save price.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

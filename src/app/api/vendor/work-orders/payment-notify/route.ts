import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { deliverVendorWorkOrderPaymentNotify } from "@/lib/vendor-work-order-payment-notify.server";
import type { VendorWorkOrderPaymentNotifyKind } from "@/lib/vendor-work-order-payment-notify-email";

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

/** Vendor payment follow-up — email + Axis inbox to the work order's manager, co-managers, and offer sender. */
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
      action?: VendorWorkOrderPaymentNotifyKind;
    };
    const workOrderId = String(body.workOrderId ?? "").trim();
    const action = body.action;
    if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
    if (action !== "send_reminder" && action !== "report_paid") {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const result = await deliverVendorWorkOrderPaymentNotify(db, {
      workOrderId,
      vendorUserId: actor.userId,
      vendorEmail: actor.email,
      vendorName: actor.fullName,
      kind: action,
    });
    if (!result.ok) {
      const status = result.error === "Forbidden." ? 403 : result.error === "Work order not found." ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    track(
      action === "send_reminder" ? "vendor_work_order_payment_reminder_sent" : "vendor_work_order_payment_reported",
      actor.userId,
      { work_order_id: workOrderId, recipient_count: result.recipientCount },
    );
    return NextResponse.json({ ok: true, recipientCount: result.recipientCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not send notification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

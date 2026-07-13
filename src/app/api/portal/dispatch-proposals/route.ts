import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { getPortalAccessContext } from "@/lib/auth/portal-access";
import { resolvePortalApiActorRole } from "@/lib/auth/vendor-api-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { declineDispatch, executeDispatch } from "@/lib/work-order-dispatch.server";

export const runtime = "nodejs";

/** Manager one-tap decision on an agent-prepared dispatch proposal. The body
 * carries only the work order id + verb — the vendor choice re-derives
 * server-side from the persisted proposal. */
export async function POST(req: Request) {
  try {
    const ctx = await getPortalAccessContext();
    if (!ctx.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const admin = await isAdminUser(ctx.user.id);
    const role = resolvePortalApiActorRole(ctx);
    if (!admin && role !== "manager" && role !== "pro") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { workOrderId?: string; action?: string };
    const workOrderId = body.workOrderId?.trim();
    const action = body.action;
    if (!workOrderId || (action !== "approve" && action !== "decline")) {
      return NextResponse.json({ error: "workOrderId and action (approve|decline) required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    // An admin acts on behalf of the row's owning manager; a manager only ever
    // acts as themselves (executeDispatch re-verifies row ownership either way).
    let landlordId = ctx.user.id;
    if (admin) {
      const { data } = await db
        .from("portal_work_order_records")
        .select("manager_user_id")
        .eq("id", workOrderId)
        .maybeSingle();
      landlordId = (data?.manager_user_id as string | null) ?? ctx.user.id;
    }

    if (action === "decline") {
      const result = await declineDispatch(db, { workOrderId, landlordId, actorUserId: ctx.user.id });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ ok: true });
    }

    const actor = {
      userId: ctx.user.id,
      email: (ctx.profile?.email ?? ctx.user.email ?? "").trim().toLowerCase(),
      fullName: ctx.profile?.full_name?.trim() || "",
    };
    const result = await executeDispatch(db, { workOrderId, landlordId, actor, decidedBy: "manager" });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, scheduledIso: result.scheduledIso, vendorName: result.vendorName });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to process dispatch decision.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { revokeApplicationFeeWaiverCode } from "@/lib/application-fee-waiver";
import { requireManagerRouteUser } from "@/lib/manager-route-guard.server";

export const runtime = "nodejs";

/**
 * PATCH — revoke a waiver code. Scoped to the signed-in manager's OWN codes
 * (`revokeApplicationFeeWaiverCode` filters on `manager_user_id`), so a
 * manager can never revoke — or discover the existence of — another
 * manager's code.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManagerRouteUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "revoke") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }
  const result = await revokeApplicationFeeWaiverCode(ctx.db, ctx.userId, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}

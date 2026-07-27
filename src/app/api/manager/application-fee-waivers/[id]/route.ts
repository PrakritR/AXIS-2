import { NextResponse } from "next/server";
import { revokeApplicationFeeWaiverCode } from "@/lib/application-fee-waiver";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isManagerPortalRole(role: string): boolean {
  return role === "manager" || role === "owner" || role === "pro" || role === "admin";
}

async function requireManagerUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  if (!isManagerPortalRole(role)) return null;
  return { db, userId: user.id };
}

/**
 * PATCH — revoke a waiver code. Scoped to the signed-in manager's OWN codes
 * (`revokeApplicationFeeWaiverCode` filters on `manager_user_id`), so a
 * manager can never revoke — or discover the existence of — another
 * manager's code.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManagerUser();
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

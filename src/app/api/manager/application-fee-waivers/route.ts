import { NextResponse } from "next/server";
import {
  createApplicationFeeWaiverCode,
  listApplicationFeeWaiverCodes,
  listApplicationFeeWaiverRedemptions,
} from "@/lib/application-fee-waiver";
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

/** GET — list this manager's OWN waiver codes and redemption history. Never another manager's. */
export async function GET() {
  const ctx = await requireManagerUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const [codes, redemptions] = await Promise.all([
      listApplicationFeeWaiverCodes(ctx.db, ctx.userId),
      listApplicationFeeWaiverRedemptions(ctx.db, ctx.userId),
    ]);
    return NextResponse.json({ codes, redemptions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load waiver codes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  code?: string;
  label?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
};

/** POST — create a new waiver code owned by the signed-in manager. */
export async function POST(req: Request) {
  const ctx = await requireManagerUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const result = await createApplicationFeeWaiverCode(ctx.db, ctx.userId, {
    code: body.code,
    label: body.label,
    maxUses: body.maxUses ?? null,
    expiresAt: body.expiresAt ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ code: result.code });
}

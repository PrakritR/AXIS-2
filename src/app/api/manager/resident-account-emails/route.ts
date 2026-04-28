import { NextResponse } from "next/server";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const ctx = await getPortalAccessContext();
    if (!ctx.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!hasAdminRole(ctx) && !hasRole(ctx, "manager") && !hasRole(ctx, "owner")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as { emails?: unknown[] };
    const requested = [...new Set((body.emails ?? []).map(normalizeEmail).filter(Boolean))];
    if (requested.length === 0) return NextResponse.json({ emails: [] });

    const db = createSupabaseServiceRoleClient();
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, email, role")
      .in("email", requested);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (profiles ?? []).map((p) => p.id).filter(Boolean);
    const { data: roleRows, error: rolesError } =
      ids.length > 0 ? await db.from("profile_roles").select("user_id, role").in("user_id", ids) : { data: [], error: null };

    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 500 });

    const residentRoleIds = new Set((roleRows ?? []).filter((r) => r.role === "resident").map((r) => r.user_id));
    const emails = (profiles ?? [])
      .filter((p) => p.role === "resident" || residentRoleIds.has(p.id))
      .map((p) => normalizeEmail(p.email))
      .filter(Boolean);

    return NextResponse.json({ emails: [...new Set(emails)] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load resident accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

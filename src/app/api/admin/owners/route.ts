import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { removePortalAccess } from "@/lib/auth/remove-portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdminUser(user.id);
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("profiles")
      .select("id, email, full_name, application_approved, created_at")
      .eq("role", "owner")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const owners = (data ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? "",
      fullName: p.full_name ?? "",
      active: p.application_approved !== false,
      joinedAt: p.created_at ?? null,
    }));

    return NextResponse.json({ owners });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id, active } = (await req.json()) as { id: string; active: boolean };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const { error } = await db
      .from("profiles")
      .update({ application_approved: active })
      .eq("id", id)
      .eq("role", "owner");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const result = await removePortalAccess(db, id, "owner");
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

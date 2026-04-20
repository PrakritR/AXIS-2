import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
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
    const supabase = createSupabaseServiceRoleClient();
    const { data: roleRows } = await supabase.from("profile_roles").select("user_id").eq("role", "manager");
    const idsFromRoles = [...new Set((roleRows ?? []).map((r) => r.user_id))];
    const { data: legacyRows } = await supabase.from("profiles").select("id").eq("role", "manager");
    const legacyIds = (legacyRows ?? []).map((p) => p.id);
    const allIds = [...new Set([...idsFromRoles, ...legacyIds])];

    if (allIds.length === 0) {
      return NextResponse.json({ managers: [] });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, manager_id, application_approved, created_at")
      .in("id", allIds)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get tier info from manager_purchases
    const emails = (data ?? []).map((p) => p.email).filter(Boolean);
    const { data: purchases } = await supabase
      .from("manager_purchases")
      .select("email, tier, billing, paid_at")
      .in("email", emails);

    const purchaseByEmail = new Map(purchases?.map((p) => [p.email, p]) ?? []);

    const managers = (data ?? []).map((profile) => {
      const purchase = purchaseByEmail.get(profile.email);
      return {
        id: profile.id,
        email: profile.email ?? "",
        fullName: profile.full_name ?? "",
        managerId: profile.manager_id ?? "",
        tier: purchase?.tier ?? "free",
        billing: purchase?.billing ?? "free",
        active: profile.application_approved !== false,
        joinedAt: profile.created_at ?? purchase?.paid_at ?? null,
      };
    });

    return NextResponse.json({ managers });
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

    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("profiles").update({ application_approved: active }).eq("id", id);

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

    const supabase = createSupabaseServiceRoleClient();

    // Delete auth user — cascades to profiles via FK on delete cascade
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

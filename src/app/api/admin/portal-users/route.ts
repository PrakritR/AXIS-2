import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Row = { id: string; email: string | null; full_name: string | null; role: string };

function labelFor(r: Row): string {
  const name = r.full_name?.trim();
  const em = r.email?.trim();
  if (name && em) return `${name} (${em})`;
  return em || name || r.id.slice(0, 8);
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const db = createSupabaseServiceRoleClient();

    async function idsForPortalRole(role: "manager" | "resident" | "owner"): Promise<string[]> {
      const { data: pr } = await db.from("profile_roles").select("user_id").eq("role", role);
      const fromRoles = [...new Set((pr ?? []).map((r) => r.user_id))];
      const { data: legacy } = await db.from("profiles").select("id").eq("role", role);
      const fromLegacy = (legacy ?? []).map((p) => p.id);
      return [...new Set([...fromRoles, ...fromLegacy])];
    }

    const [mIds, rIds, oIds] = await Promise.all([idsForPortalRole("manager"), idsForPortalRole("resident"), idsForPortalRole("owner")]);

    const allNeeded = [...new Set([...mIds, ...rIds, ...oIds])];
    if (allNeeded.length === 0) {
      return NextResponse.json({
        managers: [],
        residents: [],
        owners: [],
        counts: { managers: 0, residents: 0, owners: 0 },
      });
    }

    const { data: rows, error } = await db
      .from("profiles")
      .select("id, email, full_name, role")
      .in("id", allNeeded)
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const byId = new Map((rows ?? []).map((r) => [r.id, r as Row]));

    const managers = mIds.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ id: r!.id, label: labelFor(r!) }));
    const residents = rIds.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ id: r!.id, label: labelFor(r!) }));
    const owners = oIds.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ id: r!.id, label: labelFor(r!) }));

    const managerCount = mIds.length;
    const residentCount = rIds.length;
    const ownerCount = oIds.length;

    return NextResponse.json({
      managers,
      residents,
      owners,
      counts: {
        managers: managerCount,
        residents: residentCount,
        owners: ownerCount,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

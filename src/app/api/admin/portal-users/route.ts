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
    const { data: rows, error } = await db
      .from("profiles")
      .select("id, email, full_name, role")
      .in("role", ["manager", "resident", "owner"])
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as Row[];
    const managers = list.filter((r) => r.role === "manager").map((r) => ({ id: r.id, label: labelFor(r) }));
    const residents = list.filter((r) => r.role === "resident").map((r) => ({ id: r.id, label: labelFor(r) }));
    const owners = list.filter((r) => r.role === "owner").map((r) => ({ id: r.id, label: labelFor(r) }));

    const { count: managerCount } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "manager");
    const { count: residentCount } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "resident");
    const { count: ownerCount } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "owner");

    return NextResponse.json({
      managers,
      residents,
      owners,
      counts: {
        managers: managerCount ?? 0,
        residents: residentCount ?? 0,
        owners: ownerCount ?? 0,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { destructiveAdminToolsEnabled } from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdminUser(user.id);
}

export async function POST() {
  try {
    if (!destructiveAdminToolsEnabled()) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not list users." }, { status: 500 });
    }

    const nonAdmins = data.users.filter(
      (u) => (u.user_metadata?.role ?? u.app_metadata?.role) !== "admin",
    );

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const user of nonAdmins) {
      const { error: dErr } = await supabase.auth.admin.deleteUser(user.id);
      if (dErr) {
        failed.push(user.email ?? user.id);
      } else {
        deleted.push(user.email ?? user.id);
        await supabase.from("profiles").delete().eq("id", user.id);
      }
    }

    return NextResponse.json({ deleted, failed, total: nonAdmins.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

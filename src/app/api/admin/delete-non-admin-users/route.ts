import { NextResponse } from "next/server";
import { isValidAdminRegisterKey } from "@/lib/auth/resolve-portal-role";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { adminKey } = (await req.json()) as { adminKey?: string };
    if (!isValidAdminRegisterKey(adminKey ?? "")) {
      return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
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

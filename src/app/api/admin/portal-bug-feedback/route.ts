import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as { action?: string; id?: string };
    if (body.action !== "delete") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db.from("portal_bug_feedback_records").delete().eq("id", id).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: data.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

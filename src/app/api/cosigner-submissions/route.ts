import { NextResponse } from "next/server";
import type { CosignerSubmission } from "@/lib/cosigner-submissions-storage";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const signerAppId = normalizeApplicationAxisId(url.searchParams.get("signerAppId")?.trim() ?? "");
    if (!signerAppId) return NextResponse.json({ error: "signerAppId required" }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);

    if (!admin) {
      const { data: appRow } = await db
        .from("manager_application_records")
        .select("manager_user_id")
        .eq("id", signerAppId)
        .maybeSingle();
      if (!appRow || appRow.manager_user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const { data, error } = await db
      .from("cosigner_submission_records")
      .select("row_data, created_at")
      .eq("signer_app_id", signerAppId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((r) => r.row_data).filter(Boolean) as CosignerSubmission[];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load co-signer submissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

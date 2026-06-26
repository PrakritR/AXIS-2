import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { orderScreeningForApplication } from "@/lib/screening/order-screening";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { applicationId?: string };

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as Body;
    const applicationId = body.applicationId?.trim();
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: record } = await db
      .from("manager_application_records")
      .select("manager_user_id, row_data")
      .eq("id", applicationId)
      .maybeSingle();

    const managerUserId = record?.manager_user_id?.trim() || (record?.row_data as { managerUserId?: string } | null)?.managerUserId?.trim();
    if (!managerUserId) {
      return NextResponse.json({ error: "Application has no assigned manager." }, { status: 400 });
    }
    if (!admin && managerUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await orderScreeningForApplication({
      db,
      applicationId,
      managerUserId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ ok: true, screening: result.screening, row: result.row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to order screening.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

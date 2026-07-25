import { NextResponse } from "next/server";
import { runExistingResidentOnboarding } from "@/lib/existing-resident-onboarding.server";
import { canSendResidentWelcome } from "@/lib/resident-welcome.server";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let body: { applicationId?: unknown; sendWelcomeEmail?: unknown; row?: unknown };
    try {
      body = (await req.json()) as { applicationId?: unknown; sendWelcomeEmail?: unknown; row?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
    const sendWelcomeEmail = body.sendWelcomeEmail !== false;
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor } = await svc.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!canSendResidentWelcome(requestor?.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const ids = [applicationId, normalizeApplicationAxisId(applicationId)];
    const { data: records } = await svc
      .from("manager_application_records")
      .select("id, row_data")
      .in("id", [...new Set(ids)])
      .eq("manager_user_id", user.id)
      .limit(1);

    let row = (records?.[0]?.row_data ?? null) as DemoApplicantRow | null;
    if (!row && body.row && typeof body.row === "object" && !Array.isArray(body.row)) {
      row = body.row as DemoApplicantRow;
    }
    if (!row) return NextResponse.json({ error: "Resident record not found." }, { status: 404 });

    const result = await runExistingResidentOnboarding(
      svc,
      {
        userId: user.id,
        email: user.email ?? null,
        managerName: String(requestor?.full_name ?? ""),
      },
      row,
      { sendWelcomeEmail },
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, mailtoHref: result.mailtoHref, leaseId: result.leaseId },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      axisId: result.axisId,
      leaseId: result.leaseId,
      welcomeEmailSent: result.welcomeEmailSent,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed." },
      { status: 500 },
    );
  }
}

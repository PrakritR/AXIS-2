import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { notifyApplicantApplicationSms } from "@/lib/application-lifecycle-sms.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canManageResidentApproval(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

export async function PATCH(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: { email?: unknown; approved?: unknown };
    try {
      body = (await req.json()) as { email?: unknown; approved?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    const approved = typeof body.approved === "boolean" ? body.approved : null;
    if (!email || approved == null) {
      return NextResponse.json({ error: "Email and approved are required." }, { status: 400 });
    }

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor, error: requestorError } = await svc
      .from("profiles")
      .select("role, email, sms_from_number")
      .eq("id", user.id)
      .maybeSingle();

    if (requestorError || !requestor) {
      return NextResponse.json({ error: requestorError?.message ?? "Profile not found." }, { status: 403 });
    }

    const requestorEmail = normalizeEmail(requestor.email);
    if (requestor.role === "resident") {
      if (requestorEmail !== email) {
        return NextResponse.json({ error: "Residents may only update their own access status." }, { status: 403 });
      }
    } else if (!canManageResidentApproval(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const query =
      requestor.role === "resident"
        ? svc.from("profiles").update({ application_approved: approved, updated_at: new Date().toISOString() }).eq("id", user.id)
        : svc
            .from("profiles")
            .update({ application_approved: approved, updated_at: new Date().toISOString() })
            .eq("role", "resident")
            .eq("email", email);

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Manager deny → PropLane SMS. Approvals are covered by the welcome + assistant intro.
    if (requestor.role !== "resident" && !approved) {
      try {
        const { data: appRow } = await svc
          .from("manager_application_records")
          .select("id, row_data, manager_user_id")
          .eq("resident_email", email)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const rowData = (appRow?.row_data ?? {}) as {
          name?: string;
          propertyTitle?: string;
          application?: { phone?: string; fullLegalName?: string };
        };
        const phone = String(rowData.application?.phone ?? "").trim() || null;
        await notifyApplicantApplicationSms(svc, {
          event: "rejected",
          applicantEmail: email,
          applicantPhone: phone,
          applicantName: rowData.name || rowData.application?.fullLegalName || null,
          propertyTitle: rowData.propertyTitle || null,
          axisId: appRow?.id ? String(appRow.id) : null,
          managerUserId: String(appRow?.manager_user_id ?? user.id).trim() || user.id,
          fromNumber: String(requestor.sms_from_number ?? "").trim() || null,
        });
      } catch {
        /* non-critical */
      }
    }

    track("resident_approval_updated", user.id, { approved });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync resident approval." },
      { status: 500 },
    );
  }
}

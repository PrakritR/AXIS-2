import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { track } from "@/lib/analytics/posthog";
import { notifyApplicantApplicationSms } from "@/lib/application-lifecycle-sms.server";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function idVariants(id: string): string[] {
  const trimmed = id.trim();
  return [...new Set([trimmed, normalizeApplicationAxisId(trimmed)].filter(Boolean))];
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

    let body: { email?: unknown; approved?: unknown; applicationId?: unknown };
    try {
      body = (await req.json()) as { email?: unknown; approved?: unknown; applicationId?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    const approved = typeof body.approved === "boolean" ? body.approved : null;
    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
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

    // Money-path guard (defense in depth — the manager UI already hides Approve for
    // withdrawn rows): a manager must never approve a resident-withdrawn application.
    // Approving it provisions a resident account + rent/deposit charges for someone
    // who explicitly pulled out. A withdrawal is a reversible stamp, so re-submission
    // (not un-withdraw) is the intended path back to approvable.
    //
    // The lookup is deliberately NOT scoped to `manager_user_id`: a co-managed row
    // keeps the linked OWNER's id, and an admin never owns the record, so scoping
    // made the guard silently never fire for exactly the callers the UI check cannot
    // be trusted for. The row is reduced to a single boolean here and no part of it
    // is ever returned to the client. A bogus/unknown `applicationId` must not
    // disable the guard either, so it falls back to the resident-email lookup, and a
    // query error fails CLOSED (matching `resolveApplicationWriteOwner`).
    if (requestor.role !== "resident" && approved) {
      const loadStoredRow = async (
        by: "id" | "email",
      ): Promise<{ error: boolean; stored: DemoApplicantRow | null }> => {
        const base = svc.from("manager_application_records").select("id, row_data");
        const scoped = by === "id" ? base.in("id", idVariants(applicationId)) : base.eq("resident_email", email);
        const { data, error } = await scoped.order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (error) return { error: true, stored: null };
        return { error: false, stored: (data?.row_data ?? null) as DemoApplicantRow | null };
      };

      let lookup = applicationId ? await loadStoredRow("id") : null;
      if (lookup?.error) {
        return NextResponse.json({ error: "Could not verify the application status." }, { status: 500 });
      }
      if (!lookup?.stored) {
        lookup = await loadStoredRow("email");
        if (lookup.error) {
          return NextResponse.json({ error: "Could not verify the application status." }, { status: 500 });
        }
      }
      if (lookup.stored && isWithdrawnApplicationRow(lookup.stored)) {
        return NextResponse.json(
          { error: "This application was withdrawn by the applicant and can no longer be approved." },
          { status: 409 },
        );
      }
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
    // Scoped to the ACTING manager's own application row (never another
    // landlord's data) and deduped so approve/deny toggling can't re-text.
    if (requestor.role !== "resident" && !approved) {
      try {
        const { data: appRow } = await svc
          .from("manager_application_records")
          .select("id, row_data, manager_user_id")
          .eq("resident_email", email)
          .eq("manager_user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (appRow) {
          const dedupId = `application_rejected_sms_${String(appRow.id)}`;
          const { data: alreadySent } = await svc
            .from("portal_outbound_mail_records")
            .select("id")
            .eq("id", dedupId)
            .maybeSingle();
          if (!alreadySent) {
            await svc.from("portal_outbound_mail_records").upsert(
              {
                id: dedupId,
                recipient_email: email,
                subject: "Application decision (SMS)",
                channel: "sms",
                row_data: {
                  id: dedupId,
                  subject: "Application decision (SMS)",
                  sentAt: new Date().toISOString(),
                  applicationId: String(appRow.id),
                },
              },
              { onConflict: "id" },
            );
            const rowData = (appRow.row_data ?? {}) as {
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
              axisId: String(appRow.id),
              managerUserId: String(appRow.manager_user_id ?? user.id).trim() || user.id,
              fromNumber: String(requestor.sms_from_number ?? "").trim() || null,
            });
          }
        }
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

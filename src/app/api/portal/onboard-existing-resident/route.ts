import { NextResponse } from "next/server";
import { appendFileSync } from "node:fs";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { manualResidentSignedLeasePdf } from "@/lib/existing-resident-onboarding";
import {
  canSendResidentWelcome,
  deliverExistingResidentWelcome,
  RESIDENT_WELCOME_EMAIL_RE,
} from "@/lib/resident-welcome.server";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { normalizeLeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const payload = {
    sessionId: "81cbea",
    location: "onboard-existing-resident/route.ts",
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: "post-fix-v2",
  };
  // #region agent log
  try {
    appendFileSync("/Users/prakrit/firstmate/.cursor/debug-81cbea.log", `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  fetch("http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "81cbea" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

function normalizeManualRow(row: DemoApplicantRow, managerUserId: string): DemoApplicantRow {
  const id = row.id.trim();
  const email = row.email?.trim().toLowerCase() ?? "";
  return {
    ...row,
    id,
    email,
    managerUserId: row.managerUserId ?? managerUserId,
    manuallyAdded: true,
    bucket: "approved",
    stage: row.stage ?? "Active",
  };
}

async function upsertManagerApplicationRecord(
  svc: ReturnType<typeof createSupabaseServiceRoleClient>,
  managerUserId: string,
  row: DemoApplicantRow,
): Promise<void> {
  const normalized = normalizeManualRow(row, managerUserId);
  const propertyId =
    normalized.assignedPropertyId?.trim() || normalized.propertyId?.trim() || normalized.application?.propertyId?.trim() || null;
  await svc.from("manager_application_records").upsert(
    {
      id: normalized.id,
      manager_user_id: managerUserId,
      resident_email: normalized.email ?? null,
      property_id: propertyId,
      row_data: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

function asUuidOrNull(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

function buildLeaseUpsert(row: Record<string, unknown>) {
  return {
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    resident_user_id: asUuidOrNull(row.residentUserId ?? row.resident_user_id),
    resident_email: row.residentEmail ?? row.resident_email ?? null,
    property_id: row.propertyId ?? row.property_id ?? null,
    status: row.bucket ?? row.status ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  };
}

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
    const clientRow =
      body.row && typeof body.row === "object" && !Array.isArray(body.row)
        ? (body.row as DemoApplicantRow)
        : null;
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor } = await svc.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!canSendResidentWelcome(requestor?.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const ids = [applicationId, normalizeApplicationAxisId(applicationId)];
    const { data: records } = await svc
      .from("manager_application_records")
      .select("id, resident_email, row_data, manager_user_id")
      .in("id", [...new Set(ids)])
      .eq("manager_user_id", user.id)
      .limit(1);

    const rec = (records ?? [])[0] as
      | { id: string; resident_email?: string | null; row_data?: unknown; manager_user_id?: string }
      | undefined;

    if (!rec && clientRow?.id) {
      await upsertManagerApplicationRecord(svc, user.id, clientRow);
      debugLog("upserted application from client row", { applicationId }, "D");
    }

    const { data: recordsAfterUpsert } = !rec && clientRow?.id
      ? await svc
          .from("manager_application_records")
          .select("id, resident_email, row_data, manager_user_id")
          .in("id", [...new Set(ids)])
          .eq("manager_user_id", user.id)
          .limit(1)
      : { data: records };

    const resolvedRec = ((recordsAfterUpsert ?? [])[0] ?? rec) as
      | { id: string; resident_email?: string | null; row_data?: unknown; manager_user_id?: string }
      | undefined;
    if (!resolvedRec) return NextResponse.json({ error: "Resident record not found." }, { status: 404 });

    const row = (resolvedRec.row_data && typeof resolvedRec.row_data === "object" ? resolvedRec.row_data : {}) as DemoApplicantRow;
    if (!row.manuallyAdded) {
      return NextResponse.json({ error: "This route is only for manager-added existing residents." }, { status: 400 });
    }

    const email = (row.email?.trim() || resolvedRec.resident_email?.trim() || "").toLowerCase();
    if (!email || !RESIDENT_WELCOME_EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid resident email is required on the record." }, { status: 400 });
    }

    const iso = new Date().toISOString();
    const residentName = row.name?.trim() || "Resident";
    const managerName = String(requestor?.full_name ?? "").trim() || "Property Manager";
    const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
    const leaseId = `lease_app_${normalizeApplicationAxisId(resolvedRec.id)}`;
    const manualPdf = manualResidentSignedLeasePdf(row);

    const leaseRow = normalizeLeasePipelineRow({
      id: leaseId,
      residentName,
      residentEmail: email,
      unit: row.property?.trim() || "—",
      updated: iso,
      bucket: "signed",
      pdfVersion: 1,
      notes: "Existing resident — lease executed off-platform.",
      updatedAtIso: iso,
      axisId: resolvedRec.id,
      propertyId: propertyId || undefined,
      managerUserId: user.id,
      managerUploadedPdf: manualPdf,
      managerSignature: { role: "manager", name: managerName, signedAtIso: iso },
      residentSignature: { role: "resident", name: residentName, signedAtIso: iso },
      signatureName: residentName,
      signedAtIso: iso,
      sentToResidentAt: iso,
      fullySignedAt: iso,
      residentSignedAt: iso,
      managerSignedAt: iso,
      externallySignedLease: true,
      thread: [],
    });

    const { error: leaseError } = await svc
      .from("portal_lease_pipeline_records")
      .upsert(buildLeaseUpsert(leaseRow as unknown as Record<string, unknown>), { onConflict: "id" });
    if (leaseError) {
      debugLog("lease upsert failed", { error: leaseError.message }, "B");
      return NextResponse.json({ error: leaseError.message }, { status: 500 });
    }
    debugLog("lease upsert ok", { leaseId, externallySigned: true }, "B");

    let welcomeEmailSent = false;
    let mailtoHref: string | undefined;
    if (sendWelcomeEmail) {
      const welcome = await deliverExistingResidentWelcome(
        svc,
        { userId: user.id, email: user.email ?? null },
        {
          to: email,
          residentName,
          axisId: normalizeApplicationAxisId(resolvedRec.id),
          propertyLabel: row.property,
        },
      );
      if (!welcome.ok) {
        debugLog("welcome email failed", { status: welcome.status }, "A");
        return NextResponse.json(
          { ok: false, leaseId, error: welcome.error, mailtoHref: welcome.mailtoHref },
          { status: welcome.status },
        );
      }
      welcomeEmailSent = !welcome.skipped;
      mailtoHref = undefined;
      debugLog("welcome email sent", { skipped: welcome.skipped }, "A");

      const nextRow: DemoApplicantRow = {
        ...row,
        id: resolvedRec.id,
        manualResidentDetails: {
          ...row.manualResidentDetails,
          onboardingWelcomeSentAt: iso,
          externallySignedLease: true,
        },
      };
      await svc
        .from("manager_application_records")
        .update({
          row_data: nextRow,
          resident_email: email,
          updated_at: iso,
        })
        .eq("id", resolvedRec.id)
        .eq("manager_user_id", user.id);
    }

    return NextResponse.json({
      ok: true,
      axisId: normalizeApplicationAxisId(resolvedRec.id),
      leaseId,
      welcomeEmailSent,
      mailtoHref,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed." },
      { status: 500 },
    );
  }
}

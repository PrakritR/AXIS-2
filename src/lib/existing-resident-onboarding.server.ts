import { appendFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { manualResidentSignedLeasePdf } from "@/lib/existing-resident-onboarding";
import {
  deliverExistingResidentWelcome,
  RESIDENT_WELCOME_EMAIL_RE,
  type ResidentWelcomeActor,
} from "@/lib/resident-welcome.server";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { normalizeLeasePipelineRow } from "@/lib/lease-pipeline-storage";

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const payload = {
    sessionId: "81cbea",
    location: "existing-resident-onboarding.server.ts",
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: "post-fix-v3",
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

export type ExistingResidentOnboardingResult =
  | {
      ok: true;
      leaseId: string;
      welcomeEmailSent: boolean;
      axisId: string;
      row: DemoApplicantRow;
    }
  | { ok: false; status: number; error: string; mailtoHref?: string; leaseId?: string };

export async function runExistingResidentOnboarding(
  db: SupabaseClient,
  actor: ResidentWelcomeActor & { managerName?: string },
  row: DemoApplicantRow,
  opts?: { sendWelcomeEmail?: boolean },
): Promise<ExistingResidentOnboardingResult> {
  if (!row.manuallyAdded) {
    return { ok: false, status: 400, error: "Not a manager-added existing resident." };
  }

  const email = row.email?.trim().toLowerCase() ?? "";
  if (!email || !RESIDENT_WELCOME_EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "A valid resident email is required on the record." };
  }

  const sendWelcomeEmail = opts?.sendWelcomeEmail !== false;
  const iso = new Date().toISOString();
  const residentName = row.name?.trim() || "Resident";
  const managerName = actor.managerName?.trim() || "Property Manager";
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
  const axisId = normalizeApplicationAxisId(row.id);
  const leaseId = `lease_app_${axisId}`;
  const manualPdf = manualResidentSignedLeasePdf(row);

  debugLog("onboarding start", { axisId, sendWelcomeEmail, hasPdf: Boolean(manualPdf) }, "E");

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
    axisId: row.id,
    propertyId: propertyId || undefined,
    managerUserId: actor.userId,
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

  const { error: leaseError } = await db
    .from("portal_lease_pipeline_records")
    .upsert(buildLeaseUpsert(leaseRow as unknown as Record<string, unknown>), { onConflict: "id" });
  if (leaseError) {
    debugLog("lease upsert failed", { error: leaseError.message }, "B");
    return { ok: false, status: 500, error: leaseError.message };
  }
  debugLog("lease upsert ok", { leaseId }, "B");

  let welcomeEmailSent = false;
  let nextRow = row;
  if (sendWelcomeEmail) {
    const welcome = await deliverExistingResidentWelcome(db, actor, {
      to: email,
      residentName,
      axisId,
      propertyLabel: row.property,
    });
    if (!welcome.ok) {
      debugLog("welcome failed", { status: welcome.status }, "A");
      return {
        ok: false,
        status: welcome.status,
        error: welcome.error,
        mailtoHref: welcome.mailtoHref,
        leaseId,
      };
    }
    welcomeEmailSent = !welcome.skipped;
    debugLog("welcome ok", { skipped: welcome.skipped }, "A");
    nextRow = {
      ...row,
      manualResidentDetails: {
        ...row.manualResidentDetails,
        onboardingWelcomeSentAt: iso,
        externallySignedLease: true,
      },
    };
    await db
      .from("manager_application_records")
      .update({
        row_data: nextRow,
        resident_email: email,
        updated_at: iso,
      })
      .eq("id", row.id);
  }

  return { ok: true, leaseId, welcomeEmailSent, axisId, row: nextRow };
}

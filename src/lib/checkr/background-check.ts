/**
 * Orchestrates a Checkr Tenant API background check against an applicant
 * record. This is the single server-side entry point the API route and
 * webhook call — the agent tool layer can reuse it too. Per-manager scoping is
 * enforced by the caller (route) and re-checked here as defense in depth.
 *
 * Live orders: package + add-ons + Axis surcharge are charged to the manager's
 * Stripe customer (signup card). Checkr Tenant bills separately on their account.
 */
import type { DemoApplicantRow } from "@/data/demo-portal";
import { backgroundCheckStatusFromCheckr } from "@/lib/application-background-check";
import { createBackgroundCheck, fetchBackgroundCheckReport } from "@/lib/checkr/client";
import { backgroundCheckConfigured, checkrSkipsManagerCardCharge } from "@/lib/checkr/config";
import type { CheckrPackage } from "@/lib/checkr/config";
import { checkrOrderCostCents, isCheckrAddOn, isCheckrPackage, type CheckrAddOnSlug } from "@/lib/checkr/packages";
import type {
  ApplicationBackgroundCheck,
  CheckrApplicantInput,
  CheckrPropertyInput,
} from "@/lib/checkr/types";
import { managerScreeningAllowedForTier } from "@/lib/manager-access";
import { getManagerSubscriptionTier } from "@/lib/manager-access-server";
import { recordAutoExpense } from "@/lib/reports/auto-expense";
import { propertyFromRecord } from "@/lib/resident-move-in-resolve";
import { chargeManagerForScreening } from "@/lib/screening/charge-manager";
import { getStripe } from "@/lib/stripe";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BackgroundCheckResult =
  | { ok: true; row: DemoApplicantRow; backgroundCheck: ApplicationBackgroundCheck }
  | { ok: false; status: number; error: string; code?: string };

function digitsOnly(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeDob(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

function applicantInputFromApplication(app: RentalWizardFormState): CheckrApplicantInput {
  const parts = app.fullLegalName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "Applicant";
  const lastName = parts.length > 1 ? parts[parts.length - 1]! : "Unknown";
  return {
    firstName,
    lastName,
    email: app.email.trim().toLowerCase(),
    dob: normalizeDob(app.dateOfBirth),
    ssn: digitsOnly(app.ssn),
    phone: digitsOnly(app.phone) || undefined,
  };
}

/** Best-effort parse of the manager's free-text listing address into street/city/state. */
function propertyInputFromAddress(name: string, address: string, zip: string): CheckrPropertyInput {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts[0] || address.trim() || "Unknown";
  const city = parts[1] || "Seattle";
  const stateRaw = parts[2] || "WA";
  const state = (stateRaw.match(/[A-Za-z]{2}/)?.[0] ?? "WA").toUpperCase();
  return { name, street, city, state, zipcode: zip.trim() || "98101" };
}

async function loadCheckrProperty(
  db: SupabaseClient,
  propertyId: string | undefined,
): Promise<CheckrPropertyInput> {
  if (propertyId) {
    const { data } = await db
      .from("manager_property_records")
      .select("id, property_data, row_data")
      .eq("id", propertyId)
      .maybeSingle();
    const property = data ? propertyFromRecord(data) : undefined;
    if (property) {
      return propertyInputFromAddress(property.title || property.buildingName || "Rental property", property.address, property.zip);
    }
  }
  return { name: "Rental property", street: "Unknown", city: "Seattle", state: "WA", zipcode: "98101" };
}

async function loadApplicationRow(
  db: SupabaseClient,
  applicationId: string,
): Promise<DemoApplicantRow | null> {
  const { data, error } = await db
    .from("manager_application_records")
    .select("row_data")
    .eq("id", applicationId)
    .maybeSingle();
  if (error || !data?.row_data) return null;
  return data.row_data as DemoApplicantRow;
}

async function persistApplicationRow(db: SupabaseClient, row: DemoApplicantRow): Promise<void> {
  const { error } = await db.from("manager_application_records").upsert(
    {
      id: row.id,
      manager_user_id: row.managerUserId || null,
      resident_email: row.email?.trim().toLowerCase() || null,
      property_id: row.propertyId || row.application?.propertyId || null,
      assigned_property_id: row.assignedPropertyId || null,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

/** Audit trail + webhook lookup key (reuses the shared screening_orders table). */
async function upsertBackgroundCheckOrder(
  db: SupabaseClient,
  row: DemoApplicantRow,
  bc: ApplicationBackgroundCheck,
): Promise<void> {
  const { error } = await db.from("screening_orders").upsert(
    {
      application_id: row.id,
      manager_user_id: row.managerUserId || null,
      provider: bc.provider,
      external_order_id: bc.reportId,
      status: bc.status,
      row_data: bc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,external_order_id" },
  );
  if (error) throw new Error(error.message);
}

function applyBackgroundCheck(row: DemoApplicantRow, bc: ApplicationBackgroundCheck): DemoApplicantRow {
  return { ...row, backgroundCheck: bc, backgroundCheckStatus: backgroundCheckStatusFromCheckr(bc) };
}

/**
 * Validate that a screening order MAY be placed for this application (config,
 * plan tier, ownership, applicant consent, no in-flight check). Shared by the
 * pre-payment checkout route and the order execution so we never take payment
 * for an order that would be rejected.
 */
export async function precheckBackgroundCheckOrder(opts: {
  db: SupabaseClient;
  applicationId: string;
  managerUserId: string;
}): Promise<{ ok: true; row: DemoApplicantRow } | Extract<BackgroundCheckResult, { ok: false }>> {
  if (!backgroundCheckConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Background checks are not configured. Add CHECKR_API_KEY.",
      code: "not_configured",
    };
  }

  const tier = await getManagerSubscriptionTier(opts.managerUserId);
  if (!managerScreeningAllowedForTier(tier)) {
    return {
      ok: false,
      status: 403,
      error: "Applicant screening requires Pro or Business. Upgrade your plan to run background checks.",
      code: "upgrade_required",
    };
  }

  const row = await loadApplicationRow(opts.db, opts.applicationId);
  if (!row) return { ok: false, status: 404, error: "Application not found." };
  if (row.managerUserId && row.managerUserId !== opts.managerUserId) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  if (!row.application) {
    return { ok: false, status: 400, error: "This record has no rental application to check." };
  }
  if (!row.application.consentCredit) {
    return { ok: false, status: 400, error: "Applicant did not authorize a background check." };
  }
  if (row.backgroundCheck && row.backgroundCheck.status === "pending") {
    return {
      ok: false,
      status: 409,
      error: "A background check is already in progress for this applicant.",
      code: "in_progress",
    };
  }
  return { ok: true, row };
}

/**
 * Kick off a new Checkr background check for an applicant.
 *
 * Payment: live orders are prepaid via Stripe Checkout — the webhook passes
 * `prepaid` (session + payment intent) and no additional charge happens here.
 * Without `prepaid`, the manager's saved card is charged off-session (legacy
 * path, still used by the agent tool layer). Pure simulate mode never charges.
 */
export async function runBackgroundCheck(opts: {
  db: SupabaseClient;
  applicationId: string;
  managerUserId: string;
  packageSlug?: string;
  addOnProducts?: string[];
  prepaid?: { checkoutSessionId: string; paymentIntentId?: string };
}): Promise<BackgroundCheckResult> {
  // Webhook retries and duplicate deliveries re-send the same Checkout
  // session — if we already placed this order, return it instead of
  // double-ordering.
  if (opts.prepaid) {
    const existing = await loadApplicationRow(opts.db, opts.applicationId);
    if (existing?.backgroundCheck?.stripeCheckoutSessionId === opts.prepaid.checkoutSessionId) {
      return { ok: true, row: existing, backgroundCheck: existing.backgroundCheck };
    }
  }

  const precheck = await precheckBackgroundCheckOrder(opts);
  if (!precheck.ok) return precheck;
  const row = precheck.row;
  const application = row.application;
  if (!application) {
    return { ok: false, status: 400, error: "This record has no rental application to check." };
  }

  const rawPackageSlug = opts.packageSlug ?? "";
  const packageSlug: CheckrPackage = isCheckrPackage(rawPackageSlug) ? rawPackageSlug : "essential";
  const addOnProducts = (opts.addOnProducts ?? []).filter(isCheckrAddOn) as CheckrAddOnSlug[];
  const costCents = checkrOrderCostCents(packageSlug, addOnProducts);

  let stripePaymentIntentId: string | undefined;
  if (opts.prepaid) {
    stripePaymentIntentId = opts.prepaid.paymentIntentId;
  } else if (!checkrSkipsManagerCardCharge()) {
    const charge = await chargeManagerForScreening({
      managerUserId: opts.managerUserId,
      applicationId: row.id,
      amountCents: costCents,
    });
    if (!charge.ok) {
      return { ok: false, status: 402, error: charge.message, code: charge.code };
    }
    stripePaymentIntentId = charge.paymentIntentId;
  }

  const property = await loadCheckrProperty(opts.db, row.assignedPropertyId || row.propertyId || application.propertyId);

  let created;
  try {
    created = await createBackgroundCheck(applicantInputFromApplication(application), property, {
      packageSlug,
      addOnProducts,
    });
  } catch (e) {
    const providerError = e instanceof Error ? e.message : "Checkr request failed.";
    if (stripePaymentIntentId) {
      try {
        const stripe = getStripe();
        await stripe.refunds.create({ payment_intent: stripePaymentIntentId, reason: "requested_by_customer" });
      } catch (refundError) {
        console.error("checkr background check: charge not refunded after order-creation failure", {
          applicationId: row.id,
          managerUserId: opts.managerUserId,
          paymentIntentId: stripePaymentIntentId,
          providerError,
          refundError: refundError instanceof Error ? refundError.message : String(refundError),
        });
      }
    }
    return {
      ok: false,
      status: 502,
      error: providerError,
      code: "provider_error",
    };
  }

  const now = new Date().toISOString();
  const bc: ApplicationBackgroundCheck = {
    provider: "checkr",
    candidateId: created.applicantId,
    reportId: created.orderId,
    packageSlug: created.packageSlug,
    addOnProducts: created.addOnProducts.length > 0 ? created.addOnProducts : undefined,
    status: created.status,
    result: created.result,
    reportSnapshot: created.reportSnapshot,
    reportResourceId: created.reportResourceId,
    orderedAt: now,
    completedAt: created.status === "complete" ? now : undefined,
    simulated: created.simulated || undefined,
    costCents,
    stripePaymentIntentId,
    stripeCheckoutSessionId: opts.prepaid?.checkoutSessionId,
  };

  const nextRow = applyBackgroundCheck(row, bc);
  await persistApplicationRow(opts.db, nextRow);
  await upsertBackgroundCheckOrder(opts.db, nextRow, bc);

  try {
    await recordAutoExpense(opts.db, opts.managerUserId, {
      categoryCode: "service_fees",
      amountCents: costCents,
      expenseDate: now.slice(0, 10),
      memo: `Applicant background check (Checkr) — ${row.application.fullLegalName || row.id}`,
      propertyId: row.assignedPropertyId || row.propertyId || row.application.propertyId,
      sourceStripePaymentId: charge.paymentIntentId,
    });
  } catch (e) {
    // The manager was already charged; a bookkeeping failure here must not
    // fail the background check itself — log for manual reconciliation.
    console.error("checkr background check: failed to record auto-expense", {
      applicationId: row.id,
      managerUserId: opts.managerUserId,
      paymentIntentId: charge.paymentIntentId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: true, row: nextRow, backgroundCheck: bc };
}

/** Poll Checkr for the latest state of an in-flight check and persist it. */
export async function refreshBackgroundCheck(opts: {
  db: SupabaseClient;
  applicationId: string;
  managerUserId: string;
}): Promise<BackgroundCheckResult> {
  const row = await loadApplicationRow(opts.db, opts.applicationId);
  if (!row) return { ok: false, status: 404, error: "Application not found." };
  if (row.managerUserId && row.managerUserId !== opts.managerUserId) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  const existing = row.backgroundCheck;
  if (!existing) {
    return { ok: false, status: 404, error: "No background check has been run for this applicant." };
  }
  if (existing.status === "complete") {
    return { ok: true, row, backgroundCheck: existing };
  }

  const report = await fetchBackgroundCheckReport(existing.reportId, {
    ssn: digitsOnly(row.application?.ssn),
    firstName: row.application?.fullLegalName?.trim().split(/\s+/)[0],
    lastName: row.application?.fullLegalName?.trim().split(/\s+/).slice(-1)[0],
    dob: normalizeDob(row.application?.dateOfBirth),
    packageSlug: existing.packageSlug,
    addOnProducts: existing.addOnProducts,
  });
  if (!report) return { ok: true, row, backgroundCheck: existing };

  const bc: ApplicationBackgroundCheck = {
    ...existing,
    status: report.status,
    result: report.result,
    reportSnapshot: report.reportSnapshot ?? existing.reportSnapshot,
    reportResourceId: report.reportResourceId ?? existing.reportResourceId,
    completedAt: report.status === "complete" ? new Date().toISOString() : existing.completedAt,
  };
  const nextRow = applyBackgroundCheck(row, bc);
  await persistApplicationRow(opts.db, nextRow);
  await upsertBackgroundCheckOrder(opts.db, nextRow, bc);
  return { ok: true, row: nextRow, backgroundCheck: bc };
}

/** Apply a Checkr report (from a webhook) to whichever application it belongs to. */
export async function applyBackgroundCheckReport(
  db: SupabaseClient,
  orderId: string,
  report: {
    status: ApplicationBackgroundCheck["status"];
    result: ApplicationBackgroundCheck["result"];
    reportSnapshot?: ApplicationBackgroundCheck["reportSnapshot"];
    reportResourceId?: ApplicationBackgroundCheck["reportResourceId"];
  },
): Promise<DemoApplicantRow | null> {
  const { data } = await db
    .from("screening_orders")
    .select("application_id")
    .eq("provider", "checkr")
    .eq("external_order_id", orderId)
    .maybeSingle();
  const applicationId = data?.application_id as string | undefined;
  if (!applicationId) return null;

  const row = await loadApplicationRow(db, applicationId);
  if (!row?.backgroundCheck) return null;

  const bc: ApplicationBackgroundCheck = {
    ...row.backgroundCheck,
    status: report.status,
    result: report.result,
    reportSnapshot: report.reportSnapshot ?? row.backgroundCheck.reportSnapshot,
    reportResourceId: report.reportResourceId ?? row.backgroundCheck.reportResourceId,
    completedAt: report.status === "complete" ? new Date().toISOString() : row.backgroundCheck.completedAt,
  };
  const nextRow = applyBackgroundCheck(row, bc);
  await persistApplicationRow(db, nextRow);
  await upsertBackgroundCheckOrder(db, nextRow, bc);
  return nextRow;
}

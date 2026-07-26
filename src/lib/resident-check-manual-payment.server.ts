import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveManagerUserIdForProperty } from "@/lib/auth/guest-application-upsert";
import { syncGmailPaymentReceipts } from "@/lib/gmail-payments/sync.server";
import { upsertManagerCharges } from "@/lib/household-charges.server";
import type { HouseholdCharge } from "@/lib/household-charges";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { generatePaymentReference } from "@/lib/payment-reference";
import { parseMoneyAmount } from "@/lib/parse-money";
import { chargeOwnedByUser } from "@/lib/stripe-household-charge-checkout.server";

export const MANUAL_PAYMENT_NOT_PAID_MESSAGE = "Payment not paid. Please send payment.";

export type CheckManualPaymentResult =
  | { ok: true; paid: true; charges: HouseholdCharge[] }
  | { ok: true; paid: false; message: string }
  | { ok: false; status: number; error: string };

type ChargeRow = {
  id: string;
  row_data: HouseholdCharge | null;
  status: string | null;
  manager_user_id: string | null;
};

export function chargeKeyPart(raw: string): string {
  // `.replace(/[^a-z0-9]+/g, "_")` is a single linear pass; stripping the edge
  // underscores with a character scan avoids the `/^_+|_+$/` pattern, whose
  // `_+$` backtracks polynomially on a long run of `_` (js/polynomial-redos).
  const cleaned = raw.slice(0, 512).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  let start = 0;
  let end = cleaned.length;
  while (start < end && cleaned[start] === "_") start += 1;
  while (end > start && cleaned[end - 1] === "_") end -= 1;
  return cleaned.slice(start, end) || "unknown";
}

function applicationFeeFallbackChargeId(residentEmail: string, propertyId: string): string {
  return `hc_app_fee_${chargeKeyPart(residentEmail)}_${chargeKeyPart(propertyId)}`;
}

function isChargePaid(row: ChargeRow, charge: HouseholdCharge): boolean {
  return row.status === "paid" || charge.status === "paid";
}

async function loadChargeRow(db: SupabaseClient, id: string): Promise<ChargeRow | null> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status, manager_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as ChargeRow;
}

async function loadApplicationFeeRow(
  db: SupabaseClient,
  residentEmail: string,
  propertyId: string,
  residentUserId?: string | null,
): Promise<ChargeRow | null> {
  const email = residentEmail.trim().toLowerCase();
  const pid = propertyId.trim();
  if (!email || !pid) return null;

  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status, manager_user_id")
    .eq("kind", "application_fee")
    .eq("property_id", pid)
    .eq("resident_email", email)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ChargeRow[];
  if (residentUserId) {
    const byUser = rows.find((row) => row.row_data?.residentUserId === residentUserId);
    if (byUser) return byUser;
  }
  return rows[0] ?? null;
}

async function syncManagersForCharges(db: SupabaseClient, managerIds: Iterable<string>): Promise<void> {
  for (const managerUserId of managerIds) {
    if (!managerUserId.trim()) continue;
    try {
      await syncGmailPaymentReceipts(db, managerUserId, "manager");
    } catch {
      /* Gmail may be unconfigured; still re-read charge status below. */
    }
  }
}

async function ensureApplicationFeeChargeRow(
  db: SupabaseClient,
  input: {
    residentEmail: string;
    propertyId: string;
    residentUserId?: string | null;
    residentName?: string;
  },
): Promise<ChargeRow | null> {
  const existing = await loadApplicationFeeRow(
    db,
    input.residentEmail,
    input.propertyId,
    input.residentUserId,
  );
  if (existing) return existing;

  const managerUserId = await resolveManagerUserIdForProperty(db, input.propertyId);
  if (!managerUserId) return null;

  const { data: propertyRecord, error } = await db
    .from("manager_property_records")
    .select("property_data")
    .eq("id", input.propertyId.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);

  const propertyData =
    propertyRecord?.property_data && typeof propertyRecord.property_data === "object"
      ? (propertyRecord.property_data as Record<string, unknown>)
      : null;
  const sub = propertyData?.listingSubmission as ManagerListingSubmissionV1 | undefined;
  if (!sub || sub.v !== 1) return null;

  const amount = parseMoneyAmount(sub.applicationFee);
  if (amount <= 0) return null;

  const email = input.residentEmail.trim();
  const label = sub.applicationFee?.trim() || `$${amount.toFixed(2)}`;
  const chargeId = applicationFeeFallbackChargeId(email, input.propertyId);
  const charge: HouseholdCharge = {
    id: chargeId,
    createdAt: new Date().toISOString(),
    residentEmail: email,
    residentName: input.residentName?.trim() || "Applicant",
    residentUserId: input.residentUserId ?? null,
    propertyId: input.propertyId.trim(),
    propertyLabel: typeof propertyData?.title === "string" ? propertyData.title : sub.buildingName || "Listing",
    managerUserId,
    kind: "application_fee",
    title: "Application fee",
    amountLabel: label,
    balanceLabel: label.includes("$") ? label : `$${amount.toFixed(2)}`,
    status: "pending",
    paymentReference: generatePaymentReference(chargeId),
    zelleContactSnapshot:
      sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined,
    venmoContactSnapshot:
      sub.venmoPaymentsEnabled && sub.venmoContact?.trim() ? sub.venmoContact.trim() : undefined,
    blocksLeaseUntilPaid: false,
  };

  await upsertManagerCharges(db, managerUserId, [charge as unknown as Record<string, unknown>]);
  return loadApplicationFeeRow(db, email, input.propertyId, input.residentUserId);
}

export async function checkResidentManualPayments(
  db: SupabaseClient,
  input: {
    userId?: string | null;
    userEmail: string;
    chargeIds: string[];
    requireOwnership?: boolean;
  },
): Promise<CheckManualPaymentResult> {
  const userEmail = input.userEmail.trim().toLowerCase();
  const uniqueIds = [...new Set(input.chargeIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, status: 400, error: "chargeIds is required." };
  }

  const initialRows: ChargeRow[] = [];
  const managerIds = new Set<string>();

  for (const id of uniqueIds) {
    const row = await loadChargeRow(db, id);
    if (!row) return { ok: false, status: 404, error: `Charge not found: ${id}` };
    const charge = row.row_data;
    if (!charge?.id) return { ok: false, status: 500, error: "Invalid charge record." };

    if (input.requireOwnership !== false && input.userId) {
      if (!chargeOwnedByUser(charge, input.userId, userEmail)) {
        return { ok: false, status: 403, error: "You do not have access to one of the selected charges." };
      }
    } else if (input.requireOwnership !== false && userEmail) {
      if (charge.residentEmail.trim().toLowerCase() !== userEmail) {
        return { ok: false, status: 403, error: "This payment does not match your email." };
      }
    }

    const managerUserId =
      (row.manager_user_id as string | null)?.trim() || charge.managerUserId?.trim() || "";
    if (managerUserId) managerIds.add(managerUserId);
    initialRows.push(row);
  }

  await syncManagersForCharges(db, managerIds);

  const refreshed: HouseholdCharge[] = [];
  for (const initial of initialRows) {
    const row = (await loadChargeRow(db, initial.id)) ?? initial;
    const charge = row.row_data;
    if (!charge?.id) return { ok: false, status: 500, error: "Invalid charge record." };
    const merged = { ...charge, id: String(charge.id ?? row.id) };
    if (!isChargePaid(row, merged)) {
      return { ok: true, paid: false, message: MANUAL_PAYMENT_NOT_PAID_MESSAGE };
    }
    refreshed.push(merged);
  }

  return { ok: true, paid: true, charges: refreshed };
}

export async function checkApplicationFeeManualPayment(
  db: SupabaseClient,
  input: {
    residentEmail: string;
    propertyId: string;
    residentUserId?: string | null;
    residentName?: string;
  },
): Promise<CheckManualPaymentResult> {
  const email = input.residentEmail.trim().toLowerCase();
  const propertyId = input.propertyId.trim();
  if (!email.includes("@")) {
    return { ok: false, status: 400, error: "A valid email is required." };
  }
  if (!propertyId) {
    return { ok: false, status: 400, error: "propertyId is required." };
  }

  const row =
    (await ensureApplicationFeeChargeRow(db, input)) ??
    (await loadApplicationFeeRow(db, email, propertyId, input.residentUserId));
  if (!row) {
    return { ok: true, paid: false, message: MANUAL_PAYMENT_NOT_PAID_MESSAGE };
  }

  const charge = row.row_data;
  if (!charge?.id) {
    return { ok: false, status: 500, error: "Invalid application fee record." };
  }

  const managerUserId =
    (row.manager_user_id as string | null)?.trim() || charge.managerUserId?.trim() || "";
  if (managerUserId) {
    await syncManagersForCharges(db, [managerUserId]);
  }

  const refreshed = (await loadApplicationFeeRow(db, email, propertyId, input.residentUserId)) ?? row;
  const refreshedCharge = refreshed.row_data;
  if (!refreshedCharge?.id) {
    return { ok: false, status: 500, error: "Invalid application fee record." };
  }

  if (!isChargePaid(refreshed, refreshedCharge)) {
    return { ok: true, paid: false, message: MANUAL_PAYMENT_NOT_PAID_MESSAGE };
  }

  return {
    ok: true,
    paid: true,
    charges: [{ ...refreshedCharge, id: String(refreshedCharge.id ?? refreshed.id) }],
  };
}

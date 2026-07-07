import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";
import { duplicateHouseholdChargeIds } from "@/lib/household-charges";
import { categoryCodeForChargeKind } from "@/lib/reports/categories";
import { dollarsToCents } from "@/lib/reports/money";
import { parseMoneyAmount } from "@/lib/parse-money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

function chargeAmountCents(charge: HouseholdCharge): number {
  const raw = charge.status === "paid" ? charge.amountLabel : charge.balanceLabel || charge.amountLabel;
  return dollarsToCents(parseMoneyAmount(raw));
}

function parseIsoDate(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dueDateFromCharge(charge: HouseholdCharge): string | null {
  if (charge.dueDateLabel?.trim()) {
    const parsed = parseIsoDate(charge.dueDateLabel);
    if (parsed) return parsed;
  }
  if (charge.rentMonth?.trim()) return `${charge.rentMonth}-01`;
  return parseIsoDate(charge.createdAt);
}

function throwIfLedgerError(error: { message: string } | null): void {
  if (error) throw new Error(`Ledger sync failed: ${error.message}`);
}

async function removeLedgerEntriesForChargeIds(db: SupabaseClient, chargeIds: string[]): Promise<void> {
  if (chargeIds.length === 0) return;
  const { error } = await db.from("ledger_entries").delete().in("source_charge_id", chargeIds);
  throwIfLedgerError(error);
}

async function removeDuplicateHouseholdChargeRecords(db: SupabaseClient, chargeIds: string[]): Promise<void> {
  if (chargeIds.length === 0) return;
  const { error } = await db.from("portal_household_charge_records").delete().in("id", chargeIds);
  throwIfLedgerError(error);
}

/** Removes duplicate application-fee charge rows and their ledger entries (prevents doubled income). */
export async function reconcileDuplicateHouseholdChargeRecords(
  db: SupabaseClient,
  managerUserId?: string,
): Promise<{ removedChargeIds: string[] }> {
  let query = db
    .from("portal_household_charge_records")
    .select("id, row_data")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (managerUserId) query = query.eq("manager_user_id", managerUserId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const raw = (data ?? [])
    .map((row) => row.row_data as HouseholdCharge)
    .filter((charge): charge is HouseholdCharge => Boolean(charge?.id));
  const duplicateIds = duplicateHouseholdChargeIds(raw);
  if (duplicateIds.length === 0) return { removedChargeIds: [] };

  await removeLedgerEntriesForChargeIds(db, duplicateIds);
  await removeDuplicateHouseholdChargeRecords(db, duplicateIds);
  return { removedChargeIds: duplicateIds };
}

type LedgerEntryRow = {
  manager_user_id: string | null;
  resident_user_id: string | null;
  resident_email: string;
  property_id: string;
  unit_label: string;
  lease_id: string | null;
  entry_type: "charge" | "payment";
  category_code: string;
  amount_cents: number;
  due_date: string | null;
  posted_date: string;
  source_charge_id: string;
  description: string;
  stripe_checkout_session_id?: string | null;
  updated_at: string;
};

/**
 * Row for the `charge` ledger entry mirroring a household charge (null if
 * non-positive). Demo/sample charges carry placeholder ids like
 * "demo-manager" — those can't be written to the uuid columns, so they are
 * skipped (manager) or nulled (resident).
 */
function buildChargeLedgerRow(charge: HouseholdCharge): LedgerEntryRow | null {
  const amountCents = chargeAmountCents(charge);
  if (amountCents <= 0) return null;
  if (!isUuid(charge.managerUserId)) return null;
  return {
    manager_user_id: charge.managerUserId,
    resident_user_id: isUuid(charge.residentUserId) ? charge.residentUserId : null,
    resident_email: charge.residentEmail.trim().toLowerCase(),
    property_id: charge.propertyId,
    unit_label: charge.propertyLabel,
    lease_id: charge.applicationId ?? null,
    entry_type: "charge",
    category_code: categoryCodeForChargeKind(charge.kind),
    amount_cents: amountCents,
    due_date: dueDateFromCharge(charge),
    posted_date: parseIsoDate(charge.createdAt) ?? new Date().toISOString().slice(0, 10),
    source_charge_id: charge.id,
    description: charge.title,
    updated_at: new Date().toISOString(),
  };
}

/** Row for the `payment` ledger entry recording that a charge was paid (null if non-positive). */
function buildPaymentLedgerRow(
  charge: HouseholdCharge,
  paidAt?: string | null,
  stripeCheckoutSessionId?: string | null,
): LedgerEntryRow | null {
  const amountCents = dollarsToCents(parseMoneyAmount(charge.amountLabel));
  if (amountCents <= 0) return null;
  if (!isUuid(charge.managerUserId)) return null;
  return {
    manager_user_id: charge.managerUserId,
    resident_user_id: isUuid(charge.residentUserId) ? charge.residentUserId : null,
    resident_email: charge.residentEmail.trim().toLowerCase(),
    property_id: charge.propertyId,
    unit_label: charge.propertyLabel,
    lease_id: charge.applicationId ?? null,
    entry_type: "payment",
    category_code: categoryCodeForChargeKind(charge.kind),
    amount_cents: amountCents,
    due_date: dueDateFromCharge(charge),
    posted_date: parseIsoDate(paidAt ?? charge.paidAt) ?? new Date().toISOString().slice(0, 10),
    source_charge_id: charge.id,
    description: `Payment — ${charge.title}`,
    stripe_checkout_session_id: stripeCheckoutSessionId ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function upsertLedgerEntryRow(db: SupabaseClient, row: LedgerEntryRow): Promise<void> {
  const { data: existing } = await db
    .from("ledger_entries")
    .select("id")
    .eq("source_charge_id", row.source_charge_id)
    .eq("entry_type", row.entry_type)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from("ledger_entries").update(row).eq("id", existing.id);
    throwIfLedgerError(error);
  } else {
    const { error } = await db.from("ledger_entries").insert(row);
    throwIfLedgerError(error);
  }
}

export async function syncLedgerChargeEntry(
  db: SupabaseClient,
  charge: HouseholdCharge,
): Promise<void> {
  const row = buildChargeLedgerRow(charge);
  if (row) await upsertLedgerEntryRow(db, row);

  if (charge.status === "paid") {
    await syncLedgerPaymentEntry(db, charge, charge.paidAt);
  }
}

export async function syncLedgerPaymentEntry(
  db: SupabaseClient,
  charge: HouseholdCharge,
  paidAt?: string | null,
  stripeCheckoutSessionId?: string | null,
): Promise<void> {
  const row = buildPaymentLedgerRow(charge, paidAt, stripeCheckoutSessionId);
  if (row) await upsertLedgerEntryRow(db, row);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";
import {
  dedupeHouseholdCharges,
  duplicateHouseholdChargeIds,
} from "@/lib/household-charges";
import { categoryCodeForChargeKind } from "@/lib/reports/categories";
import { dollarsToCents } from "@/lib/reports/money";
import { parseMoneyAmount } from "@/lib/parse-money";

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

async function syncDedupedCharges(
  db: SupabaseClient,
  rawCharges: HouseholdCharge[],
): Promise<number> {
  const charges = dedupeHouseholdCharges(rawCharges);
  let synced = 0;
  for (const charge of charges) {
    await syncLedgerChargeEntry(db, charge);
    synced += 1;
  }
  return synced;
}

export async function syncLedgerChargeEntry(
  db: SupabaseClient,
  charge: HouseholdCharge,
): Promise<void> {
  const amountCents = chargeAmountCents(charge);
  if (amountCents <= 0) return;

  const postedDate = parseIsoDate(charge.createdAt) ?? new Date().toISOString().slice(0, 10);
  const dueDate = dueDateFromCharge(charge);
  const now = new Date().toISOString();

  const row = {
    manager_user_id: charge.managerUserId,
    resident_user_id: charge.residentUserId,
    resident_email: charge.residentEmail.trim().toLowerCase(),
    property_id: charge.propertyId,
    unit_label: charge.propertyLabel,
    lease_id: charge.applicationId ?? null,
    entry_type: "charge" as const,
    category_code: categoryCodeForChargeKind(charge.kind),
    amount_cents: amountCents,
    due_date: dueDate,
    posted_date: postedDate,
    source_charge_id: charge.id,
    description: charge.title,
    updated_at: now,
  };

  const { data: existing } = await db
    .from("ledger_entries")
    .select("id")
    .eq("source_charge_id", charge.id)
    .eq("entry_type", "charge")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from("ledger_entries").update(row).eq("id", existing.id);
    throwIfLedgerError(error);
  } else {
    const { error } = await db.from("ledger_entries").insert(row);
    throwIfLedgerError(error);
  }

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
  const amountCents = dollarsToCents(parseMoneyAmount(charge.amountLabel));
  if (amountCents <= 0) return;

  const postedDate = parseIsoDate(paidAt ?? charge.paidAt) ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const row = {
    manager_user_id: charge.managerUserId,
    resident_user_id: charge.residentUserId,
    resident_email: charge.residentEmail.trim().toLowerCase(),
    property_id: charge.propertyId,
    unit_label: charge.propertyLabel,
    lease_id: charge.applicationId ?? null,
    entry_type: "payment" as const,
    category_code: categoryCodeForChargeKind(charge.kind),
    amount_cents: amountCents,
    due_date: dueDateFromCharge(charge),
    posted_date: postedDate,
    source_charge_id: charge.id,
    description: `Payment — ${charge.title}`,
    stripe_checkout_session_id: stripeCheckoutSessionId ?? null,
    updated_at: now,
  };

  const { data: existing } = await db
    .from("ledger_entries")
    .select("id")
    .eq("source_charge_id", charge.id)
    .eq("entry_type", "payment")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from("ledger_entries").update(row).eq("id", existing.id);
    throwIfLedgerError(error);
  } else {
    const { error } = await db.from("ledger_entries").insert(row);
    throwIfLedgerError(error);
  }
}

export async function backfillLedgerFromCharges(
  db: SupabaseClient,
  managerUserId?: string,
): Promise<{ synced: number; removedDuplicates: number }> {
  await reconcileDuplicateHouseholdChargeRecords(db, managerUserId);

  let query = db
    .from("portal_household_charge_records")
    .select("row_data")
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (managerUserId) {
    query = query.eq("manager_user_id", managerUserId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const raw = (data ?? [])
    .map((record) => record.row_data as HouseholdCharge | null)
    .filter((charge): charge is HouseholdCharge => Boolean(charge?.id));
  const synced = await syncDedupedCharges(db, raw);
  return { synced, removedDuplicates: 0 };
}

export async function backfillLedgerForResident(
  db: SupabaseClient,
  residentUserId: string,
  residentEmail: string,
): Promise<{ synced: number; removedDuplicates: number }> {
  const email = residentEmail.trim().toLowerCase();
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("row_data")
    .or(`resident_user_id.eq.${residentUserId},resident_email.eq.${email}`)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const raw = (data ?? [])
    .map((record) => record.row_data as HouseholdCharge | null)
    .filter((charge): charge is HouseholdCharge => Boolean(charge?.id));
  const managerIds = [...new Set(raw.map((charge) => charge.managerUserId).filter(Boolean))] as string[];
  for (const managerUserId of managerIds) {
    await reconcileDuplicateHouseholdChargeRecords(db, managerUserId);
  }

  const synced = await syncDedupedCharges(db, raw);
  return { synced, removedDuplicates: 0 };
}

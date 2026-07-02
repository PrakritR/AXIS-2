/**
 * Pure, server-safe payment helpers shared by the read tool, the write tool, and
 * the confirm endpoint. No database, no SDK, no browser globals — so the
 * security-critical gating logic is unit-testable in isolation.
 *
 * The household-charges module is browser-coupled (sessionStorage, in-memory
 * state); only its pure helpers and types are imported here.
 */
import {
  isHouseholdChargeOverdue,
  chargeDueLabel,
  type HouseholdCharge,
  type HouseholdChargeKind,
} from "@/lib/household-charges";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { ActionPreview } from "../registry";

/**
 * The authoritative payload for a rent reminder. Every field that reaches an
 * outbound channel (email/SMS/inbox) is derived from a server-fetched charge
 * record, never from model- or client-supplied input.
 */
export type RentReminderPreview = {
  chargeId: string;
  residentName: string;
  residentEmail: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  dueLabel: string;
};

/** Pure: the overdue, unpaid charges from an already-fetched, manager-scoped set. */
export function filterOverdueCharges(
  charges: HouseholdCharge[],
  now: Date = new Date(),
): HouseholdCharge[] {
  return charges.filter((c) => isHouseholdChargeOverdue(c, now));
}

/**
 * Security-critical lookup for the gated send.
 *
 * `managerCharges` MUST be the authenticated manager's own charges (scoped by
 * `manager_user_id` at the database boundary). This returns a charge ONLY when
 * it is both owned by the manager and currently overdue. A `chargeId` belonging
 * to another landlord — or any id not in the manager's overdue set — returns
 * null, so a send can never be addressed to a charge the manager does not own.
 */
export function findOwnedOverdueCharge(
  managerCharges: HouseholdCharge[],
  chargeId: string,
  now: Date = new Date(),
): HouseholdCharge | null {
  const id = String(chargeId ?? "").trim();
  if (!id) return null;
  return filterOverdueCharges(managerCharges, now).find((c) => c.id === id) ?? null;
}

/**
 * Resolve a model-supplied list of charge ids against the manager's own overdue
 * set (per-charge findOwnedOverdueCharge). Ids that are foreign, unknown, paid,
 * or not yet due land in `missing` and are surfaced as preview warnings.
 */
export function buildBulkReminderPreview(
  managerCharges: HouseholdCharge[],
  chargeIds: string[],
  now: Date = new Date(),
): { resolved: RentReminderPreview[]; missing: string[] } {
  const resolved: RentReminderPreview[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const id of chargeIds) {
    const key = String(id ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const charge = findOwnedOverdueCharge(managerCharges, key, now);
    if (charge) resolved.push(buildRentReminderPreview(charge));
    else missing.push(key);
  }
  return { resolved, missing };
}

/** The user-facing preview card for a (possibly bulk) rent-reminder send. */
export function buildRentRemindersActionPreview(resolved: RentReminderPreview[], missing: string[]): ActionPreview {
  return {
    kind: "rent_reminders",
    title:
      resolved.length === 1
        ? `Send a payment reminder to ${resolved[0]!.residentName}`
        : `Send ${resolved.length} payment reminders`,
    confirmLabel: resolved.length === 1 ? "Send reminder" : "Send reminders",
    fields: resolved.map((p) => ({
      label: p.residentName,
      value: `${p.chargeTitle}${p.balanceDue ? ` — ${p.balanceDue}` : ""}${p.propertyLabel ? ` (${p.propertyLabel})` : ""}`,
    })),
    ...(missing.length > 0
      ? { warnings: [`${missing.length} charge id(s) were skipped: not found in your overdue charges.`] }
      : {}),
  };
}

export type CreateChargeInput = {
  residentEmail: string;
  kind: Extract<
    HouseholdChargeKind,
    "rent" | "utilities" | "late_fee" | "security_deposit" | "move_in_fee" | "other_cost"
  >;
  title: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "2026-07-15" -> "Jul 15, 2026" without UTC/local off-by-one-day drift. */
function dueDateLabelFrom(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Build the authoritative charge record from the resolved (owned) resident and
 * the validated input. Pure: the caller supplies the id and timestamp so the
 * exact row that will be written is unit-testable.
 */
export function buildChargeFromInput(
  resident: DemoApplicantRow,
  input: CreateChargeInput,
  managerUserId: string,
  id: string,
  nowIso: string,
): HouseholdCharge {
  const amountLabel = usd.format(input.amount);
  return {
    id,
    createdAt: nowIso,
    residentEmail: String(resident.email ?? "").trim().toLowerCase(),
    residentName: resident.name || "Resident",
    residentUserId: null,
    propertyId: resident.assignedPropertyId || resident.propertyId || "",
    propertyLabel: resident.property || "",
    managerUserId,
    kind: input.kind,
    title: input.title.trim(),
    amountLabel,
    balanceLabel: amountLabel,
    status: "pending",
    blocksLeaseUntilPaid: false,
    ...(input.dueDate ? { dueDateLabel: dueDateLabelFrom(input.dueDate) } : {}),
  };
}

/** The user-facing preview card for a create_charge proposal. */
export function buildCreateChargePreview(charge: HouseholdCharge): ActionPreview {
  return {
    kind: "create_charge",
    title: `Create a ${charge.amountLabel} charge for ${charge.residentName}`,
    confirmLabel: "Create charge",
    fields: [
      { label: "Resident", value: `${charge.residentName} <${charge.residentEmail}>` },
      ...(charge.propertyLabel ? [{ label: "Property", value: charge.propertyLabel }] : []),
      { label: "Type", value: charge.kind },
      { label: "Title", value: charge.title },
      { label: "Amount", value: charge.amountLabel },
      { label: "Due date", value: charge.dueDateLabel ?? "None" },
    ],
  };
}

/** Build the authoritative reminder payload from a server-fetched charge record. */
export function buildRentReminderPreview(charge: HouseholdCharge): RentReminderPreview {
  return {
    chargeId: charge.id,
    residentName: charge.residentName?.trim() || "Resident",
    residentEmail:
      typeof charge.residentEmail === "string" ? charge.residentEmail.trim().toLowerCase() : "",
    chargeTitle: charge.title?.trim() || "outstanding charge",
    balanceDue: charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "",
    propertyLabel: charge.propertyLabel?.trim() || "",
    dueLabel: chargeDueLabel(charge),
  };
}

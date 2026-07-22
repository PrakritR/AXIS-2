import type { UtilitiesPaymentModel } from "@/lib/listing-utilities-payment";

/**
 * Per-utility responsibility breakdown that flows onto the generated lease.
 *
 * The listing-level `UtilitiesPaymentModel` (`manager_billed` / `tenant_direct` /
 * `included_in_rent`) drives billing math and the single monthly estimate. This
 * module is the *disclosure* layer the lease document needs: which individual
 * utilities are included in rent vs. paid separately, who sets up each account,
 * and any allowance where a utility is included only up to a cap. It never
 * changes billing — it is lease-document detail only.
 */

/** The individual utilities / services a lease can itemize. */
export type LeaseUtilityKind =
  | "electricity"
  | "gas"
  | "water"
  | "sewer"
  | "trash"
  | "internet"
  | "cable_tv"
  | "other";

/** Who pays for a given utility on the lease. */
export type LeaseUtilityPayment = "included_in_rent" | "resident" | "manager";

/** Who sets up / holds the account with the provider. */
export type LeaseUtilityResponsibleParty = "resident" | "manager";

export type LeaseUtilityLine = {
  /** Which utility / service this row covers. */
  kind: LeaseUtilityKind;
  /** Custom label when `kind` is "other" (e.g. "Landscaping"). */
  label?: string;
  /** Who pays — "included_in_rent" means covered by monthly rent. */
  paidBy: LeaseUtilityPayment;
  /** Who sets up and holds the account with the provider. */
  setUpBy: LeaseUtilityResponsibleParty;
  /** When included in rent, an optional monthly cap/allowance (e.g. "$50/mo"); overage billed to resident. */
  allowance?: string;
  /** Optional free-text note (provider, split arrangement, etc.). */
  notes?: string;
};

export const LEASE_UTILITY_KIND_OPTIONS: ReadonlyArray<{ id: LeaseUtilityKind; label: string }> = [
  { id: "electricity", label: "Electricity" },
  { id: "gas", label: "Gas" },
  { id: "water", label: "Water" },
  { id: "sewer", label: "Sewer" },
  { id: "trash", label: "Trash / recycling" },
  { id: "internet", label: "Internet / Wi-Fi" },
  { id: "cable_tv", label: "Cable / TV" },
  { id: "other", label: "Other" },
] as const;

const LEASE_UTILITY_KINDS: ReadonlySet<LeaseUtilityKind> = new Set(
  LEASE_UTILITY_KIND_OPTIONS.map((o) => o.id),
);

export const LEASE_UTILITY_PAYMENT_OPTIONS: ReadonlyArray<{
  id: LeaseUtilityPayment;
  label: string;
  hint: string;
}> = [
  { id: "included_in_rent", label: "Included in rent", hint: "Covered by monthly rent (up to any allowance)." },
  { id: "resident", label: "Resident pays", hint: "Resident pays the provider or is billed for it separately." },
  { id: "manager", label: "Landlord pays", hint: "Landlord pays this provider directly." },
] as const;

export const LEASE_UTILITY_PARTY_OPTIONS: ReadonlyArray<{ id: LeaseUtilityResponsibleParty; label: string }> = [
  { id: "resident", label: "Resident" },
  { id: "manager", label: "Landlord / manager" },
] as const;

/** The utilities we seed when a manager first adds a breakdown to the lease. */
const STANDARD_LEASE_UTILITY_KINDS: readonly LeaseUtilityKind[] = [
  "electricity",
  "gas",
  "water",
  "sewer",
  "trash",
  "internet",
];

function paymentDefaultFor(model: UtilitiesPaymentModel | undefined): {
  paidBy: LeaseUtilityPayment;
  setUpBy: LeaseUtilityResponsibleParty;
} {
  switch (model) {
    case "included_in_rent":
      return { paidBy: "included_in_rent", setUpBy: "manager" };
    case "manager_billed":
      // Billed to the resident through the manager's portal — resident's cost, manager's account.
      return { paidBy: "resident", setUpBy: "manager" };
    case "tenant_direct":
    default:
      return { paidBy: "resident", setUpBy: "resident" };
  }
}

/**
 * A sensible starting breakdown of the standard utilities, with payment/setup
 * defaults derived from the listing's aggregate utilities model so the two stay
 * consistent. The manager can then adjust any row.
 */
export function defaultLeaseUtilities(model?: UtilitiesPaymentModel): LeaseUtilityLine[] {
  const { paidBy, setUpBy } = paymentDefaultFor(model);
  return STANDARD_LEASE_UTILITY_KINDS.map((kind) => ({ kind, paidBy, setUpBy }));
}

function normalizePayment(raw: unknown): LeaseUtilityPayment {
  if (raw === "included_in_rent" || raw === "manager") return raw;
  return "resident";
}

function normalizeParty(raw: unknown): LeaseUtilityResponsibleParty {
  return raw === "manager" ? "manager" : "resident";
}

/** Coerce persisted / model-supplied data into a clean list, or undefined when empty. */
export function normalizeLeaseUtilities(raw: unknown): LeaseUtilityLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: LeaseUtilityLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!LEASE_UTILITY_KINDS.has(r.kind as LeaseUtilityKind)) continue;
    const kind = r.kind as LeaseUtilityKind;
    const paidBy = normalizePayment(r.paidBy);
    const line: LeaseUtilityLine = { kind, paidBy, setUpBy: normalizeParty(r.setUpBy) };
    if (kind === "other") {
      const label = typeof r.label === "string" ? r.label.trim() : "";
      if (label) line.label = label;
    }
    if (paidBy === "included_in_rent") {
      const allowance = typeof r.allowance === "string" ? r.allowance.trim() : "";
      if (allowance) line.allowance = allowance;
    }
    const notes = typeof r.notes === "string" ? r.notes.trim() : "";
    if (notes) line.notes = notes;
    out.push(line);
  }
  return out.length ? out : undefined;
}

/** Display label for a utility row (resolves the custom "other" label). */
export function leaseUtilityKindLabel(line: LeaseUtilityLine): string {
  if (line.kind === "other") return line.label?.trim() || "Other utility / service";
  return LEASE_UTILITY_KIND_OPTIONS.find((o) => o.id === line.kind)?.label ?? line.kind;
}

/** Who-pays label for a utility row. */
export function leaseUtilityPaidByLabel(line: LeaseUtilityLine): string {
  switch (line.paidBy) {
    case "included_in_rent":
      return "Included in rent";
    case "manager":
      return "Landlord pays";
    case "resident":
    default:
      return "Resident pays";
  }
}

/** Account-setup label for a utility row. */
export function leaseUtilitySetUpByLabel(line: LeaseUtilityLine): string {
  return line.setUpBy === "manager" ? "Landlord" : "Resident";
}

/** Allowance / notes cell text for a utility row (dash when nothing to show). */
export function leaseUtilityAllowanceNote(line: LeaseUtilityLine): string {
  const parts: string[] = [];
  if (line.paidBy === "included_in_rent" && line.allowance?.trim()) {
    parts.push(`Included up to ${line.allowance.trim()}`);
  }
  if (line.notes?.trim()) parts.push(line.notes.trim());
  return parts.join(" — ");
}

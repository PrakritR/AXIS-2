import { parseMoneyAmount } from "@/lib/parse-money";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { platformFeeCents } from "@/lib/platform-fees";

export type RentDueDayMode = "first_of_month" | "last_of_month";

/** @deprecated Prefer PaymentReminderKind from payment-automation-settings. */
export type PaymentReminderSlot = "7d" | "5d" | "3d" | "12h" | "overdue_daily";

/** Recommended charge presets managers can pick when adding a custom payment line. */
export const MANAGER_PAYMENT_PRESETS = [
  { id: "application_fee", label: "Application fee" },
  { id: "rent", label: "Rent" },
  { id: "utilities", label: "Utilities" },
  { id: "move_in_fee", label: "Move-in fee" },
  { id: "prorated_rent", label: "Prorated rent" },
  { id: "security_deposit", label: "Security deposit" },
  { id: "late_fee", label: "Late payment fee" },
  { id: "other", label: "Custom charge" },
] as const;

export type ManagerPaymentPresetId = (typeof MANAGER_PAYMENT_PRESETS)[number]["id"];

/** @deprecated Residents pay no ACH percentage — PropLane absorbs processing. Always 0. */
export const AXIS_ACH_FEE_PERCENT = 0;

export type ResidentAxisPaymentMethod = "ach" | "card" | "link";

/**
 * PropLane absorbs Stripe's processing cost on resident/applicant payments, so
 * bank/ACH adds nothing to what the payer owes. Always 0 — kept as a named
 * function because checkout, disclosure copy, and reporting all read it for
 * intent, and one place returning 0 is what makes "face value" unforgeable.
 */
export function achProcessingFeeCents(subtotalCents: number): number {
  void subtotalCents;
  return 0;
}

/** @deprecated Renamed to achProcessingFeeCents — residents are never charged it. */
export const achPlatformRecoupCents = achProcessingFeeCents;

/**
 * Fee added on top of the subtotal at checkout. **Always 0**: the resident (and
 * the rental applicant) pays exactly face value on every method — bank/ACH,
 * card, and Link. Stripe's real processing cost is borne by PropLane's own
 * platform balance, because every resident charge is a Connect DESTINATION
 * charge created on the platform account (PropLane is merchant of record) with
 * `application_fee_amount` omitted, so Stripe deducts its fee from PropLane
 * while the full subtotal transfers to the manager.
 */
export function residentProcessingFeeCents(subtotalCents: number, method: ResidentAxisPaymentMethod): number {
  void method;
  return achProcessingFeeCents(subtotalCents);
}

export function residentAxisPlatformFeeCents(subtotalCents: number, managerTier?: string | null): number {
  return platformFeeCents(subtotalCents, "rent", managerTier);
}

/**
 * `application_fee_amount` set on the Connect destination charge. It is exactly
 * what the payer was charged ON TOP of the subtotal, so the manager's payout is
 * always the full subtotal. Both components are 0 today (residents pay face
 * value, and the platform take rate is 0 bps on every tier), which is precisely
 * how PropLane ends up bearing Stripe's fee: with no application fee, the whole
 * subtotal transfers out of the platform balance that Stripe already debited.
 * Never set this above what the payer actually paid on top.
 */
export function residentConnectApplicationFeeCents(
  subtotalCents: number,
  method: ResidentAxisPaymentMethod,
  managerTier?: string | null,
): number {
  return residentProcessingFeeCents(subtotalCents, method) + residentAxisPlatformFeeCents(subtotalCents, managerTier);
}

/**
 * Fee the MANAGER absorbs out of a resident payment. PropLane absorbs Stripe's
 * processing cost and takes no platform fee, so the manager receives the full
 * subtotal and this is always 0 — kept as a named function so reporting reads
 * intent.
 */
export function managerAbsorbedPaymentFeeCents(): number {
  return 0;
}

/** Per-method fee disclosure. Every method is free to the payer — PropLane covers processing. */
export function residentProcessingFeeDisplayLabel(method: ResidentAxisPaymentMethod): string {
  void method;
  return "No added fees";
}

export function residentPaymentMethodLabel(method: ResidentAxisPaymentMethod): string {
  if (method === "ach") return "Bank (ACH)";
  if (method === "link") return "Link";
  return "Credit card";
}

export function normalizeRentDueDayMode(raw: unknown): RentDueDayMode {
  return raw === "last_of_month" ? "last_of_month" : "first_of_month";
}

export function rentDueDayModeFromSubmission(sub: Pick<ManagerListingSubmissionV1, "rentDueDayMode"> | null | undefined): RentDueDayMode {
  return normalizeRentDueDayMode(sub?.rentDueDayMode);
}

/** Calendar day (1–28/29/30/31) rent is due for a given month key YYYY-MM. */
export function resolveRentDueDayForMonth(mode: RentDueDayMode, monthKey: string): number {
  const [yearRaw, monthRaw] = monthKey.split("-").map(Number);
  const year = yearRaw ?? new Date().getFullYear();
  const monthIndex = (monthRaw ?? 1) - 1;
  if (mode === "last_of_month") {
    return new Date(year, monthIndex + 1, 0).getDate();
  }
  return 1;
}

export function formatRentDueDayLabel(mode: RentDueDayMode): string {
  return mode === "last_of_month" ? "Last day of month" : "1st of month";
}

export function lateFeePolicyFromSubmission(
  sub: Pick<ManagerListingSubmissionV1, "lateFeeEnabled" | "lateFeeGraceDays" | "lateFeeAmount"> | null | undefined,
): { enabled: boolean; graceDays: number; amount: number; amountLabel: string } {
  const enabled = sub?.lateFeeEnabled !== false;
  const graceDays = Math.max(0, Math.min(30, Math.round(Number(sub?.lateFeeGraceDays ?? 5) || 5)));
  const amount = parseMoneyAmount(sub?.lateFeeAmount ?? "50");
  const amountLabel = amount > 0 ? `$${amount.toFixed(2)}` : "$50.00";
  return { enabled, graceDays, amount: amount > 0 ? amount : 50, amountLabel };
}

export function axisPaymentsEnabledOnListing(sub: Pick<ManagerListingSubmissionV1, "axisPaymentsEnabled"> | null | undefined): boolean {
  return sub?.axisPaymentsEnabled !== false;
}

export function axisAchFeeDisplayLabel(): string {
  return "No added fees";
}

export function residentPaymentMethodsSummary(
  sub: Pick<
    ManagerListingSubmissionV1,
    "zellePaymentsEnabled" | "venmoPaymentsEnabled" | "axisPaymentsEnabled" | "zelleContact" | "venmoContact"
  > | null | undefined,
): string[] {
  if (!sub) return ["Contact your property manager for payment instructions."];
  const methods: string[] = [];
  if (sub.zellePaymentsEnabled && sub.zelleContact?.trim()) methods.push(`Zelle (${sub.zelleContact.trim()})`);
  if (sub.venmoPaymentsEnabled && sub.venmoContact?.trim()) methods.push(`Venmo (${sub.venmoContact.trim()})`);
  if (axisPaymentsEnabledOnListing(sub)) {
    methods.push("PropLane payments — bank (ACH), card, or Link with no added fees");
  }
  if (methods.length === 0) methods.push("Zelle, Venmo, ACH, or cash — your manager marks payments received.");
  return methods;
}

/** The payment method a resident settles a charge with — manager-controlled per property, chosen by the resident. */
export type ResidentAcceptedPaymentMethod = "zelle" | "venmo" | "ach" | "card";

export const RESIDENT_ACCEPTED_PAYMENT_METHODS: ResidentAcceptedPaymentMethod[] = ["zelle", "venmo", "ach", "card"];

export const RESIDENT_ACCEPTED_PAYMENT_METHOD_LABELS: Record<ResidentAcceptedPaymentMethod, string> = {
  zelle: "Zelle",
  venmo: "Venmo",
  ach: "ACH",
  card: "Credit card",
};

export function isResidentAcceptedPaymentMethod(value: unknown): value is ResidentAcceptedPaymentMethod {
  return typeof value === "string" && (RESIDENT_ACCEPTED_PAYMENT_METHODS as string[]).includes(value);
}

/** Payment methods a property accepts from residents. Unset/empty = every method is accepted (default). */
export function acceptedPaymentMethodsForListing(
  sub: Pick<ManagerListingSubmissionV1, "acceptedPaymentMethods"> | null | undefined,
): ResidentAcceptedPaymentMethod[] {
  const raw = sub?.acceptedPaymentMethods;
  if (!Array.isArray(raw) || raw.length === 0) return [...RESIDENT_ACCEPTED_PAYMENT_METHODS];
  const filtered = RESIDENT_ACCEPTED_PAYMENT_METHODS.filter((m) => raw.includes(m));
  return filtered.length > 0 ? filtered : [...RESIDENT_ACCEPTED_PAYMENT_METHODS];
}

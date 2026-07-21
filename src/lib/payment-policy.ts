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

/** @deprecated ACH processing percent for legacy display — prefer residentProcessingFeeCents. */
export const AXIS_ACH_FEE_PERCENT = 0.8;

export type ResidentAxisPaymentMethod = "ach" | "card" | "link";

// Stripe's real per-method processing cost, always passed through to the
// resident as a visible service-fee line so the manager receives the charge
// amount in full on EVERY method. ACH is 0.8% capped at $5 (a cap, so it is
// computed by achProcessingFeeCents rather than a flat bps+fixed); card/Link
// are 2.9% + $0.30.
const RESIDENT_PROCESSING_FEE_BPS: Record<Exclude<ResidentAxisPaymentMethod, "ach">, number> = {
  card: 290,
  link: 290,
};

const RESIDENT_PROCESSING_FEE_FIXED_CENTS: Record<Exclude<ResidentAxisPaymentMethod, "ach">, number> = {
  card: 30,
  link: 30,
};

/**
 * Stripe's actual ACH processing cost: 0.8% of the subtotal, capped at $5.00.
 * The resident pays this as a service fee (like card processing) so the manager
 * is kept whole; it is also the Connect application_fee_amount that recovers the
 * pass-through from the checkout total. Never charge more than Stripe's real cost.
 */
export function achProcessingFeeCents(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  return Math.min(Math.round((subtotalCents * 80) / 10_000), 500);
}

/** @deprecated Renamed to achProcessingFeeCents — no longer recouped from the manager. */
export const achPlatformRecoupCents = achProcessingFeeCents;

/** Processing pass-through charged to the resident (before Axis tier fee). */
export function residentProcessingFeeCents(subtotalCents: number, method: ResidentAxisPaymentMethod): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  if (method === "ach") return achProcessingFeeCents(subtotalCents);
  const bps = RESIDENT_PROCESSING_FEE_BPS[method];
  const fixed = RESIDENT_PROCESSING_FEE_FIXED_CENTS[method];
  return Math.floor((subtotalCents * bps) / 10_000) + fixed;
}

export function residentAxisPlatformFeeCents(subtotalCents: number, managerTier?: string | null): number {
  return platformFeeCents(subtotalCents, "rent", managerTier);
}

/**
 * Total application fee retained by Axis on Connect destination charges. This
 * equals exactly what the resident pays on top of the subtotal (processing +
 * tier fee) for the chosen method, so the manager's Connect payout is always the
 * full subtotal regardless of method.
 */
export function residentConnectApplicationFeeCents(
  subtotalCents: number,
  method: ResidentAxisPaymentMethod,
  managerTier?: string | null,
): number {
  return residentProcessingFeeCents(subtotalCents, method) + residentAxisPlatformFeeCents(subtotalCents, managerTier);
}

/**
 * Fee the MANAGER absorbs out of a resident payment. Residents cover the
 * processing/service fee on every method (card AND ACH), so the manager is kept
 * whole and this is always 0 — kept as a named function so reporting reads intent.
 */
export function managerAbsorbedPaymentFeeCents(): number {
  return 0;
}

export function residentProcessingFeeDisplayLabel(method: ResidentAxisPaymentMethod): string {
  if (method === "ach") return "0.8% bank processing (max $5.00)";
  if (method === "link") return "2.9% + $0.30 Link processing";
  return "2.9% + $0.30 card processing";
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
  return "0.8% bank processing (max $5.00)";
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
    methods.push("PropLane payments — bank (ACH), card, or Link at standard processing fees");
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

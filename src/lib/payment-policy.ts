import { parseMoneyAmount } from "@/lib/parse-money";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { platformFeeCents } from "@/lib/platform-fees";

export type RentDueDayMode = "first_of_month" | "last_of_month";

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

/** Platform ACH processing fee shown when Axis payments are enabled (low pass-through). */
export const AXIS_ACH_FEE_PERCENT = 0.8;

export type ResidentAxisPaymentMethod = "ach" | "card" | "link";

const RESIDENT_PROCESSING_FEE_BPS: Record<ResidentAxisPaymentMethod, number> = {
  ach: 80,
  card: 290,
  link: 290,
};

const RESIDENT_PROCESSING_FEE_FIXED_CENTS: Record<ResidentAxisPaymentMethod, number> = {
  ach: 0,
  card: 30,
  link: 30,
};

/** Processing pass-through charged to the resident (before Axis tier fee). */
export function residentProcessingFeeCents(subtotalCents: number, method: ResidentAxisPaymentMethod): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const bps = RESIDENT_PROCESSING_FEE_BPS[method];
  const fixed = RESIDENT_PROCESSING_FEE_FIXED_CENTS[method];
  return Math.floor((subtotalCents * bps) / 10_000) + fixed;
}

export function residentAxisPlatformFeeCents(subtotalCents: number, managerTier?: string | null): number {
  return platformFeeCents(subtotalCents, "rent", managerTier);
}

/** Total application fee retained by Axis on Connect destination charges. */
export function residentConnectApplicationFeeCents(
  subtotalCents: number,
  method: ResidentAxisPaymentMethod,
  managerTier?: string | null,
): number {
  return residentProcessingFeeCents(subtotalCents, method) + residentAxisPlatformFeeCents(subtotalCents, managerTier);
}

export function residentProcessingFeeDisplayLabel(method: ResidentAxisPaymentMethod): string {
  if (method === "ach") return `${AXIS_ACH_FEE_PERCENT}% bank processing`;
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
  return `${AXIS_ACH_FEE_PERCENT}% ACH processing fee`;
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
    methods.push(`Axis payments — bank from ${axisAchFeeDisplayLabel()}, card/Link at higher processing`);
  }
  if (methods.length === 0) methods.push("Zelle, Venmo, ACH, or cash — your manager marks payments received.");
  return methods;
}

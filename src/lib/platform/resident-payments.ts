import type { HouseholdCharge } from "@/lib/household-charges";
import { canPayHouseholdChargeWithAxisAch } from "@/lib/household-charge-payment-eligibility";
import type { ResidentAxisPaymentMethod } from "@/lib/payment-policy";

export type ResidentManualPaymentChannel = "zelle" | "venmo";

export type ResidentPayMethod = ResidentAxisPaymentMethod | ResidentManualPaymentChannel;

export const RESIDENT_WEB_PAYMENT_METHODS: ResidentAxisPaymentMethod[] = ["ach", "link", "card"];

/** iOS/Android app — bank (ACH) and card via Stripe. */
export const RESIDENT_NATIVE_PAYMENT_METHODS: ResidentAxisPaymentMethod[] = ["ach", "card"];

export function residentPaymentMethodsForSurface(isNativeApp: boolean): ResidentAxisPaymentMethod[] {
  return isNativeApp ? RESIDENT_NATIVE_PAYMENT_METHODS : RESIDENT_WEB_PAYMENT_METHODS;
}

export function coerceResidentPaymentMethodForSurface(
  method: ResidentAxisPaymentMethod | undefined,
  isNativeApp: boolean,
): ResidentAxisPaymentMethod {
  const normalized: ResidentAxisPaymentMethod =
    method === "card" || method === "link" ? method : "ach";
  if (isNativeApp && normalized === "link") return "ach";
  if (isNativeApp) return normalized === "card" ? "card" : "ach";
  return normalized;
}

export function isStripeResidentPayMethod(method: ResidentPayMethod): method is ResidentAxisPaymentMethod {
  return method === "ach" || method === "card" || method === "link";
}

export function residentManualPaymentMethodLabel(channel: ResidentManualPaymentChannel): string {
  return channel === "venmo" ? "Venmo" : "Zelle";
}

export function canPayHouseholdChargeWithManualChannel(
  charge: HouseholdCharge,
  channel: ResidentManualPaymentChannel,
): boolean {
  if (charge.status !== "pending") return false;
  if (channel === "zelle") return Boolean(charge.zelleContactSnapshot?.trim());
  return Boolean(charge.venmoContactSnapshot?.trim());
}

export function isPayableHouseholdCharge(charge: HouseholdCharge): boolean {
  if (charge.status !== "pending") return false;
  return (
    canPayHouseholdChargeWithAxisAch(charge) ||
    canPayHouseholdChargeWithManualChannel(charge, "zelle") ||
    canPayHouseholdChargeWithManualChannel(charge, "venmo")
  );
}

export function filterChargesForPayMethod(
  charges: HouseholdCharge[],
  method: ResidentPayMethod,
): HouseholdCharge[] {
  if (method === "zelle" || method === "venmo") {
    return charges.filter((c) => canPayHouseholdChargeWithManualChannel(c, method));
  }
  return charges.filter((c) => canPayHouseholdChargeWithAxisAch(c));
}

export function availableManualChannelsForCharges(
  charges: HouseholdCharge[],
): ResidentManualPaymentChannel[] {
  const out: ResidentManualPaymentChannel[] = [];
  if (charges.some((c) => canPayHouseholdChargeWithManualChannel(c, "zelle"))) out.push("zelle");
  if (charges.some((c) => canPayHouseholdChargeWithManualChannel(c, "venmo"))) out.push("venmo");
  return out;
}

export function manualContactForCharges(
  charges: HouseholdCharge[],
  channel: ResidentManualPaymentChannel,
): string | null {
  for (const charge of charges) {
    const contact =
      channel === "zelle" ? charge.zelleContactSnapshot?.trim() : charge.venmoContactSnapshot?.trim();
    if (contact) return contact;
  }
  return null;
}

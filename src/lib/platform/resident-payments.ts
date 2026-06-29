import type { ResidentAxisPaymentMethod } from "@/lib/payment-policy";

export const RESIDENT_WEB_PAYMENT_METHODS: ResidentAxisPaymentMethod[] = ["ach", "link", "card"];

/** iOS/Android app — resident rent and fees use bank (ACH) via Stripe only. */
export const RESIDENT_NATIVE_PAYMENT_METHODS: ResidentAxisPaymentMethod[] = ["ach"];

export function residentPaymentMethodsForSurface(isNativeApp: boolean): ResidentAxisPaymentMethod[] {
  return isNativeApp ? RESIDENT_NATIVE_PAYMENT_METHODS : RESIDENT_WEB_PAYMENT_METHODS;
}

export function coerceResidentPaymentMethodForSurface(
  method: ResidentAxisPaymentMethod | undefined,
  isNativeApp: boolean,
): ResidentAxisPaymentMethod {
  const normalized: ResidentAxisPaymentMethod =
    method === "card" || method === "link" ? method : "ach";
  if (isNativeApp) return "ach";
  return normalized;
}

import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";

/** How a vendor prefers to receive payment for completed work. */
export type VendorAcceptedPaymentMethod = "zelle" | "venmo" | "ach";

export const VENDOR_ACCEPTED_PAYMENT_METHODS: VendorAcceptedPaymentMethod[] = ["zelle", "venmo", "ach"];

export const VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS: Record<VendorAcceptedPaymentMethod, string> = {
  zelle: "Zelle",
  venmo: "Venmo",
  ach: "Bank (ACH)",
};

export type VendorPaymentMethodSettings = Pick<
  ManagerVendorRow,
  | "zellePaymentsEnabled"
  | "zelleContact"
  | "venmoPaymentsEnabled"
  | "venmoContact"
  | "achPaymentsEnabled"
  | "acceptedPaymentMethods"
>;

export function acceptedPaymentMethodsForVendor(
  row: VendorPaymentMethodSettings | null | undefined,
): VendorAcceptedPaymentMethod[] {
  const raw = row?.acceptedPaymentMethods;
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = VENDOR_ACCEPTED_PAYMENT_METHODS.filter((method) => raw.includes(method));
    if (filtered.length > 0) return filtered;
  }

  const derived: VendorAcceptedPaymentMethod[] = [];
  if (row?.zellePaymentsEnabled && row.zelleContact?.trim()) derived.push("zelle");
  if (row?.venmoPaymentsEnabled && row.venmoContact?.trim()) derived.push("venmo");
  if (row?.achPaymentsEnabled) derived.push("ach");
  return derived;
}

export function vendorPaymentMethodSummaryLines(row: VendorPaymentMethodSettings | null | undefined): string[] {
  const lines: string[] = [];
  if (row?.zellePaymentsEnabled && row.zelleContact?.trim()) {
    lines.push(`Zelle: ${row.zelleContact.trim()}`);
  }
  if (row?.venmoPaymentsEnabled && row.venmoContact?.trim()) {
    lines.push(`Venmo: ${row.venmoContact.trim()}`);
  }
  if (row?.achPaymentsEnabled) {
    lines.push("Bank (ACH) via Stripe Connect");
  }
  return lines;
}

export function vendorPaymentMethodSummaryLabel(row: VendorPaymentMethodSettings | null | undefined): string {
  const methods = acceptedPaymentMethodsForVendor(row);
  if (methods.length === 0) return "No payment methods set";
  return methods.map((method) => VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS[method]).join(", ");
}

export function buildVendorAcceptedPaymentMethods(input: {
  zellePaymentsEnabled: boolean;
  zelleContact: string;
  venmoPaymentsEnabled: boolean;
  venmoContact: string;
  achPaymentsEnabled: boolean;
}): VendorAcceptedPaymentMethod[] {
  const methods: VendorAcceptedPaymentMethod[] = [];
  if (input.zellePaymentsEnabled && input.zelleContact.trim()) methods.push("zelle");
  if (input.venmoPaymentsEnabled && input.venmoContact.trim()) methods.push("venmo");
  if (input.achPaymentsEnabled) methods.push("ach");
  return methods;
}

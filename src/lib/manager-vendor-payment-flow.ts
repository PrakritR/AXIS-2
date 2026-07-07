import type { DemoManagerOutgoingPaymentRow } from "@/data/demo-portal";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import {
  acceptedPaymentMethodsForVendor,
  VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS,
  type VendorAcceptedPaymentMethod,
} from "@/lib/vendor-payment-methods";

/** How a manager pays a vendor for an outgoing vendor payment. */
export type ManagerVendorPayMethod = VendorAcceptedPaymentMethod;

export const MANAGER_VENDOR_PAY_METHOD_OPTIONS: {
  id: ManagerVendorPayMethod;
  title: string;
  feeLabel: string;
}[] = [
  { id: "ach", title: "Bank (ACH)", feeLabel: "Pay through Axis · Stripe Connect" },
  { id: "zelle", title: "Zelle", feeLabel: "No processing fee" },
  { id: "venmo", title: "Venmo", feeLabel: "No processing fee" },
];

export function managerVendorPayMethodLabel(method: ManagerVendorPayMethod): string {
  return VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS[method];
}

export function availableManagerVendorPayMethods(
  vendor: ManagerVendorRow | null | undefined,
): ManagerVendorPayMethod[] {
  return acceptedPaymentMethodsForVendor(vendor);
}

export function defaultManagerVendorPayMethod(
  vendor: ManagerVendorRow | null | undefined,
): ManagerVendorPayMethod | null {
  const methods = availableManagerVendorPayMethods(vendor);
  if (methods.includes("ach")) return "ach";
  return methods[0] ?? null;
}

export function enrichOutgoingRowWithVendorPayments(
  row: DemoManagerOutgoingPaymentRow,
  vendor: ManagerVendorRow | null | undefined,
): DemoManagerOutgoingPaymentRow {
  if (!vendor || !row.workOrderId) return row;
  const methods = availableManagerVendorPayMethods(vendor);
  return {
    ...row,
    vendorId: vendor.id,
    vendorPaymentMethods: methods,
    zelleContactSnapshot: vendor.zellePaymentsEnabled ? vendor.zelleContact?.trim() || undefined : undefined,
    venmoContactSnapshot: vendor.venmoPaymentsEnabled ? vendor.venmoContact?.trim() || undefined : undefined,
    achAvailable: methods.includes("ach"),
  };
}

export function managerCanPayOutgoingRowWithMethod(
  row: DemoManagerOutgoingPaymentRow,
  method: ManagerVendorPayMethod,
): boolean {
  if (row.bucket === "paid" || !row.workOrderId) return false;
  return row.vendorPaymentMethods?.includes(method) ?? false;
}

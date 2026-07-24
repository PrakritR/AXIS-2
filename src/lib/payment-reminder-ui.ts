import type { DemoManagerPaymentLedgerRow } from "@/data/demo-portal";

/** Human-readable recipient for payment reminder preview modals. */
export function paymentReminderRecipientLabel(row: Pick<DemoManagerPaymentLedgerRow, "residentName" | "residentEmail">): string {
  const name = row.residentName?.trim();
  if (name) return `${name} (Resident)`;
  return row.residentEmail?.trim() || "Resident";
}

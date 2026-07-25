export type GmailPaymentTrackRole = "manager" | "vendor";

export function gmailPaymentsStorageKey(role: GmailPaymentTrackRole): string {
  return role === "manager" ? "gmailPaymentsManager" : "gmailPaymentsVendor";
}

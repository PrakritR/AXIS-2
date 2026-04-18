/** Toggle full resident workspace (leases, payments, work orders, inbox) vs. application-under-review shell. */
export function isResidentApplicationApproved(): boolean {
  return process.env.NEXT_PUBLIC_RESIDENT_APPLICATION_APPROVED === "true";
}

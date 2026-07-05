/** Client-side shape returned by GET /api/vendor/payouts. */
export type VendorPayout = {
  id: string;
  workOrderId: string;
  amountCents: number;
  stripeTransferId: string | null;
  status: "paid" | "failed" | "skipped";
  failureReason: string | null;
  createdAt: string;
};

export async function fetchVendorPayouts(): Promise<VendorPayout[]> {
  try {
    const res = await fetch("/api/vendor/payouts", { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { payouts?: VendorPayout[] };
    return Array.isArray(data.payouts) ? data.payouts : [];
  } catch {
    return [];
  }
}

/** Client-side shape returned by GET /api/portal/work-order-bids; shared by the manager and vendor work-order panels.
 * "upfront" bids price the work order directly; "after_consultation" bids start with only
 * a consultationVisitAt set — amountCents/proposedTime stay null until the vendor prices the
 * job post-visit. */
export type WorkOrderBid = {
  id: string;
  workOrderId: string;
  vendorUserId: string;
  vendorDirectoryId: string | null;
  vendorName?: string;
  vendorEmail?: string;
  quoteMode: "upfront" | "after_consultation";
  consultationVisitAt: string | null;
  amountCents: number | null;
  materialsCents: number;
  proposedTime: string | null;
  note: string | null;
  status: "submitted" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
};

export async function fetchWorkOrderBids(workOrderId?: string): Promise<WorkOrderBid[]> {
  try {
    const query = workOrderId ? `?workOrderId=${encodeURIComponent(workOrderId)}` : "";
    const res = await fetch(`/api/portal/work-order-bids${query}`, { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { bids?: WorkOrderBid[] };
    return Array.isArray(data.bids) ? data.bids : [];
  } catch {
    return [];
  }
}

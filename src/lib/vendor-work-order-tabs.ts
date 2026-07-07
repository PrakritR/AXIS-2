import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { WorkOrderBid } from "@/lib/work-order-bids";

/** Vendor Services tabs — matches how jobs actually flow. */
export type VendorWorkOrderTab = "quote" | "tour" | "scheduled" | "completed";

export const VENDOR_WORK_ORDER_TAB_ORDER: VendorWorkOrderTab[] = ["quote", "tour", "scheduled", "completed"];

export const VENDOR_WORK_ORDER_TAB_LABELS: Record<VendorWorkOrderTab, string> = {
  quote: "Quote",
  tour: "Site visit",
  scheduled: "Scheduled",
  completed: "Completed",
};

/** Consultation booked; vendor still owes labor price + work date. */
export function isPricingPendingBid(bid: WorkOrderBid | undefined): boolean {
  return Boolean(
    bid &&
      bid.quoteMode === "after_consultation" &&
      bid.consultationVisitAt &&
      bid.amountCents == null &&
      bid.status === "submitted",
  );
}

/**
 * Classify a vendor work order into the Services tab it belongs in.
 *
 * - **Quote** — manager opened bidding; vendor quotes now or books a site visit first.
 * - **Site visit** — consultation is on the calendar; vendor prices the job afterward.
 * - **Scheduled** — fixed price or accepted quote; confirmed visit / in progress.
 * - **Completed** — job done (paid or awaiting manager sign-off).
 */
export function vendorWorkOrderTab(
  row: DemoManagerWorkOrderRow,
  bid?: WorkOrderBid,
): VendorWorkOrderTab {
  if (row.bucket === "completed") return "completed";
  if (isPricingPendingBid(bid)) return "tour";
  if (row.biddingOpen) return "quote";
  return "scheduled";
}

export function vendorWorkOrderPhaseLabel(row: DemoManagerWorkOrderRow, bid?: WorkOrderBid): string | null {
  const tab = vendorWorkOrderTab(row, bid);
  if (tab === "quote") {
    if (!bid) return "Needs quote";
    if (bid.quoteMode === "after_consultation" && !bid.consultationVisitAt) return "Book site visit";
    return "Awaiting manager";
  }
  if (tab === "tour") return "Price after visit";
  if (tab === "scheduled") {
    if (row.automationStatus === "vendor_marked_done") return "Awaiting approval";
    if (row.automationStatus === "paid") return "Paid";
    if (bid?.status === "accepted") return "Accepted";
    if ((row.vendorCostCents ?? 0) > 0 && !row.biddingOpen) return "Fixed price";
    return row.scheduledAtIso ? "Visit booked" : "In progress";
  }
  if (row.automationStatus === "paid") return "Paid";
  if (row.automationStatus === "vendor_marked_done") return "Awaiting approval";
  return null;
}

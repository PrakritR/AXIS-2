import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

/** True when the vendor (not the manager) fixed the work order price — manager Cost field stays read-only. */
export function isWorkOrderCostLockedByVendor(row: DemoManagerWorkOrderRow): boolean {
  if (row.vendorPriceSetAt) return true;
  if (row.biddingResolvedAt && (row.vendorCostCents ?? 0) > 0) return true;
  return false;
}

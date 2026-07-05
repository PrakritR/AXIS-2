/**
 * Shared translation layer between the three "type of work" vocabularies that
 * exist independently today:
 *   - the resident maintenance-report picklist (free-standing labels),
 *   - the work-order row's `category` enum (`DemoManagerWorkOrderRow.category`),
 *   - vendor `trade` strings (`ManagerVendorRow.trade`).
 *
 * None of the three is renamed here to avoid churn — this module only maps
 * between them so a later auto-match step can compare like-for-like.
 */

import type { WorkOrderCategory } from "@/lib/reports/categories";

export type { WorkOrderCategory };

/** Options shown in the resident "Report maintenance" picklist. */
export type ResidentMaintenanceCategoryLabel =
  | "Plumbing"
  | "Electrical"
  | "HVAC"
  | "Appliance"
  | "Access / Locks"
  | "General";

const RESIDENT_CATEGORY_TO_WORK_ORDER_CATEGORY: Record<ResidentMaintenanceCategoryLabel, WorkOrderCategory> = {
  Plumbing: "plumbing",
  Electrical: "electrical",
  HVAC: "hvac",
  Appliance: "appliance",
  "Access / Locks": "access",
  General: "general",
};

/** Maps a resident-picklist label to the canonical work-order `category`. */
export function workOrderCategoryForResidentLabel(label: string): WorkOrderCategory {
  return RESIDENT_CATEGORY_TO_WORK_ORDER_CATEGORY[label as ResidentMaintenanceCategoryLabel] ?? "general";
}

/**
 * Maps a vendor `trade` string (`TRADE_OPTIONS` in
 * `manager-vendors-panel.tsx`) to the canonical work-order categories that
 * trade can service. Trades with no reliable indoor-maintenance counterpart
 * (Landscaping, Pest control, Other) map to an empty list rather than a
 * guessed category, so auto-match doesn't produce false positives.
 */
const VENDOR_TRADE_TO_WORK_ORDER_CATEGORIES: Record<string, WorkOrderCategory[]> = {
  "General maintenance": ["general", "appliance", "access"],
  Plumbing: ["plumbing"],
  Electrical: ["electrical"],
  HVAC: ["hvac"],
  "Appliance repair": ["appliance"],
  Landscaping: [],
  Cleaning: ["cleaning"],
  "Pest control": [],
  Other: [],
};

/** Canonical work-order categories a given vendor `trade` can service. */
export function categoriesForVendorTrade(trade: string): WorkOrderCategory[] {
  return VENDOR_TRADE_TO_WORK_ORDER_CATEGORIES[trade] ?? [];
}

/** Whether a vendor with the given `trade` can service the given work-order `category`. */
export function vendorTradeMatchesCategory(trade: string, category: WorkOrderCategory): boolean {
  return categoriesForVendorTrade(trade).includes(category);
}

/** Canonical work-order categories serviceable across ALL of a vendor's self-selected trade capabilities. */
export function categoriesForVendorTrades(trades: string[]): WorkOrderCategory[] {
  const out = new Set<WorkOrderCategory>();
  for (const trade of trades) {
    for (const category of categoriesForVendorTrade(trade)) out.add(category);
  }
  return [...out];
}

/** Whether ANY of a vendor's trade capabilities can service the given work-order `category`. */
export function vendorCapabilitiesMatchCategory(trades: string[], category: WorkOrderCategory): boolean {
  return trades.some((trade) => vendorTradeMatchesCategory(trade, category));
}

/** Trade/category options a vendor can pick as their own work capabilities. */
export const VENDOR_TRADE_OPTIONS = [
  "General maintenance",
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance repair",
  "Landscaping",
  "Cleaning",
  "Pest control",
  "Other",
] as const;

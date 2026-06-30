import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { loadAllManagerRows } from "./load-manager-rows";

/**
 * Server-side read of the landlord's own vendors, scoped by manager_user_id.
 * Only the landlord's own vendor records are returned. The separate
 * `vendor_tax_profiles` table (W-9 / TIN data) is NEVER read here — tax
 * identifiers must not be exposed to the model.
 */
async function loadManagerVendors(ctx: AgentContext): Promise<ManagerVendorRow[]> {
  return loadAllManagerRows(
    ctx,
    "manager_vendor_records",
    (rowData) => rowData as ManagerVendorRow,
  );
}

function summarizeVendor(v: ManagerVendorRow) {
  return {
    id: v.id,
    name: v.name || null,
    trade: v.trade || null,
    phone: v.phone || null,
    email: v.email || null,
    notes: v.notes || null,
    active: v.active !== false,
    propertyIds: Array.isArray(v.propertyIds) ? v.propertyIds : [],
  };
}

export const listVendorsTool = defineTool({
  name: "list_vendors",
  description:
    "List the current landlord's vendors (contractors/service providers) with name, trade, contact info, active status, and the properties they cover. Use to answer questions like 'who are my plumbers' or 'list my active vendors'. Does not include tax/W-9 information.",
  kind: "read",
  inputSchema: z
    .object({
      activeOnly: z
        .boolean()
        .optional()
        .describe("When true, return only vendors marked active."),
      trade: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on the vendor's trade, e.g. 'plumbing'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadManagerVendors(ctx);
    const wantTrade = input.trade?.trim().toLowerCase();
    const filtered = rows.filter((v) => {
      if (input.activeOnly && v.active === false) return false;
      if (wantTrade && String(v.trade ?? "").toLowerCase() !== wantTrade) return false;
      return true;
    });
    return { count: filtered.length, vendors: filtered.map(summarizeVendor) };
  },
});

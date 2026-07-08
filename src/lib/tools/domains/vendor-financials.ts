/**
 * Vendor-financials tools. These back a vendor-scoped agent surface: every read
 * and write is scoped by `vendor_user_id = ctx.userId` — the authenticated user
 * id, never model- or client-supplied — exactly like `landlordId` scopes the
 * manager tools. A vendor can only ever reach their own invoices and payouts;
 * cross-vendor access is structurally impossible.
 *
 * W-9 / TIN data is deliberately NOT exposed here (or anywhere in the tool map):
 * self-service W-9 stays a UI-only surface, following the same precedent as
 * `financials.ts`, which withholds `1099_candidates` because tax identifiers
 * must never reach the model.
 */
import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import { resolveOwnVendorRecords } from "@/lib/vendor-own-record";
import {
  mapVendorInvoiceRow,
  normalizeLineItems,
  sumLineItemsCents,
  VENDOR_INVOICE_SELECT,
  VENDOR_INVOICE_STATUSES,
  type VendorInvoiceLineItem,
} from "@/lib/vendor-invoices";

function summarizeInvoice(row: Record<string, unknown>) {
  const inv = mapVendorInvoiceRow(row);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    totalCents: inv.totalCents,
    subtotalCents: inv.subtotalCents,
    taxCents: inv.taxCents,
    lineItemCount: inv.lineItems.length,
    workOrderId: inv.workOrderId,
    submittedAt: inv.submittedAt,
    decidedAt: inv.decidedAt,
    paidAt: inv.paidAt,
  };
}

export const listVendorInvoicesTool = defineTool({
  name: "list_vendor_invoices",
  description:
    "List the signed-in vendor's own invoices (billing they submitted to their managers) with status, totals in cents, and dates. Use for questions like 'which of my invoices are still unpaid' or 'show my approved invoices'. Never includes W-9 / tax-identifier data.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .enum(VENDOR_INVOICE_STATUSES)
        .optional()
        .describe("Optional filter to a single invoice status."),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) => {
    let query = ctx.db
      .from("vendor_invoices")
      .select(VENDOR_INVOICE_SELECT)
      .eq("vendor_user_id", ctx.userId)
      .order("submitted_at", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const invoices = (data ?? []).map(summarizeInvoice);
    return { count: invoices.length, invoices };
  },
});

export const submitVendorInvoiceTool = defineTool({
  name: "submit_vendor_invoice",
  description:
    "Submit a new invoice from the signed-in vendor to one of the managers they work for. Amounts are integer cents. Requires explicit user confirmation before it runs. The total is computed server-side from the line items — never trust a model-supplied total.",
  kind: "write",
  inputSchema: z
    .object({
      managerUserId: z
        .string()
        .optional()
        .describe("Manager to bill. Defaults to the vendor's first linked manager when omitted."),
      workOrderId: z.string().optional().describe("Optional work order this invoice bills for."),
      invoiceNumber: z.string().optional(),
      lineItems: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().int().nonnegative(),
            unitAmountCents: z.number().int().nonnegative(),
          }),
        )
        .min(1)
        .describe("Line items; each amount is quantity × unitAmountCents (cents)."),
      taxCents: z.number().int().nonnegative().optional(),
      memo: z.string().optional(),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) => {
    const links = await resolveOwnVendorRecords(ctx.db, ctx.userId);
    if (links.length === 0) throw new Error("No linked manager found for this vendor account.");
    const target = input.managerUserId
      ? links.find((l) => l.managerUserId === input.managerUserId)
      : links[0];
    if (!target) throw new Error("You are not linked to that manager.");

    const lineItems: VendorInvoiceLineItem[] = normalizeLineItems(input.lineItems);
    if (lineItems.length === 0) throw new Error("At least one line item is required.");
    const subtotalCents = sumLineItemsCents(lineItems);
    const taxCents = Math.max(0, Math.round(input.taxCents ?? 0));
    const totalCents = subtotalCents + taxCents;

    const now = new Date().toISOString();
    const { data, error } = await ctx.db
      .from("vendor_invoices")
      .insert({
        manager_user_id: target.managerUserId,
        vendor_user_id: ctx.userId,
        vendor_id: target.id,
        work_order_id: input.workOrderId?.trim() || null,
        invoice_number: input.invoiceNumber?.trim() || null,
        line_items: lineItems,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        status: "submitted",
        memo: input.memo?.trim() || null,
        submitted_at: now,
        updated_at: now,
      })
      .select(VENDOR_INVOICE_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return { invoice: summarizeInvoice(data) };
  },
});

export const listVendorPayoutsTool = defineTool({
  name: "list_vendor_payouts",
  description:
    "List the signed-in vendor's own Stripe payout history (one row per paid work order), with amount in cents, status (paid/failed/skipped), and any failure reason. Use for 'have I been paid for job X' type questions.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .enum(["paid", "failed", "skipped"])
        .optional()
        .describe("Optional filter to a single payout status."),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) => {
    let query = ctx.db
      .from("vendor_payouts")
      .select("id, work_order_id, amount_cents, stripe_transfer_id, status, failure_reason, created_at")
      .eq("vendor_user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const payouts = (data ?? []).map((row) => ({
      id: row.id as string,
      workOrderId: row.work_order_id as string,
      amountCents: row.amount_cents as number,
      status: row.status as "paid" | "failed" | "skipped",
      failureReason: (row.failure_reason as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
    return { count: payouts.length, payouts };
  },
});

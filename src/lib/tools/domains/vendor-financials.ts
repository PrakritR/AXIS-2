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
import { defineTool, defineWriteTool } from "../registry";
import type { ActionPreview } from "../registry";
import type { AgentContext } from "../context";
import { track } from "@/lib/analytics/posthog";
import {
  formatInvoiceMoney,
  mapVendorInvoiceRow,
  VENDOR_INVOICE_SELECT,
  VENDOR_INVOICE_STATUSES,
} from "@/lib/vendor-invoices";
import {
  insertVendorInvoiceRow,
  prepareVendorInvoiceSubmission,
} from "@/lib/vendor-invoice-submit.server";

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

const submitVendorInvoiceSchema = z
  .object({
    managerUserId: z
      .string()
      .optional()
      .describe(
        "Manager to bill. May be omitted when the vendor has exactly one linked manager; with multiple links it is required.",
      ),
    workOrderId: z
      .string()
      .optional()
      .describe(
        "Optional work order this invoice bills for. Must be one of the vendor's own work orders for the billed manager.",
      ),
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
  .strict();

type SubmitVendorInvoiceInput = z.infer<typeof submitVendorInvoiceSchema>;

export const submitVendorInvoiceTool = defineWriteTool<
  SubmitVendorInvoiceInput,
  { reply: string; invoice: ReturnType<typeof summarizeInvoice> }
>({
  name: "submit_vendor_invoice",
  description:
    "Submit a new invoice from the signed-in vendor to one of the managers they work for. Amounts are integer cents. The vendor sees exactly what will be billed and must confirm before it is submitted. The total is computed server-side from the line items — never trust a model-supplied total.",
  inputSchema: submitVendorInvoiceSchema,
  // Preview and handler both re-run the full shared validation
  // (prepareVendorInvoiceSubmission) so the handler re-resolves current state
  // at confirm time; the preview only ever shows the resolved target manager.
  preview: async (ctx: AgentContext, input): Promise<ActionPreview> => {
    const prepared = await prepareVendorInvoiceSubmission(ctx.db, ctx.userId, input);
    const { data: managerProfile } = await ctx.db
      .from("profiles")
      .select("full_name")
      .eq("id", prepared.target.managerUserId)
      .maybeSingle();
    const managerName = (managerProfile?.full_name as string | null)?.trim() || "your property manager";
    return {
      kind: "submit_vendor_invoice",
      title: "Submit this invoice",
      confirmLabel: "Submit invoice",
      fields: [
        { label: "Bill to", value: managerName },
        ...(input.invoiceNumber?.trim() ? [{ label: "Invoice number", value: input.invoiceNumber.trim() }] : []),
        ...(prepared.workOrderId
          ? [
              {
                label: "Work order",
                value: prepared.workOrderTitle
                  ? `${prepared.workOrderTitle} (${prepared.workOrderId})`
                  : prepared.workOrderId,
              },
            ]
          : []),
        ...prepared.lineItems.map((item) => ({
          label: item.description || "Line item",
          value: `${item.quantity} × ${formatInvoiceMoney(item.unitAmountCents)} = ${formatInvoiceMoney(item.amountCents)}`,
        })),
        ...(prepared.taxCents > 0 ? [{ label: "Tax", value: formatInvoiceMoney(prepared.taxCents) }] : []),
        { label: "Total", value: formatInvoiceMoney(prepared.totalCents) },
        ...(input.memo?.trim() ? [{ label: "Memo", value: input.memo.trim() }] : []),
      ],
    };
  },
  handler: async (ctx: AgentContext, input) => {
    const prepared = await prepareVendorInvoiceSubmission(ctx.db, ctx.userId, input);

    const now = new Date().toISOString();
    // Record the action before mutating state — a write tool never runs
    // without an audit row (same contract as send_rent_reminder).
    const { data: auditRow, error: auditError } = await ctx.db
      .from("audit_log")
      .insert({
        actor_user_id: ctx.userId,
        landlord_id: prepared.target.managerUserId,
        action: "submit_vendor_invoice",
        tool_name: "submit_vendor_invoice",
        input_summary: {
          workOrderId: prepared.workOrderId,
          lineItems: prepared.lineItems.length,
          totalCents: prepared.totalCents,
        },
        created_at: now,
      })
      .select("id")
      .single();
    if (auditError || !auditRow) {
      throw new Error("Could not record the action; no invoice was submitted.");
    }

    const { data, error } = await insertVendorInvoiceRow(ctx.db, prepared, {
      vendorUserId: ctx.userId,
      invoiceNumber: input.invoiceNumber,
      memo: input.memo,
      now,
    });
    if (error || !data) {
      await ctx.db
        .from("audit_log")
        .update({ result_summary: { saved: false } })
        .eq("id", auditRow.id as string);
      throw new Error(error?.message || "Could not save the invoice.");
    }

    await ctx.db
      .from("audit_log")
      .update({ result_summary: { invoiceId: data.id as string, totalCents: prepared.totalCents } })
      .eq("id", auditRow.id as string);

    track("vendor_invoice_submitted", ctx.userId, {
      invoice_id: data.id as string,
      total_cents: prepared.totalCents,
      line_items: prepared.lineItems.length,
      has_work_order: Boolean(prepared.workOrderId),
    });

    const invoice = summarizeInvoice(data);
    return {
      reply: `Submitted invoice ${invoice.invoiceNumber || invoice.id} for ${formatInvoiceMoney(prepared.totalCents)}.`,
      invoice,
    };
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

import { describe, it, expect } from "vitest";
import { agentRegistry, vendorAgentRegistry } from "@/lib/tools";
import { listVendorInvoicesTool, listVendorPayoutsTool } from "@/lib/tools/domains/vendor-financials";
import {
  normalizeLineItems,
  sumLineItemsCents,
  vendorInvoiceBadgeTone,
} from "@/lib/vendor-invoices";
import { makeManagerRowsCtx } from "./fake-agent-ctx";

function vendorInvoiceRow(vendorUserId: string, id: string, status: string, total: number) {
  return {
    id,
    vendor_user_id: vendorUserId,
    vendor_id: "vendor-dir-1",
    work_order_id: null,
    invoice_number: id,
    line_items: [{ description: "x", quantity: 1, unitAmountCents: total, amountCents: total }],
    subtotal_cents: total,
    tax_cents: 0,
    total_cents: total,
    currency: "usd",
    status,
    memo: null,
    decision_note: null,
    bill_id: null,
    submitted_at: "2026-07-01T00:00:00Z",
    decided_at: null,
    paid_at: null,
    created_at: "2026-07-01T00:00:00Z",
  } as unknown as Parameters<typeof makeManagerRowsCtx>[0][string][number];
}

function payoutRow(vendorUserId: string, id: string, status: string) {
  return {
    id,
    vendor_user_id: vendorUserId,
    work_order_id: "wo-1",
    amount_cents: 5000,
    stripe_transfer_id: null,
    status,
    failure_reason: null,
    created_at: "2026-07-01T00:00:00Z",
  } as unknown as Parameters<typeof makeManagerRowsCtx>[0][string][number];
}

describe("vendor-financials tool map safety", () => {
  it("never exposes a W-9 / TIN / tax-profile / 1099 tool in either registry", () => {
    const names = [...agentRegistry.values(), ...vendorAgentRegistry.values()].map((t) => t.name.toLowerCase());
    // No tool NAME may surface a tax-identifier capability to the model.
    for (const forbidden of ["tax", "w9", "w_9", "1099", "tin", "ssn"]) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
  });

  it("registers the three vendor-financials tools separately from the manager map", () => {
    const vendorNames = new Set([...vendorAgentRegistry.values()].map((t) => t.name));
    expect(vendorNames).toEqual(new Set(["list_vendor_invoices", "submit_vendor_invoice", "list_vendor_payouts"]));
    // The manager map must not inherit the vendor-scoped tools.
    const managerNames = new Set([...agentRegistry.values()].map((t) => t.name));
    for (const n of vendorNames) expect(managerNames.has(n)).toBe(false);
  });

  it("submit_vendor_invoice is a gated write; the reads are read tools", () => {
    const byName = new Map([...vendorAgentRegistry.values()].map((t) => [t.name, t]));
    expect(byName.get("submit_vendor_invoice")?.kind).toBe("write");
    expect(byName.get("list_vendor_invoices")?.kind).toBe("read");
    expect(byName.get("list_vendor_payouts")?.kind).toBe("read");
  });
});

describe("vendor invoice scoping", () => {
  it("list_vendor_invoices returns only the caller's own invoices", async () => {
    const ctx = makeManagerRowsCtx(
      {
        vendor_invoices: [
          vendorInvoiceRow("vendor_a", "inv-a1", "submitted", 1000),
          vendorInvoiceRow("vendor_a", "inv-a2", "paid", 2000),
          vendorInvoiceRow("vendor_b", "inv-b1", "submitted", 9999),
        ],
      },
      { userId: "vendor_a", roles: ["vendor"] },
    );
    const result = (await listVendorInvoicesTool.handler(ctx, {})) as {
      count: number;
      invoices: { id: string }[];
    };
    expect(result.count).toBe(2);
    expect(result.invoices.map((i) => i.id).sort()).toEqual(["inv-a1", "inv-a2"]);
  });

  it("list_vendor_payouts returns only the caller's own payouts", async () => {
    const ctx = makeManagerRowsCtx(
      {
        vendor_payouts: [payoutRow("vendor_a", "p-a", "paid"), payoutRow("vendor_b", "p-b", "paid")],
      },
      { userId: "vendor_a", roles: ["vendor"] },
    );
    const result = (await listVendorPayoutsTool.handler(ctx, {})) as {
      count: number;
      payouts: { id: string }[];
    };
    expect(result.count).toBe(1);
    expect(result.payouts[0]?.id).toBe("p-a");
  });
});

describe("vendor invoice helpers", () => {
  it("recomputes line-item amounts server-side (ignores any supplied total)", () => {
    const items = normalizeLineItems([
      { description: "Labor", quantity: 3, unitAmountCents: 5000, amountCents: 999999 },
      { description: "Parts", quantity: 2, unitAmountCents: 2500 },
    ]);
    expect(items[0]?.amountCents).toBe(15000);
    expect(items[1]?.amountCents).toBe(5000);
    expect(sumLineItemsCents(items)).toBe(20000);
  });

  it("maps invoice status onto the four shared Badge tones", () => {
    expect(vendorInvoiceBadgeTone("submitted")).toBe("pending");
    expect(vendorInvoiceBadgeTone("approved")).toBe("approved");
    expect(vendorInvoiceBadgeTone("scheduled")).toBe("approved");
    expect(vendorInvoiceBadgeTone("paid")).toBe("confirmed");
    expect(vendorInvoiceBadgeTone("rejected")).toBe("overdue");
  });
});

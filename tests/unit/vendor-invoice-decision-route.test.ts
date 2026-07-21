import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level coverage for PATCH /api/vendor/invoices/[id]/decision: the
 * manager decision endpoint must enforce the submitted → approved/rejected →
 * scheduled → paid status flow (repeated approval only repairs bill/GL state
 * without repeating analytics), preserve the decision note when a later
 * transition omits it, and detect a concurrent status change between read and
 * update. Runs the real handler against an in-memory vendor_invoices fake.
 */

type Row = Record<string, unknown>;

function makeFakeDb(rows: Row[], hooks: { afterRead?: () => void } = {}) {
  function builder() {
    const filters: [string, unknown][] = [];
    let mode: "select" | "update" = "select";
    let patch: Row | null = null;

    const matched = () => rows.filter((r) => filters.every(([col, val]) => r[col] === val));
    const api = {
      select() {
        return api;
      },
      update(vals: Row) {
        mode = "update";
        patch = vals;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      not(col: string, operator: string, val: unknown) {
        if (operator === "is" && val === null) {
          filters.push([col, Symbol.for("not-null")]);
        }
        return api;
      },
      maybeSingle() {
        if (mode === "update") {
          const hit =
            rows.find((row) =>
              filters.every(([col, val]) =>
                val === Symbol.for("not-null") ? row[col] !== null : row[col] === val,
              ),
            ) ?? null;
          if (hit && patch) Object.assign(hit, patch);
          return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
        }
        const hit = matched()[0] ?? null;
        const snapshot = hit ? { ...hit } : null;
        hooks.afterRead?.();
        return Promise.resolve({ data: snapshot, error: null });
      },
    };
    return api;
  }
  return { from: builder };
}

const state = vi.hoisted(() => ({
  auth: null as { db: unknown; userId: string } | null,
  events: [] as { event: string; userId: string; props: Row }[],
  billsCreated: [] as string[],
  billCreationError: null as Error | null,
}));

vi.mock("@/lib/reports/auth", () => ({
  getReportsAuthContext: async () => state.auth,
  assertManagerFinancialsAccess: async () => ({ ok: true }),
}));

vi.mock("@/lib/analytics/posthog", () => ({
  track: (event: string, userId: string, props: Row) => {
    state.events.push({ event, userId, props });
  },
}));

vi.mock("@/lib/manager-bills.server", () => ({
  createBillFromVendorInvoice: async (_db: unknown, _managerId: string, invoiceId: string) => {
    state.billsCreated.push(invoiceId);
    if (state.billCreationError) throw state.billCreationError;
    return { id: "bill-1" };
  },
}));

const MANAGER_ID = "manager_a";
const VENDOR_ID = "vendor_a";

function invoiceRow(status: string, extra: Row = {}): Row {
  return {
    id: "inv-1",
    manager_user_id: MANAGER_ID,
    vendor_user_id: VENDOR_ID,
    vendor_id: "dir-1",
    work_order_id: null,
    invoice_number: "INV-100",
    line_items: [{ description: "Labor", quantity: 2, unitAmountCents: 5000, amountCents: 10000 }],
    subtotal_cents: 10000,
    tax_cents: 0,
    total_cents: 10000,
    currency: "usd",
    status,
    memo: null,
    decision_note: null,
    bill_id: null,
    submitted_at: "2026-07-01T00:00:00.000Z",
    decided_at: null,
    paid_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...extra,
  };
}

async function patchDecision(body: Row) {
  const { PATCH } = await import("@/app/api/vendor/invoices/[id]/decision/route");
  return PATCH(
    new Request("https://example.com/api/vendor/invoices/inv-1/decision", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "inv-1" }) },
  );
}

describe("PATCH /api/vendor/invoices/[id]/decision status flow", () => {
  let rows: Row[];

  beforeEach(() => {
    state.events = [];
    state.billsCreated = [];
    state.billCreationError = null;
    rows = [];
    state.auth = { db: makeFakeDb(rows), userId: MANAGER_ID };
    vi.resetModules();
  });

  it("approves a submitted invoice, fires the vendor-attributed event, and creates the bill", async () => {
    rows.push(invoiceRow("submitted"));
    const res = await patchDecision({ status: "approved", decisionNote: "Looks good" });
    const json = await res.json();
    console.log("approve submitted →", res.status, JSON.stringify(json.invoice, null, 2));
    expect(res.status).toBe(200);
    expect(json.invoice.status).toBe("approved");
    expect(json.invoice.decisionNote).toBe("Looks good");
    expect(json.invoice.billId).toBe("bill-1");
    expect(state.events).toEqual([
      { event: "vendor_invoice_approved", userId: VENDOR_ID, props: { invoice_id: "inv-1", status: "approved", total_cents: 10000 } },
    ]);
    expect(state.billsCreated).toEqual(["inv-1"]);
  });

  it("leaves a failed approval bill creation repairable", async () => {
    rows.push(invoiceRow("submitted"));
    state.billCreationError = new Error("Bill create failed");

    const res = await patchDecision({ status: "approved" });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to create bill for approved invoice.");
    expect(rows[0]!.status).toBe("approved");
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual(["inv-1"]);

    state.billCreationError = null;
    const retry = await patchDecision({ status: "approved" });
    expect(retry.status).toBe(200);
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual(["inv-1", "inv-1"]);
  });

  it("refuses to mark a submitted invoice paid (409) and leaves the row untouched", async () => {
    rows.push(invoiceRow("submitted"));
    const res = await patchDecision({ status: "paid" });
    const json = await res.json();
    console.log("pay submitted →", res.status, JSON.stringify(json));
    expect(res.status).toBe(409);
    expect(json.error).toMatch(/submitted.*cannot be marked paid/i);
    expect(rows[0]!.status).toBe("submitted");
    expect(rows[0]!.paid_at).toBeNull();
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual([]);
  });

  it("idempotently verifies the linked bill on repeated approval without repeating analytics", async () => {
    rows.push(invoiceRow("approved", { bill_id: "bill-1" }));
    const res = await patchDecision({ status: "approved" });
    console.log("re-approve approved →", res.status, JSON.stringify(await res.clone().json()));
    expect(res.status).toBe(200);
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual(["inv-1"]);
  });

  it("repairs an approved invoice that has no linked bill without repeating analytics", async () => {
    rows.push(invoiceRow("approved"));
    const res = await patchDecision({ status: "approved" });

    expect(res.status).toBe(200);
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual(["inv-1"]);
  });

  it("does not schedule or pay an approved invoice until its bill is linked", async () => {
    for (const status of ["scheduled", "paid"]) {
      rows.length = 0;
      rows.push(invoiceRow("approved"));
      const res = await patchDecision({ status });

      expect(res.status, status).toBe(409);
      expect(rows[0]!.status).toBe("approved");
    }
  });

  it("schedules an approved invoice without firing any approval event", async () => {
    rows.push(invoiceRow("approved", { bill_id: "bill-1" }));
    const res = await patchDecision({ status: "scheduled" });
    const json = await res.json();
    console.log("schedule approved →", res.status, JSON.stringify(json.invoice.status));
    expect(res.status).toBe(200);
    expect(json.invoice.status).toBe("scheduled");
    expect(state.events).toEqual([]);
  });

  it("rejects any transition out of a terminal status", async () => {
    for (const terminal of ["paid", "rejected"]) {
      rows.length = 0;
      rows.push(invoiceRow(terminal));
      for (const next of ["approved", "rejected", "scheduled", "paid"]) {
        const res = await patchDecision({ status: next });
        expect(res.status, `${terminal} → ${next}`).toBe(409);
      }
      expect(rows[0]!.status).toBe(terminal);
    }
    expect(state.events).toEqual([]);
  });

  it("preserves the decision note when a later transition omits it", async () => {
    rows.push(invoiceRow("approved", { bill_id: "bill-1", decision_note: "Approved at quoted rate" }));
    const res = await patchDecision({ status: "paid" });
    const json = await res.json();
    console.log("pay approved (no note in body) →", res.status, JSON.stringify({ status: json.invoice.status, decisionNote: json.invoice.decisionNote, paidAt: json.invoice.paidAt }));
    expect(res.status).toBe(200);
    expect(json.invoice.status).toBe("paid");
    expect(json.invoice.decisionNote).toBe("Approved at quoted rate");
    expect(json.invoice.paidAt).toBeTruthy();
  });

  it("clears the note only when the body sends an explicit blank note", async () => {
    rows.push(invoiceRow("approved", { bill_id: "bill-1", decision_note: "Approved at quoted rate" }));
    const res = await patchDecision({ status: "paid", decisionNote: "   " });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.invoice.decisionNote).toBeNull();
  });

  it("returns 409 when the status changes between read and update", async () => {
    rows.push(invoiceRow("submitted"));
    state.auth = {
      db: makeFakeDb(rows, {
        afterRead: () => {
          rows[0]!.status = "rejected";
        },
      }),
      userId: MANAGER_ID,
    };
    const res = await patchDecision({ status: "approved" });
    const json = await res.json();
    console.log("concurrent decision →", res.status, JSON.stringify(json));
    expect(res.status).toBe(409);
    expect(json.error).toMatch(/changed while deciding/i);
    expect(rows[0]!.status).toBe("rejected");
    expect(state.events).toEqual([]);
    expect(state.billsCreated).toEqual([]);
  });
});

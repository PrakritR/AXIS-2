import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HouseholdCharge } from "@/lib/household-charges";
import type { ResidentReceiptContext } from "@/lib/payment-receipt-email/parse-receipt";
import { parseResidentReceiptContext } from "@/lib/payment-receipt-email/parse-receipt";

// upsertManagerCharges + deliverPortalInboxMessage are the only DB-writing calls
// in the matcher; stub them so the test exercises the matching + idempotency
// logic without a live Supabase.
const { upsertMock, deliverMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async () => {}),
  deliverMock: vi.fn(async () => {}),
}));
vi.mock("@/lib/household-charges.server", () => ({ upsertManagerCharges: upsertMock }));
vi.mock("@/lib/portal-inbox-delivery", () => ({ deliverPortalInboxMessage: deliverMock }));

import { markChargePaidFromReceipt } from "@/lib/payment-receipt-email/mark-charge-from-receipt.server";

const MANAGER_ID = "mgr-1";

function charge(overrides: Partial<HouseholdCharge>): HouseholdCharge {
  return {
    id: "hc_app_fee_junaid",
    createdAt: "2026-07-01T00:00:00.000Z",
    residentEmail: "junaid@example.com",
    residentName: "Junaid Mohammed",
    residentUserId: "resident-1",
    propertyId: "mgr-5257-brooklyn",
    propertyLabel: "5257 Brooklyn Avenue",
    managerUserId: MANAGER_ID,
    kind: "application_fee",
    title: "Application fee",
    amountLabel: "$50.00",
    balanceLabel: "$50.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    ...overrides,
  };
}

/**
 * Minimal fake Supabase client. `processed` is a shared set the upsert stub
 * writes source ids into, so the idempotency SELECT reflects a "persisted"
 * mark-paid on a second run — exactly the real re-sync scenario.
 */
function makeDb(pendingRows: HouseholdCharge[], processed: Set<string>) {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              return {
                limit: async () => ({ data: processed.has(val) ? [{ id: "x" }] : [], error: null }),
                in: async () => ({
                  data: pendingRows.map((c) => ({ id: c.id, row_data: c, status: c.status })),
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as never;
}

// The real Venmo receipt currently sitting in ogambik2@gmail.com.
const REAL_VENMO_RECEIPT = {
  fromEmail: "venmo@venmo.com",
  subject: "Junaid Mohammed paid you $50.00",
  body: "Junaid Mohammed paid you $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
};

function contextFor(email: { fromEmail: string; subject: string; body: string }): ResidentReceiptContext {
  const ctx = parseResidentReceiptContext(email);
  if (!ctx) throw new Error("expected a parseable receipt");
  return ctx;
}

describe("markChargePaidFromReceipt — reference-less real receipt", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    deliverMock.mockReset();
    upsertMock.mockImplementation(async () => {});
    deliverMock.mockImplementation(async () => {});
  });

  it("marks the matching application-fee charge paid from the real Venmo email", async () => {
    const processed = new Set<string>();
    const db = makeDb([charge({})], processed);

    const result = await markChargePaidFromReceipt(db, MANAGER_ID, contextFor(REAL_VENMO_RECEIPT), {
      sourceId: "gmail-msg-1",
      sourceField: "paidViaGmailMessageId",
    });

    expect(result.outcome).toBe("marked_paid");
    if (result.outcome === "marked_paid") {
      expect(result.chargeId).toBe("hc_app_fee_junaid");
      expect(result.channel).toBe("venmo");
      expect(result.matchedBy).toBe("context");
    }
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const merged = upsertMock.mock.calls[0]![2][0] as HouseholdCharge;
    expect(merged.status).toBe("paid");
    expect(merged.paidViaGmailMessageId).toBe("gmail-msg-1");
    expect(merged.manualPaymentChannel).toBe("venmo");
  });

  it("surfaces an ambiguous case instead of auto-crediting", async () => {
    const processed = new Set<string>();
    const rows = [
      charge({ id: "hc_a" }),
      charge({ id: "hc_b", title: "Holding deposit", kind: "holding_deposit" }),
    ];
    const db = makeDb(rows, processed);

    const result = await markChargePaidFromReceipt(db, MANAGER_ID, contextFor(REAL_VENMO_RECEIPT), {
      sourceId: "gmail-msg-2",
      sourceField: "paidViaGmailMessageId",
    });

    expect(result.outcome).toBe("ambiguous");
    if (result.outcome === "ambiguous") expect(result.matchCount).toBe(2);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("credits a genuine receipt whose body carries reject-word boilerplate", async () => {
    const db = makeDb([charge({})], new Set<string>());
    const receipt = contextFor({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed paid you $50.00",
      body: [
        "Junaid Mohammed paid you $50.00",
        "Application fee for room 5 at 5257 Brooklyn avenue",
        "If you did not request this transfer, contact us.",
        "View your statement online.",
      ].join("\n"),
    });

    const result = await markChargePaidFromReceipt(db, MANAGER_ID, receipt, {
      sourceId: "gmail-msg-boilerplate",
      sourceField: "paidViaGmailMessageId",
    });

    expect(result.outcome).toBe("marked_paid");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("never credits from a Venmo payment REQUEST (no money received)", async () => {
    const requestEmail = {
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed requests $50.00",
      body: "Junaid Mohammed requests $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
    };
    const receipt = parseResidentReceiptContext(requestEmail);
    expect(receipt).toBeNull();

    const db = makeDb([charge({})], new Set());
    if (receipt) {
      await markChargePaidFromReceipt(db, MANAGER_ID, receipt, {
        sourceId: "gmail-msg-request",
        sourceField: "paidViaGmailMessageId",
      });
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("never credits from the manager's own OUTBOUND 'You paid' email", async () => {
    const outboundEmail = {
      fromEmail: "venmo@venmo.com",
      subject: "You paid Junaid Mohammed $50.00",
      body: "You paid Junaid Mohammed $50.00\nRefund — Application fee at 5257 Brooklyn avenue",
    };
    const receipt = parseResidentReceiptContext(outboundEmail);
    expect(receipt).toBeNull();

    const db = makeDb([charge({})], new Set());
    if (receipt) {
      await markChargePaidFromReceipt(db, MANAGER_ID, receipt, {
        sourceId: "gmail-msg-outbound",
        sourceField: "paidViaGmailMessageId",
      });
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("is idempotent — the same receipt processed twice never double-credits", async () => {
    const processed = new Set<string>();
    // First run persists the source id (as the real upsert would).
    upsertMock.mockImplementation(async (_db: unknown, _mgr: unknown, charges: HouseholdCharge[]) => {
      const c = charges[0]!;
      if (c.paidViaGmailMessageId) processed.add(c.paidViaGmailMessageId);
    });
    const db = makeDb([charge({})], processed);
    const opts = { sourceId: "gmail-msg-3", sourceField: "paidViaGmailMessageId" as const };
    const ctx = contextFor(REAL_VENMO_RECEIPT);

    const first = await markChargePaidFromReceipt(db, MANAGER_ID, ctx, opts);
    const second = await markChargePaidFromReceipt(db, MANAGER_ID, ctx, opts);

    expect(first.outcome).toBe("marked_paid");
    expect(second.outcome).toBe("idempotent");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

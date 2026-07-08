import { describe, expect, it, vi } from "vitest";
import {
  isApplicationFeeCheckoutSession,
  markApplicationFeePaidFromStripeSession,
} from "@/lib/stripe-application-fee";

describe("stripe-application-fee", () => {
  it("identifies application fee sessions", () => {
    expect(
      isApplicationFeeCheckoutSession({ metadata: { purpose: "rental_application_fee" } } as never),
    ).toBe(true);
    expect(isApplicationFeeCheckoutSession({ metadata: {} } as never)).toBe(false);
  });
});

describe("markApplicationFeePaidFromStripeSession", () => {
  const session = {
    id: "cs_test_1",
    payment_status: "paid",
    metadata: {
      purpose: "rental_application_fee",
      property_id: "prop-1",
      resident_email: "res@test.com",
    },
  } as never;

  const paidCharge = {
    id: "hc-1",
    kind: "application_fee",
    propertyId: "prop-1",
    managerUserId: "3b9c2c65-6f0f-4d3a-9a3e-0b7f6f8a1c2d",
    residentUserId: null,
    residentEmail: "res@test.com",
    propertyLabel: "Unit 1",
    status: "paid",
    paidAt: "2026-01-02T00:00:00.000Z",
    amountLabel: "$50.00",
    balanceLabel: "$0.00",
    title: "Application fee",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  function makeDb(ledgerInsert: ReturnType<typeof vi.fn>) {
    const chargeEq = vi.fn().mockResolvedValue({
      data: [{ id: "hc-1", row_data: paidCharge, status: "paid" }],
      error: null,
    });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const ledgerEq2 = vi.fn().mockReturnValue({ maybeSingle });
    const ledgerEq1 = vi.fn().mockReturnValue({ eq: ledgerEq2 });
    const from = vi.fn((table: string) => {
      if (table === "portal_household_charge_records") {
        return { select: vi.fn().mockReturnValue({ eq: chargeEq }) };
      }
      return { select: vi.fn().mockReturnValue({ eq: ledgerEq1 }), insert: ledgerInsert };
    });
    return { db: { from } as never, chargeEq };
  }

  it("finds an already-paid charge on retry and heals its ledger entry", async () => {
    const ledgerInsert = vi.fn().mockResolvedValue({ error: null });
    const { db } = makeDb(ledgerInsert);

    const result = await markApplicationFeePaidFromStripeSession(db, session);
    expect(result).toEqual({ ok: true, chargeId: "hc-1", alreadyPaid: true });
    expect(ledgerInsert).toHaveBeenCalledTimes(1);
    expect(ledgerInsert.mock.calls[0][0]).toMatchObject({
      entry_type: "payment",
      source_charge_id: "hc-1",
      amount_cents: 5000,
    });
  });

  it("still reports success when the already-paid heal fails transiently", async () => {
    const ledgerInsert = vi.fn().mockResolvedValue({ error: { message: "transient" } });
    const { db } = makeDb(ledgerInsert);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await markApplicationFeePaidFromStripeSession(db, session);
    expect(result).toEqual({ ok: true, chargeId: "hc-1", alreadyPaid: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

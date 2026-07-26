import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdCharge } from "@/lib/household-charges";

const syncGmailPaymentReceipts = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/gmail-payments/sync.server", () => ({
  syncGmailPaymentReceipts,
}));

vi.mock("@/lib/auth/guest-application-upsert", () => ({
  resolveManagerUserIdForProperty: vi.fn(async () => "manager-1"),
}));

vi.mock("@/lib/household-charges.server", () => ({
  upsertManagerCharges: vi.fn(async () => undefined),
}));

import {
  MANUAL_PAYMENT_NOT_PAID_MESSAGE,
  chargeKeyPart,
  checkApplicationFeeManualPayment,
  checkResidentManualPayments,
} from "@/lib/resident-check-manual-payment.server";

type ChargeRow = {
  id: string;
  row_data: HouseholdCharge;
  status: string | null;
  manager_user_id: string | null;
  kind?: string;
  property_id?: string;
  resident_email?: string;
  updated_at?: string;
};

function makeCharge(overrides: Partial<HouseholdCharge> & { id: string }): HouseholdCharge {
  return {
    id: overrides.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    residentEmail: "resident@example.com",
    residentName: "Resident",
    residentUserId: "user-resident",
    propertyId: "prop-1",
    propertyLabel: "Oak House",
    managerUserId: "manager-1",
    kind: "rent",
    title: "March rent",
    amountLabel: "$500.00",
    balanceLabel: "$500.00",
    status: "pending",
    paymentReference: "PL-TEST01",
    blocksLeaseUntilPaid: false,
    ...overrides,
  };
}

function makeDb(rows: ChargeRow[]) {
  const store = rows.map((row) => ({ ...row, row_data: { ...row.row_data } }));
  const from = vi.fn((table: string) => {
    if (table !== "portal_household_charge_records") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    }

    const api = {
      filters: [] as Array<(row: ChargeRow) => boolean>,
      select() {
        return api;
      },
      eq(col: keyof ChargeRow, val: unknown) {
        api.filters.push((row) => (row as Record<string, unknown>)[col] === val);
        return api;
      },
      order() {
        return api;
      },
      async limit() {
        const matched = store.filter((row) => api.filters.every((f) => f(row)));
        return { data: matched, error: null };
      },
      async maybeSingle() {
        const matched = store.filter((row) => api.filters.every((f) => f(row)));
        return { data: matched[0] ?? null, error: null };
      },
    };
    return api;
  });

  return { from: from as never };
}

describe("checkResidentManualPayments", () => {
  beforeEach(() => {
    syncGmailPaymentReceipts.mockClear();
  });

  it("returns not paid when the charge is still pending", async () => {
    const charge = makeCharge({ id: "hc-1" });
    const db = makeDb([
      {
        id: "hc-1",
        row_data: charge,
        status: "pending",
        manager_user_id: "manager-1",
      },
    ]);

    const result = await checkResidentManualPayments(db, {
      userId: "user-resident",
      userEmail: "resident@example.com",
      chargeIds: ["hc-1"],
    });

    expect(syncGmailPaymentReceipts).toHaveBeenCalledWith(db, "manager-1", "manager");
    expect(result).toEqual({ ok: true, paid: false, message: MANUAL_PAYMENT_NOT_PAID_MESSAGE });
  });

  it("returns paid when the charge row is marked paid", async () => {
    const charge = makeCharge({ id: "hc-1", status: "paid", paidAt: "2026-03-01T00:00:00.000Z" });
    const db = makeDb([
      {
        id: "hc-1",
        row_data: charge,
        status: "paid",
        manager_user_id: "manager-1",
      },
    ]);

    const result = await checkResidentManualPayments(db, {
      userId: "user-resident",
      userEmail: "resident@example.com",
      chargeIds: ["hc-1"],
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.paid) {
      expect(result.charges[0]?.id).toBe("hc-1");
      expect(result.charges[0]?.status).toBe("paid");
    } else {
      throw new Error("expected paid result");
    }
  });

  it("refuses when the resident does not own the charge", async () => {
    const charge = makeCharge({ id: "hc-1", residentUserId: "other-user", residentEmail: "other@example.com" });
    const db = makeDb([
      {
        id: "hc-1",
        row_data: charge,
        status: "pending",
        manager_user_id: "manager-1",
      },
    ]);

    const result = await checkResidentManualPayments(db, {
      userId: "user-resident",
      userEmail: "resident@example.com",
      chargeIds: ["hc-1"],
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "You do not have access to one of the selected charges.",
    });
  });
});

describe("checkApplicationFeeManualPayment", () => {
  beforeEach(() => {
    syncGmailPaymentReceipts.mockClear();
  });

  it("returns not paid when no application fee row exists yet", async () => {
    const db = makeDb([]);

    const result = await checkApplicationFeeManualPayment(db, {
      residentEmail: "applicant@example.com",
      propertyId: "prop-1",
    });

    expect(result).toEqual({ ok: true, paid: false, message: MANUAL_PAYMENT_NOT_PAID_MESSAGE });
  });

  it("returns paid when the application fee charge is paid", async () => {
    const charge = makeCharge({
      id: "hc-app-fee",
      kind: "application_fee",
      status: "paid",
      paidAt: "2026-03-01T00:00:00.000Z",
    });
    const db = makeDb([
      {
        id: "hc-app-fee",
        row_data: charge,
        status: "paid",
        manager_user_id: "manager-1",
        kind: "application_fee",
        property_id: "prop-1",
        resident_email: "applicant@example.com",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ]);

    const result = await checkApplicationFeeManualPayment(db, {
      residentEmail: "applicant@example.com",
      propertyId: "prop-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.paid) {
      expect(result.charges[0]?.kind).toBe("application_fee");
      expect(result.charges[0]?.status).toBe("paid");
    } else {
      throw new Error("expected paid application fee");
    }
  });
});

describe("chargeKeyPart", () => {
  it("slugifies normal input the same as before", () => {
    expect(chargeKeyPart("Resident@Example.com")).toBe("resident_example_com");
    expect(chargeKeyPart("  prop-1  ")).toBe("prop_1");
    expect(chargeKeyPart("!!!")).toBe("unknown");
  });

  it("strips leading/trailing separators without polynomial backtracking", () => {
    expect(chargeKeyPart("___abc___")).toBe("abc");
    const adversarial = "_".repeat(200_000);
    const start = performance.now();
    expect(chargeKeyPart(adversarial)).toBe("unknown");
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

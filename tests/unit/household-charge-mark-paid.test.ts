import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";

// The re-gating logic under test is independent of the ledger write; stub the
// ledger sync so the test stays a focused unit of the webhook mark-paid path.
vi.mock("@/lib/reports/ledger-sync", () => ({
  syncLedgerPaymentEntry: vi.fn().mockResolvedValue(undefined),
}));

import { markHouseholdChargePaidFromStripeSession } from "@/lib/stripe-household-charge";

function charge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "hc_1",
    createdAt: "2024-01-01T00:00:00.000Z",
    residentEmail: "resident@example.com",
    residentName: "Pat Resident",
    residentUserId: null,
    propertyId: "prop_1",
    propertyLabel: "12 Main St",
    managerUserId: "mgr_a",
    kind: "rent",
    title: "Monthly rent",
    amountLabel: "$1,500.00",
    balanceLabel: "$1,500.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    dueDateLabel: "Jan 1, 2024",
    ...overrides,
  };
}

type Row = { id: string; row_data: HouseholdCharge; status: string };

function makeDb(charges: HouseholdCharge[]) {
  const rows = new Map<string, Row>(
    charges.map((c) => [c.id, { id: c.id, row_data: c, status: c.status }]),
  );
  const upserts: Record<string, unknown>[] = [];
  const db = {
    from() {
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              return {
                maybeSingle: async () => ({ data: rows.get(val) ?? null, error: null }),
              };
            },
          };
        },
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          const existing = rows.get(row.id as string);
          if (existing) existing.status = row.status as string;
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, upserts };
}

function session(metadata: Record<string, string>): Stripe.Checkout.Session {
  return {
    id: "cs_test_paid",
    payment_status: "paid",
    metadata,
  } as unknown as Stripe.Checkout.Session;
}

describe("markHouseholdChargePaidFromStripeSession re-gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks every charge in a bulk session even when stored resident email drifted from the session email", async () => {
    // Regression for the code-review bug: the webhook used to gate on resident
    // email, so a charge whose stored email no longer matched the single
    // customer_email on a bulk session was silently left unpaid. It now gates on
    // the trusted manager_user_id, so the drifted charge is still marked paid.
    const charges = [
      charge({ id: "hc_match", residentEmail: "resident@example.com" }),
      charge({ id: "hc_drifted", residentEmail: "old-address@example.com" }),
    ];
    const { db, upserts } = makeDb(charges);

    const result = await markHouseholdChargePaidFromStripeSession(
      db,
      session({
        purpose: "household_charge",
        charge_ids: "hc_match,hc_drifted",
        manager_user_id: "mgr_a",
        resident_email: "resident@example.com",
      }),
    );

    expect(result.ok).toBe(true);
    const paidIds = upserts.filter((u) => u.status === "paid").map((u) => u.id);
    expect(paidIds.sort()).toEqual(["hc_drifted", "hc_match"]);
  });

  it("skips a charge that belongs to a different manager than the session paid out to", async () => {
    const charges = [
      charge({ id: "hc_mine", managerUserId: "mgr_a" }),
      charge({ id: "hc_other", managerUserId: "mgr_b" }),
    ];
    const { db, upserts } = makeDb(charges);

    const result = await markHouseholdChargePaidFromStripeSession(
      db,
      session({
        purpose: "household_charge",
        charge_ids: "hc_mine,hc_other",
        manager_user_id: "mgr_a",
      }),
    );

    expect(result.ok).toBe(true);
    const paidIds = upserts.filter((u) => u.status === "paid").map((u) => u.id);
    expect(paidIds).toEqual(["hc_mine"]);
    expect(paidIds).not.toContain("hc_other");
  });
});

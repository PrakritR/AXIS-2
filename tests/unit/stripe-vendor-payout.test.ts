import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({
  retrieveManagerConnectAccountOrNull: vi.fn(),
  connectAccountTransfersActive: vi.fn(),
}));

import { getStripe } from "@/lib/stripe";
import { connectAccountTransfersActive, retrieveManagerConnectAccountOrNull } from "@/lib/stripe-connect";
import { payoutVendorForWorkOrder } from "@/lib/stripe-vendor-payout";

type PayoutRow = {
  work_order_id: string;
  status: string;
  stripe_transfer_id?: string | null;
  failure_reason?: string | null;
};

function mockDb(opts?: { existingPayout?: PayoutRow; insertError?: { code: string } }) {
  const inserts: PayoutRow[] = [];
  const client = {
    from(table: string) {
      if (table === "vendor_payouts") {
        const filters: Record<string, string> = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: string) => {
            filters[col] = val;
            return chain;
          },
          maybeSingle: async () => ({
            data:
              opts?.existingPayout && filters.work_order_id === opts.existingPayout.work_order_id
                ? { id: "existing" }
                : null,
            error: null,
          }),
          insert: async (row: PayoutRow) => {
            inserts.push(row);
            if (opts?.insertError) return { error: opts.insertError };
            return { error: null };
          },
        };
        return chain;
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_connect_account_id: "acct_vendor" } }),
            }),
          }),
        };
      }
      return {};
    },
  };
  return { client, inserts };
}

describe("payoutVendorForWorkOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectAccountTransfersActive).mockReturnValue(true);
    vi.mocked(retrieveManagerConnectAccountOrNull).mockResolvedValue({ id: "acct_vendor" } as never);
    vi.mocked(getStripe).mockReturnValue({
      transfers: { create: vi.fn().mockResolvedValue({ id: "tr_test" }) },
    } as never);
  });

  it("skips when a payout row already exists for the work order", async () => {
    const { client, inserts } = mockDb({ existingPayout: { work_order_id: "WO-1", status: "paid" } });
    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-1",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 5000,
    });
    expect(inserts).toHaveLength(0);
    expect(getStripe().transfers.create).not.toHaveBeenCalled();
  });

  it("passes a stable Stripe idempotency key per work order", async () => {
    const { client } = mockDb();
    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-42",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 5000,
    });
    expect(getStripe().transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, destination: "acct_vendor" }),
      { idempotencyKey: "vendor_payout_WO-42" },
    );
  });

  it("treats a duplicate payout insert as already handled", async () => {
    const { client, inserts } = mockDb({ insertError: { code: "23505" } });
    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-race",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 5000,
    });
    expect(inserts).toHaveLength(1);
  });
});

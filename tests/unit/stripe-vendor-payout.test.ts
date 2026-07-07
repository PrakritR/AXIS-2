import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({
  retrieveManagerConnectAccountOrNull: vi.fn(),
  connectAccountTransfersActive: vi.fn(),
}));

import { getStripe } from "@/lib/stripe";
import { retrieveManagerConnectAccountOrNull, connectAccountTransfersActive } from "@/lib/stripe-connect";
import { payoutVendorForWorkOrder } from "@/lib/stripe-vendor-payout";

type Row = Record<string, unknown>;

/** Minimal fake Supabase client covering vendor_payouts / work_order_bids / profiles reads+writes. */
function fakeDb(opts: { acceptedBidAmountCents?: number | null; connectAccountId?: string | null; existingPayout?: Row | null }) {
  const inserted: Row[] = [];
  const updated: Row[] = [];
  let insertShouldConflict = false;
  const setConflict = (v: boolean) => (insertShouldConflict = v);

  const client = {
    from(table: string) {
      if (table === "work_order_bids") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.acceptedBidAmountCents != null ? { amount_cents: opts.acceptedBidAmountCents } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_connect_account_id: opts.connectAccountId ?? null }, error: null }),
            }),
          }),
        };
      }
      if (table === "vendor_payouts") {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                if (insertShouldConflict) {
                  return { data: null, error: { message: "duplicate key value violates unique constraint" } };
                }
                inserted.push(row);
                return { data: { id: "payout-1" }, error: null };
              },
            }),
          }),
          update: (row: Row) => ({
            eq: async () => {
              updated.push(row);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, inserted, updated, setConflict };
}

describe("payoutVendorForWorkOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("anchors the transferred amount to the accepted bid, ignoring a forged caller amount", async () => {
    const { client, inserted, updated } = fakeDb({ acceptedBidAmountCents: 20000, connectAccountId: "acct_1" });
    vi.mocked(getStripe).mockReturnValue({
      transfers: { create: vi.fn().mockResolvedValue({ id: "tr_1" }) },
    } as never);
    vi.mocked(retrieveManagerConnectAccountOrNull).mockResolvedValue({ id: "acct_1" } as never);
    vi.mocked(connectAccountTransfersActive).mockReturnValue(true);

    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-1",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 999_999, // forged/mismatched client-supplied amount — must be ignored
    });

    expect(inserted[0]!.amount_cents).toBe(20000);
    const stripe = vi.mocked(getStripe).mock.results[0]!.value;
    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20000 }),
      expect.objectContaining({ idempotencyKey: "vendor-payout:WO-1" }),
    );
    expect(updated[0]).toMatchObject({ status: "paid", stripe_transfer_id: "tr_1" });
  });

  it("falls back to the caller-supplied amount when no bid was accepted (manual assignment)", async () => {
    const { client, inserted } = fakeDb({ acceptedBidAmountCents: null, connectAccountId: "acct_1" });
    vi.mocked(getStripe).mockReturnValue({
      transfers: { create: vi.fn().mockResolvedValue({ id: "tr_2" }) },
    } as never);
    vi.mocked(retrieveManagerConnectAccountOrNull).mockResolvedValue({ id: "acct_1" } as never);
    vi.mocked(connectAccountTransfersActive).mockReturnValue(true);

    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-2",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 15000,
    });

    expect(inserted[0]!.amount_cents).toBe(15000);
  });

  it("never calls Stripe when the payout claim insert loses the race (duplicate/concurrent request)", async () => {
    const { client, setConflict } = fakeDb({ acceptedBidAmountCents: 5000, connectAccountId: "acct_1" });
    setConflict(true);
    const transferCreate = vi.fn().mockResolvedValue({ id: "tr_3" });
    vi.mocked(getStripe).mockReturnValue({ transfers: { create: transferCreate } } as never);

    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-3",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 5000,
    });

    expect(transferCreate).not.toHaveBeenCalled();
  });

  it("records a failed payout without transferring when the vendor has no Connect account", async () => {
    const { client, inserted, updated } = fakeDb({ acceptedBidAmountCents: 5000, connectAccountId: null });
    const transferCreate = vi.fn();
    vi.mocked(getStripe).mockReturnValue({ transfers: { create: transferCreate } } as never);

    await payoutVendorForWorkOrder(client as never, {
      workOrderId: "WO-4",
      managerUserId: "mgr-1",
      vendorUserId: "vendor-1",
      amountCents: 5000,
    });

    expect(transferCreate).not.toHaveBeenCalled();
    expect(inserted[0]!.status).toBe("pending");
    expect(updated[0]).toMatchObject({ status: "failed" });
  });
});

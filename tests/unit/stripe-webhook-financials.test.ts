import { describe, expect, it, vi } from "vitest";
import { handleStripeTransferReversed } from "@/lib/stripe-webhook-financials";

describe("handleStripeTransferReversed", () => {
  it("clears stripe_transfer_id on matching ledger payment rows", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null });
    const db = {
      from: vi.fn().mockReturnValue({ update }),
    };

    await handleStripeTransferReversed(db as never, {
      id: "tr_reversed_1",
      object: "transfer",
      amount: 1000,
      source_transaction: "ch_test_1",
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_transfer_id: null,
      }),
    );
    expect(update.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

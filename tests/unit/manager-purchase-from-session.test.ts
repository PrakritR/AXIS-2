import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import {
  checkoutSessionIndicatesPaidPurchase,
  recordPaidManagerCheckoutSession,
} from "@/lib/manager-purchase-from-session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { mockCheckoutSession } from "../mocks/stripe/events";

describe("manager-purchase-from-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects paid checkout sessions", () => {
    expect(checkoutSessionIndicatesPaidPurchase(mockCheckoutSession())).toBe(true);
    expect(checkoutSessionIndicatesPaidPurchase(mockCheckoutSession({ payment_status: "unpaid", status: "open" }))).toBe(
      false,
    );
  });

  it("accepts completed subscription with unpaid payment status", () => {
    expect(
      checkoutSessionIndicatesPaidPurchase(
        mockCheckoutSession({ payment_status: "unpaid", status: "complete", mode: "subscription" }),
      ),
    ).toBe(true);
  });

  it("does not overwrite finalized free selection from a stale checkout", async () => {
    const updateSelect = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const updateBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
      select: updateSelect,
    };
    updateBuilder.eq.mockReturnValue(updateBuilder);
    updateBuilder.is.mockReturnValue(updateBuilder);

    const selectBuilder = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "purchase-1",
          stripe_checkout_session_id: "axis_intent_current",
          paid_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      }),
    };
    selectBuilder.eq.mockReturnValue(selectBuilder);
    const upsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => updateBuilder),
        select: vi.fn(() => selectBuilder),
        upsert,
      })),
    } as never);

    await recordPaidManagerCheckoutSession(
      mockCheckoutSession({
        id: "cs_test_old",
        customer_email: "manager@example.com",
        metadata: {
          tier: "pro",
          billing: "monthly",
          manager_id: "MGR-TEST",
          userId: "user-1",
        },
      }),
    );

    expect(updateBuilder.is).toHaveBeenCalledWith("paid_at", null);
    expect(selectBuilder.maybeSingle).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

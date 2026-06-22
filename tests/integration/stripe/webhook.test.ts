import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCheckoutSessionCompletedEvent } from "../../mocks/stripe/events";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "stripe-signature": "sig_test" })),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/manager-purchase-from-session", () => ({
  recordPaidManagerCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/manager-stripe-subscription-sync", () => ({
  applyScheduledDowngradeAfterInvoicePaid: vi.fn(),
  reconcileManagerPurchaseByStripeSubscriptionId: vi.fn(),
  reconcileManagerPurchaseWithStripe: vi.fn(),
}));

vi.mock("@/lib/stripe-application-fee", () => ({
  markApplicationFeePaidFromStripeSession: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/stripe-household-charge", () => ({
  markHouseholdChargePaidFromStripeSession: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getStripe } from "@/lib/stripe";
import { recordPaidManagerCheckoutSession } from "@/lib/manager-purchase-from-session";
import { POST as webhook } from "@/app/api/stripe/webhook/route";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("returns 400 without stripe signature", async () => {
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockResolvedValueOnce(new Headers());
    const req = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" });
    const res = await webhook(req);
    expect(res.status).toBe(400);
  });

  it("processes checkout.session.completed", async () => {
    const session = mockCheckoutSessionCompletedEvent(
      { id: "cs_test", metadata: { tier: "pro" } } as never,
    ).data.object;
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: "checkout.session.completed",
          data: { object: session },
        }),
      },
    } as never);

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "stripe-signature": "sig_test" },
    });
    const res = await webhook(req);
    expect(res.status).toBe(200);
    expect(recordPaidManagerCheckoutSession).toHaveBeenCalled();
  });

  it("returns 400 on invalid signature", async () => {
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw new Error("Invalid signature");
        }),
      },
    } as never);

    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "bad" },
    });
    const res = await webhook(req);
    expect(res.status).toBe(400);
  });
});

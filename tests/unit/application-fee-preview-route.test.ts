import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Route-level coverage for POST /api/public/application-fee-preview — the
 * itemization the applicant sees BEFORE paying, so it must correctly reflect
 * the manager's per-listing `holdingDepositTiming` choice (combined charge
 * vs fee-only) and a fee already waived by a redeemed manager code.
 */

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({}) as unknown as SupabaseClient,
}));

vi.mock("@/lib/manager-access-server", () => ({
  getManagerPurchaseSku: vi.fn().mockResolvedValue({
    tier: "free",
    billing: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    appleOriginalTransactionId: null,
  }),
}));

vi.mock("@/lib/manager-manual-payment-settings", () => ({
  loadManagerManualPaymentSettings: vi.fn().mockResolvedValue({
    zellePaymentsEnabled: false,
    zelleContact: "",
    venmoPaymentsEnabled: false,
    venmoContact: "",
    receiptAutoMarkEnabled: true,
    serviceFeePayer: "resident",
  }),
}));

vi.mock("@/lib/application-fee-waiver", () => ({
  previewApplicationFeeWaiverCode: vi.fn(),
}));

vi.mock("@/lib/application-fee-checkout.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application-fee-checkout.server")>();
  return {
    ...actual,
    resolveApplicationFeeProperty: vi.fn(),
  };
});

import { resolveApplicationFeeProperty } from "@/lib/application-fee-checkout.server";
import { previewApplicationFeeWaiverCode } from "@/lib/application-fee-waiver";

function post(body: unknown) {
  return new Request("http://localhost/api/public/application-fee-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resolvedListing(overrides: Partial<{ applicationFeeCents: number; holdingDepositCents: number; holdingDepositTiming: "at_application" | "after_approval" }> = {}) {
  return {
    ok: true as const,
    value: {
      managerUserId: "mgr_A",
      listing: null,
      applicationFeeCents: 5000,
      holdingDepositCents: 0,
      holdingDepositTiming: "after_approval" as const,
      ...overrides,
    },
  };
}

describe("POST /api/public/application-fee-preview", () => {
  beforeEach(() => {
    vi.mocked(resolveApplicationFeeProperty).mockReset();
    vi.mocked(previewApplicationFeeWaiverCode).mockReset();
  });

  it("previews a fee-only listing (after_approval — the default) with a $0 deposit", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(resolvedListing());
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    // "manual" channel never carries a Stripe service fee, isolating the
    // fee/deposit itemization math this test is actually about.
    const res = await POST(post({ propertyId: "prop_1", managerUserId: "mgr_A", channel: "manual" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(5000);
    expect(json.holdingDepositCents).toBe(0);
    expect(json.totalCents).toBe(5000);
  });

  it("combines the fee + deposit into one total when the listing opted into at_application", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(
      resolvedListing({ holdingDepositCents: 10000, holdingDepositTiming: "at_application" }),
    );
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(post({ propertyId: "prop_1", managerUserId: "mgr_A", channel: "manual" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(5000);
    expect(json.holdingDepositCents).toBe(10000);
    expect(json.totalCents).toBe(15000);
  });

  it("zeroes the fee but keeps the deposit when feeWaived is already true", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(
      resolvedListing({ holdingDepositCents: 10000, holdingDepositTiming: "at_application" }),
    );
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(post({ propertyId: "prop_1", managerUserId: "mgr_A", feeWaived: true, channel: "manual" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(0);
    expect(json.applicationFeeWaivedByCode).toBe(true);
    expect(json.holdingDepositCents).toBe(10000);
    expect(json.totalCents).toBe(10000);
  });

  it("zeroes the fee via a freshly-validated waiver code, without re-consuming feeWaived", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(
      resolvedListing({ holdingDepositCents: 10000, holdingDepositTiming: "at_application" }),
    );
    vi.mocked(previewApplicationFeeWaiverCode).mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(
      post({ propertyId: "prop_1", managerUserId: "mgr_A", waiverCode: "MOVEIN50", channel: "manual" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(0);
    expect(json.applicationFeeWaivedByCode).toBe(true);
    expect(json.holdingDepositCents).toBe(10000);
    expect(json.waiver).toEqual({ valid: true, error: undefined });
  });

  it("requires propertyId and managerUserId", async () => {
    const { POST } = await import("@/app/api/public/application-fee-preview/route");
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(resolveApplicationFeeProperty).not.toHaveBeenCalled();
  });
});

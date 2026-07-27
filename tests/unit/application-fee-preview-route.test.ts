import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Route-level coverage for POST /api/public/application-fee-preview — the
 * itemization the applicant sees BEFORE paying. The application collects the
 * application fee ONLY (the holding deposit is billed under Payments after
 * approval, never during the application), so this route returns the fee, any
 * plan-based service fee the applicant bears, and the total — no deposit line.
 * It can also preview a waiver code without redeeming it.
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

function resolvedListing(overrides: Partial<{ applicationFeeCents: number }> = {}) {
  return {
    ok: true as const,
    value: {
      managerUserId: "mgr_A",
      listing: null,
      applicationFeeCents: 5000,
      ...overrides,
    },
  };
}

describe("POST /api/public/application-fee-preview", () => {
  beforeEach(() => {
    vi.mocked(resolveApplicationFeeProperty).mockReset();
    vi.mocked(previewApplicationFeeWaiverCode).mockReset();
  });

  it("previews the application fee only — no deposit line", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(resolvedListing());
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    // "manual" channel never carries a Stripe service fee, isolating the fee math.
    const res = await POST(post({ propertyId: "prop_1", managerUserId: "mgr_A", channel: "manual" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(5000);
    expect(json.serviceFeeCents).toBe(0);
    expect(json.totalCents).toBe(5000);
    // The deposit is never part of the application preview.
    expect(json.holdingDepositCents).toBeUndefined();
  });

  it("returns a normal zero itemization for an explicit $0 (free) application fee — no dead-end", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(resolvedListing({ applicationFeeCents: 0 }));
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(post({ propertyId: "prop_1", managerUserId: "mgr_A", channel: "manual" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.applicationFeeCents).toBe(0);
    expect(json.totalCents).toBe(0);
  });

  it("previews a valid waiver code without redeeming it", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(resolvedListing());
    vi.mocked(previewApplicationFeeWaiverCode).mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(
      post({ propertyId: "prop_1", managerUserId: "mgr_A", waiverCode: "MOVEIN50", channel: "manual" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.waiver).toEqual({ valid: true, error: undefined });
  });

  it("reports an invalid waiver code in the preview", async () => {
    vi.mocked(resolveApplicationFeeProperty).mockResolvedValue(resolvedListing());
    vi.mocked(previewApplicationFeeWaiverCode).mockResolvedValue({
      ok: false,
      reason: "NOT_FOUND",
      error: "That code isn't valid.",
    });
    const { POST } = await import("@/app/api/public/application-fee-preview/route");

    const res = await POST(
      post({ propertyId: "prop_1", managerUserId: "mgr_A", waiverCode: "NOPE", channel: "manual" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.waiver).toEqual({ valid: false, error: "That code isn't valid." });
  });

  it("requires propertyId and managerUserId", async () => {
    const { POST } = await import("@/app/api/public/application-fee-preview/route");
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(resolveApplicationFeeProperty).not.toHaveBeenCalled();
  });
});

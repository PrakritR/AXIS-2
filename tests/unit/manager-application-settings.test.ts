import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_MANAGER_APPLICATION_SETTINGS,
  LEGACY_DEFAULT_APPLICATION_FEE_CENTS,
  effectiveApplicationFeeCents,
  normalizeManagerApplicationSettings,
} from "@/lib/manager-application-settings";

vi.mock("@/lib/stripe-axis-ach-checkout", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe-axis-ach-checkout")>(
    "@/lib/stripe-axis-ach-checkout",
  );
  return { ...actual, createAxisAchCheckoutSession: vi.fn() };
});

import { resolveApplicationFeeProperty } from "@/lib/application-fee-checkout.server";

describe("normalizeManagerApplicationSettings", () => {
  it("keeps a valid cents value", () => {
    expect(normalizeManagerApplicationSettings({ applicationFeeCents: 7500 })).toEqual({ applicationFeeCents: 7500 });
  });
  it("treats a missing/non-number value as unconfigured (null)", () => {
    expect(normalizeManagerApplicationSettings({})).toEqual(DEFAULT_MANAGER_APPLICATION_SETTINGS);
    expect(normalizeManagerApplicationSettings({ applicationFeeCents: "50" })).toEqual({ applicationFeeCents: null });
    expect(normalizeManagerApplicationSettings(null)).toEqual({ applicationFeeCents: null });
  });
  it("preserves an explicit 0 (free applications) distinct from null", () => {
    expect(normalizeManagerApplicationSettings({ applicationFeeCents: 0 })).toEqual({ applicationFeeCents: 0 });
  });
  it("clamps out-of-range values", () => {
    expect(normalizeManagerApplicationSettings({ applicationFeeCents: -5 })).toEqual({ applicationFeeCents: 0 });
    expect(normalizeManagerApplicationSettings({ applicationFeeCents: 5_000_000 })).toEqual({
      applicationFeeCents: 100_000,
    });
  });
});

describe("effectiveApplicationFeeCents — source-of-truth priority", () => {
  it("a configured manager-level fee wins over the listing's stored fee", () => {
    expect(effectiveApplicationFeeCents({ managerFeeCents: 7500, listingFeeCents: 3000 })).toBe(7500);
  });
  it("a configured 0 manager-level fee means free (wins over listing)", () => {
    expect(effectiveApplicationFeeCents({ managerFeeCents: 0, listingFeeCents: 3000 })).toBe(0);
  });
  it("falls back to the listing's grandfathered fee when manager-level is unset", () => {
    expect(effectiveApplicationFeeCents({ managerFeeCents: null, listingFeeCents: 3000 })).toBe(3000);
  });
  it("falls back to the legacy default when neither is set", () => {
    expect(effectiveApplicationFeeCents({ managerFeeCents: null, listingFeeCents: 0 })).toBe(
      LEGACY_DEFAULT_APPLICATION_FEE_CENTS,
    );
  });
});

function makeDb(opts: { listingFee: string; managerFeeCents: number | null }): SupabaseClient {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => {
      if (table === "manager_property_records") {
        return {
          data: {
            manager_user_id: "mgr_A",
            property_data: {
              listingSubmission: { v: 1, applicationFee: opts.listingFee, axisPaymentsEnabled: true, rooms: [], bathrooms: [] },
            },
          },
          error: null,
        };
      }
      if (table === "manager_automation_settings") {
        return {
          data:
            opts.managerFeeCents === null
              ? { row_data: {} }
              : { row_data: { applicationSettings: { applicationFeeCents: opts.managerFeeCents } } },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

describe("resolveApplicationFeeProperty — manager-level fee is authoritative", () => {
  it("charges the manager-level fee, NOT the listing's stored fee, once configured", async () => {
    const db = makeDb({ listingFee: "$30", managerFeeCents: 7500 });
    const res = await resolveApplicationFeeProperty(db, { propertyId: "prop_1", managerUserId: "mgr_A" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.applicationFeeCents).toBe(7500);
  });

  it("grandfathers the listing's stored fee when the manager has set no account-level fee", async () => {
    const db = makeDb({ listingFee: "$30", managerFeeCents: null });
    const res = await resolveApplicationFeeProperty(db, { propertyId: "prop_1", managerUserId: "mgr_A" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.applicationFeeCents).toBe(3000);
  });

  it("rejects with NO_APPLICATION_FEE when the manager has set the fee to 0 (free)", async () => {
    const db = makeDb({ listingFee: "$30", managerFeeCents: 0 });
    const res = await resolveApplicationFeeProperty(db, { propertyId: "prop_1", managerUserId: "mgr_A" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_APPLICATION_FEE");
  });
});

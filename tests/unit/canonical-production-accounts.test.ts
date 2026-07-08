import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertAllowlistedDemoProjectUrl,
  assertProductionProjectUrl,
  assertProductionSeedGate,
  isProductionSupabaseProjectUrl,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PROD_DEMO_MANAGER_EMAIL,
} from "../../tests/helpers/canonical-production-accounts.mjs";

describe("canonical-production-accounts", () => {
  const originalEnv = { ...process.env };
  const DEV_REF = "emstjswhotsnyksqhqyf";

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ALLOW_PRODUCTION_SEED;
    delete process.env.AXIS_PRODUCTION_SEED_KEY;
    delete process.env.AXIS_PROD_SUPABASE_REF;
    delete process.env.DEMO_SUPABASE_PROJECT_REF;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("exposes @axis.local demo manager email", () => {
    expect(PROD_DEMO_MANAGER_EMAIL).toBe("alex.morgan@axis.local");
  });

  it("assertProductionProjectUrl accepts the production project", () => {
    expect(() =>
      assertProductionProjectUrl(`https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
    ).not.toThrow();
  });

  it("assertProductionProjectUrl rejects the dev/test project", () => {
    expect(() => assertProductionProjectUrl(`https://${DEV_REF}.supabase.co`)).toThrow(/production/i);
  });

  it("isProductionSupabaseProjectUrl detects the production project", () => {
    expect(isProductionSupabaseProjectUrl(`https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`)).toBe(true);
    expect(isProductionSupabaseProjectUrl(`https://${DEV_REF}.supabase.co`)).toBe(false);
  });

  it("assertProductionSeedGate requires ALLOW_PRODUCTION_SEED=1", () => {
    process.env.AXIS_PRODUCTION_SEED_KEY = "secret";
    expect(() => assertProductionSeedGate()).toThrow(/ALLOW_PRODUCTION_SEED/i);
  });

  it("assertProductionSeedGate requires AXIS_PRODUCTION_SEED_KEY", () => {
    process.env.ALLOW_PRODUCTION_SEED = "1";
    expect(() => assertProductionSeedGate()).toThrow(/AXIS_PRODUCTION_SEED_KEY/i);
  });

  it("assertProductionSeedGate passes when both gates are set", () => {
    process.env.ALLOW_PRODUCTION_SEED = "1";
    process.env.AXIS_PRODUCTION_SEED_KEY = "secret";
    expect(() => assertProductionSeedGate()).not.toThrow();
  });

  it("assertAllowlistedDemoProjectUrl refuses when DEMO_SUPABASE_PROJECT_REF is unset", () => {
    expect(() => assertAllowlistedDemoProjectUrl(`https://some-random-project.supabase.co`)).toThrow(
      /allowlisted demo/i,
    );
  });

  it("assertAllowlistedDemoProjectUrl refuses a URL that doesn't match the configured ref", () => {
    process.env.DEMO_SUPABASE_PROJECT_REF = "demo-ref-abc";
    expect(() => assertAllowlistedDemoProjectUrl(`https://some-other-project.supabase.co`)).toThrow(
      /allowlisted demo/i,
    );
  });

  it("assertAllowlistedDemoProjectUrl refuses production even if it were misconfigured as the allowed ref", () => {
    process.env.DEMO_SUPABASE_PROJECT_REF = "demo-ref-abc";
    expect(() =>
      assertAllowlistedDemoProjectUrl(`https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
    ).toThrow(/allowlisted demo/i);
  });

  it("assertAllowlistedDemoProjectUrl passes when the URL exactly matches the configured ref", () => {
    process.env.DEMO_SUPABASE_PROJECT_REF = "demo-ref-abc";
    expect(() => assertAllowlistedDemoProjectUrl(`https://demo-ref-abc.supabase.co`)).not.toThrow();
  });
});

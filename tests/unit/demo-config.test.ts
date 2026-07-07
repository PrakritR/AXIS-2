import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDemoSupabasePublicConfig,
  isDemoSupabaseConfigured,
  usesDemoLocalStorageSeed,
} from "@/lib/supabase/demo-config";

describe("demo-config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reports unconfigured when demo supabase env vars are missing", () => {
    expect(getDemoSupabasePublicConfig()).toBeNull();
    expect(isDemoSupabaseConfigured()).toBe(false);
    expect(usesDemoLocalStorageSeed()).toBe(true);
  });

  it("reads demo supabase public config when both vars are set", () => {
    process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL = "https://demo-ref.supabase.co";
    process.env.NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY = "demo-anon-key";
    expect(getDemoSupabasePublicConfig()).toEqual({
      url: "https://demo-ref.supabase.co",
      anonKey: "demo-anon-key",
    });
    expect(isDemoSupabaseConfigured()).toBe(true);
    expect(usesDemoLocalStorageSeed()).toBe(false);
  });
});

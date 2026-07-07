import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProductionPublicSite, isPublicDemoSurfaceEnabled } from "@/lib/public-demo-access";

describe("public-demo-access", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("treats Vercel production as a production public site", () => {
    process.env.VERCEL_ENV = "production";
    expect(isProductionPublicSite()).toBe(true);
    expect(isPublicDemoSurfaceEnabled()).toBe(false);
  });

  it("keeps demo surfaces on preview and local builds", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isProductionPublicSite()).toBe(false);
    expect(isPublicDemoSurfaceEnabled()).toBe(true);

    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED = "true";
    expect(isProductionPublicSite()).toBe(false);
  });

  it("honors the baked public demo env flag", () => {
    process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED = "false";
    expect(isProductionPublicSite()).toBe(true);
    expect(isPublicDemoSurfaceEnabled()).toBe(false);
  });
});

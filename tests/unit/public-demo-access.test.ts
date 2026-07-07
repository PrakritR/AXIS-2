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
    expect(isPublicDemoSurfaceEnabled()).toBe(true);
  });

  it("keeps demo surfaces on preview and local builds", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isProductionPublicSite()).toBe(false);
    expect(isPublicDemoSurfaceEnabled()).toBe(true);

    delete process.env.VERCEL_ENV;
    expect(isPublicDemoSurfaceEnabled()).toBe(true);
  });

  it("honors explicit opt-out via NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED=false", () => {
    process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED = "false";
    expect(isPublicDemoSurfaceEnabled()).toBe(false);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getAdminRegisterKey, getPaymentWaiverCode } from "@/lib/server-env";
import { isValidAdminRegisterKey } from "@/lib/auth/admin-register-key";

describe("server-env and admin-register-key", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test", VERCEL_ENV: undefined };
    delete process.env.AXIS_ADMIN_REGISTER_KEY;
    delete process.env.AXIS_PAYMENT_WAIVER_CODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses dev defaults for admin and waiver keys", () => {
    expect(getAdminRegisterKey()).toBe("prakrit-admin-register");
    expect(getPaymentWaiverCode()).toBe("FREE100");
    expect(isValidAdminRegisterKey("prakrit-admin-register")).toBe(true);
    expect(isValidAdminRegisterKey("wrong")).toBe(false);
  });

  it("respects explicit env overrides", () => {
    process.env.AXIS_PAYMENT_WAIVER_CODE = "CUSTOM100";
    expect(getPaymentWaiverCode()).toBe("CUSTOM100");
  });
});

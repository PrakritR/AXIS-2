import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIET_HOURS,
  effectiveRegistrationState,
  isProvisioningEnabled,
  isWithinQuietHours,
  managerCanSendFromOwnNumber,
  quietHoursBlocks,
  type ManagerSmsNumberRecord,
} from "@/lib/sms/number-registration-policy";

const base: ManagerSmsNumberRecord = {
  managerUserId: "mgr-1",
  phoneNumber: "+12065550100",
  phoneNumberSid: "PN1",
  messagingServiceSid: null,
  provider: "twilio",
  areaCode: "206",
  provisionState: "active",
  registrationState: "pending",
  registrationRef: null,
  attempts: 1,
  lastError: null,
  requestedAt: null,
  provisionedAt: null,
  releasedAt: null,
  registrationUpdatedAt: null,
  updatedAt: null,
};

describe("effectiveRegistrationState", () => {
  it("uses the per-manager state when there is no shared ref (reseller model)", () => {
    expect(effectiveRegistrationState({ registrationState: "approved", registrationRef: null }, {})).toBe("approved");
    expect(effectiveRegistrationState({ registrationState: "rejected", registrationRef: null }, {})).toBe("rejected");
  });

  it("resolves a shared-ref row from env so one flip approves everyone", () => {
    const row = { registrationState: "pending" as const, registrationRef: "shared" };
    expect(effectiveRegistrationState(row, { SMS_SHARED_REGISTRATION_STATE: "approved" })).toBe("approved");
    expect(effectiveRegistrationState(row, { SMS_SHARED_REGISTRATION_STATE: "pending" })).toBe("pending");
  });

  it("a per-manager row NOT pointing at the shared ref ignores the shared env", () => {
    const row = { registrationState: "pending" as const, registrationRef: "own-brand-123" };
    expect(effectiveRegistrationState(row, { SMS_SHARED_REGISTRATION_STATE: "approved" })).toBe("pending");
  });
});

describe("managerCanSendFromOwnNumber", () => {
  it("requires an active number AND approved registration", () => {
    expect(managerCanSendFromOwnNumber({ ...base, provisionState: "active", registrationState: "approved" }, {})).toBe(true);
  });
  it("blocks when the number exists but registration is still pending", () => {
    expect(managerCanSendFromOwnNumber({ ...base, provisionState: "active", registrationState: "pending" }, {})).toBe(false);
  });
  it("blocks when there is no active number yet", () => {
    expect(managerCanSendFromOwnNumber({ ...base, provisionState: "pending_registration", registrationState: "approved" }, {})).toBe(false);
    expect(managerCanSendFromOwnNumber({ ...base, phoneNumber: null, registrationState: "approved" }, {})).toBe(false);
  });
  it("respects a shared-registration flip", () => {
    const row = { ...base, provisionState: "active" as const, registrationRef: "shared" };
    expect(managerCanSendFromOwnNumber(row, { SMS_SHARED_REGISTRATION_STATE: "approved" })).toBe(true);
    expect(managerCanSendFromOwnNumber(row, { SMS_SHARED_REGISTRATION_STATE: "pending" })).toBe(false);
  });
});

describe("isProvisioningEnabled (money guard)", () => {
  it("is off unless explicitly set to 1", () => {
    expect(isProvisioningEnabled({})).toBe(false);
    expect(isProvisioningEnabled({ SMS_PROVISIONING_ENABLED: "0" })).toBe(false);
    expect(isProvisioningEnabled({ SMS_PROVISIONING_ENABLED: "1" })).toBe(true);
  });
});

describe("quiet hours", () => {
  const cfg = { ...DEFAULT_QUIET_HOURS, tz: "UTC", startHour: 21, endHour: 8 };
  it("wraps past midnight", () => {
    expect(isWithinQuietHours(new Date("2026-07-25T22:00:00Z"), cfg)).toBe(true); // 10pm
    expect(isWithinQuietHours(new Date("2026-07-25T03:00:00Z"), cfg)).toBe(true); // 3am
    expect(isWithinQuietHours(new Date("2026-07-25T12:00:00Z"), cfg)).toBe(false); // noon
    expect(isWithinQuietHours(new Date("2026-07-25T08:00:00Z"), cfg)).toBe(false); // exactly 8am (exclusive)
  });
  it("only blocks automated traffic — control and transactional pass", () => {
    const night = new Date("2026-07-25T23:00:00Z");
    expect(quietHoursBlocks("automated", night, cfg)).toBe(true);
    expect(quietHoursBlocks("transactional", night, cfg)).toBe(false);
    expect(quietHoursBlocks("control", night, cfg)).toBe(false);
  });
});

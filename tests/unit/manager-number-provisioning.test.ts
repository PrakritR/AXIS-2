import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "./support/memory-supabase";

const { purchaseMock, releaseMock } = vi.hoisted(() => ({
  purchaseMock: vi.fn(),
  releaseMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/twilio-provisioning", () => ({
  purchaseManagerTwilioNumber: purchaseMock,
  releaseTwilioNumber: releaseMock,
}));

import {
  getManagerNumberRecord,
  provisionManagerNumber,
  resolveActiveManagerSendNumber,
  setManagerRegistrationState,
} from "@/lib/sms/manager-number-provisioning.server";

const MGR = "mgr-1";

function seed() {
  return createMemoryDb({
    profiles: [{ id: MGR, sms_from_number: null }],
    manager_sms_numbers: [],
  });
}

const origEnv = { ...process.env };
beforeEach(() => {
  purchaseMock.mockReset();
  releaseMock.mockReset();
  delete process.env.SMS_PROVISIONING_ENABLED;
  delete process.env.SMS_SHARED_REGISTRATION_STATE;
});
afterEach(() => {
  process.env = { ...origEnv };
});

describe("provisionManagerNumber — money guard parks pending", () => {
  it("parks in pending_registration and never buys when provisioning is disabled", async () => {
    const db = seed() as never;
    const res = await provisionManagerNumber(db, MGR);
    expect(res).toMatchObject({ ok: false, state: "pending_registration" });
    expect(purchaseMock).not.toHaveBeenCalled();
    const rec = await getManagerNumberRecord(db, MGR);
    expect(rec?.provisionState).toBe("pending_registration");
  });

  it("is idempotent while parked — re-running keeps one parked record, no purchase", async () => {
    const db = seed() as never;
    await provisionManagerNumber(db, MGR);
    await provisionManagerNumber(db, MGR);
    expect(purchaseMock).not.toHaveBeenCalled();
    expect((db as unknown as { __tables: Record<string, unknown[]> }).__tables.manager_sms_numbers).toHaveLength(1);
  });
});

describe("provisionManagerNumber — buys exactly one number when enabled", () => {
  it("provisions once and is idempotent on re-run (never a second number)", async () => {
    process.env.SMS_PROVISIONING_ENABLED = "1";
    purchaseMock.mockResolvedValue({ ok: true, number: "+12065550123", sid: "PN123", messagingServiceSid: "MG1" });
    const db = seed() as never;

    const first = await provisionManagerNumber(db, MGR);
    expect(first).toMatchObject({ ok: true, number: "+12065550123", alreadyProvisioned: false });
    expect(purchaseMock).toHaveBeenCalledTimes(1);

    const rec = await getManagerNumberRecord(db, MGR);
    expect(rec?.provisionState).toBe("active");
    expect(rec?.phoneNumberSid).toBe("PN123");
    expect(rec?.messagingServiceSid).toBe("MG1");
    const profiles = (db as unknown as { __tables: Record<string, Array<{ sms_from_number: string }>> }).__tables.profiles;
    expect(profiles[0]!.sms_from_number).toBe("+12065550123");

    const second = await provisionManagerNumber(db, MGR);
    expect(second).toMatchObject({ ok: true, alreadyProvisioned: true, number: "+12065550123" });
    expect(purchaseMock).toHaveBeenCalledTimes(1); // still one — no second buy
  });

  it("records a retryable failed state and bumps attempts on provider error", async () => {
    process.env.SMS_PROVISIONING_ENABLED = "1";
    purchaseMock.mockResolvedValue({ ok: false, error: "No SMS-capable numbers available." });
    const db = seed() as never;

    const res = await provisionManagerNumber(db, MGR);
    expect(res).toMatchObject({ ok: false, state: "failed" });
    const rec = await getManagerNumberRecord(db, MGR);
    expect(rec?.provisionState).toBe("failed");
    expect(rec?.attempts).toBe(1);
    expect(rec?.lastError).toContain("No SMS-capable");

    // A retry re-attempts (attempts increments), proving the state is retryable.
    await provisionManagerNumber(db, MGR);
    const rec2 = await getManagerNumberRecord(db, MGR);
    expect(rec2?.attempts).toBe(2);
  });
});

describe("resolveActiveManagerSendNumber — registration gate", () => {
  it("returns the number only once the manager's registration is approved", async () => {
    process.env.SMS_PROVISIONING_ENABLED = "1";
    purchaseMock.mockResolvedValue({ ok: true, number: "+12065550999", sid: "PN9", messagingServiceSid: null });
    const db = seed() as never;
    await provisionManagerNumber(db, MGR);

    // Active number but registration still pending → cannot send yet.
    expect(await resolveActiveManagerSendNumber(db, MGR)).toBeNull();

    await setManagerRegistrationState(db, MGR, "approved");
    expect(await resolveActiveManagerSendNumber(db, MGR)).toBe("+12065550999");

    await setManagerRegistrationState(db, MGR, "rejected");
    expect(await resolveActiveManagerSendNumber(db, MGR)).toBeNull();
  });

  it("single shared registration: one env flip makes a shared-ref manager sendable, no per-row write", async () => {
    process.env.SMS_PROVISIONING_ENABLED = "1";
    purchaseMock.mockResolvedValue({ ok: true, number: "+12065550777", sid: "PN7", messagingServiceSid: null });
    const db = seed() as never;
    // Signup path seeds registration_ref = "shared" and never approves per-row.
    await provisionManagerNumber(db, MGR);
    expect(await resolveActiveManagerSendNumber(db, MGR)).toBeNull();

    process.env.SMS_SHARED_REGISTRATION_STATE = "approved";
    expect(await resolveActiveManagerSendNumber(db, MGR)).toBe("+12065550777");
  });
});

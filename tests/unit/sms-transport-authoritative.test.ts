// The ONE authoritative SMS transport is Twilio. Claw Messenger is a legacy
// fallback engaged only by its flag. These tests prove: (1) the rail resolver
// defaults to Twilio, (2) a real send with no Claw flag goes through the Twilio
// `sendSms` path, and (3) the money guard keeps number provisioning dark until
// `SMS_PROVISIONING_ENABLED` is flipped on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTwilio = vi.fn();
const sendClaw = vi.fn();
const registerRoute = vi.fn();
const availableList = vi.fn();
const incomingCreate = vi.fn();

vi.mock("@/lib/claw-messenger.server", () => ({
  isClawMessengerConfigured: () =>
    process.env.CLAW_MESSENGER_ENABLED === "1" && Boolean(process.env.CLAW_MESSENGER_API_KEY?.trim()),
  normalizeE164Us: (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  },
  registerClawMessengerRoute: (...args: unknown[]) => registerRoute(...args),
  sendClawMessengerText: (...args: unknown[]) => sendClaw(...args),
}));

vi.mock("@/lib/twilio", () => ({
  normalizeE164: (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  },
  sendSms: (...args: unknown[]) => sendTwilio(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({}),
}));

// Track the Twilio SDK so the money-guard test can prove nothing was bought.
vi.mock("twilio", () => ({
  default: () => ({
    availablePhoneNumbers: () => ({ local: { list: (...a: unknown[]) => availableList(...a) } }),
    incomingPhoneNumbers: Object.assign(() => ({ remove: async () => undefined }), {
      create: (...a: unknown[]) => incomingCreate(...a),
    }),
    messaging: { v1: { services: () => ({ phoneNumbers: { create: async () => undefined } }) } },
  }),
}));

function resetClawEnv() {
  delete process.env.CLAW_MESSENGER_ENABLED;
  delete process.env.CLAW_MESSENGER_API_KEY;
  delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
  delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE;
}

beforeEach(() => {
  sendTwilio.mockReset();
  sendClaw.mockReset();
  registerRoute.mockReset();
  availableList.mockReset();
  incomingCreate.mockReset();
  resetClawEnv();
  vi.resetModules();
});

afterEach(() => {
  resetClawEnv();
  delete process.env.SMS_PROVISIONING_ENABLED;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});

describe("smsPrimaryTransport — Twilio is the authoritative primary rail", () => {
  it("resolves to twilio with no flags set", async () => {
    const { smsPrimaryTransport, isClawFallbackEnabled } = await import("@/lib/sms-transport-mode");
    expect(smsPrimaryTransport()).toBe("twilio");
    expect(isClawFallbackEnabled()).toBe(false);
  });

  it("resolves to claw only when the legacy fallback flag is explicitly on", async () => {
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "1";
    const { smsPrimaryTransport, isClawFallbackEnabled } = await import("@/lib/sms-transport-mode");
    expect(smsPrimaryTransport()).toBe("claw");
    expect(isClawFallbackEnabled()).toBe(true);
  });

  it("treats an explicit 0 as off even if a Claw agent phone is present", async () => {
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "0";
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE = "+12053690702";
    const { smsPrimaryTransport } = await import("@/lib/sms-transport-mode");
    expect(smsPrimaryTransport()).toBe("twilio");
  });
});

describe("sendPropLaneSms — every send routes through the Twilio path by default", () => {
  it("sends via Twilio (channel twilio) when no Claw fallback is engaged", async () => {
    sendTwilio.mockResolvedValue({ sent: true, sid: "SM_twilio" });
    const { sendPropLaneSms } = await import("@/lib/proplane-sms-transport.server");
    const result = await sendPropLaneSms({
      to: "+15103098345",
      text: "Your rent is due.",
      fromNumber: "+14258909021",
    });
    expect(result.ok).toBe(true);
    expect(result.channel).toBe("twilio");
    expect(sendTwilio).toHaveBeenCalledTimes(1);
    expect(sendTwilio).toHaveBeenCalledWith("+15103098345", "Your rent is due.", "+14258909021");
    expect(sendClaw).not.toHaveBeenCalled();
  });

  it("only uses Claw when both the fallback flag and API key are set", async () => {
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "1";
    process.env.CLAW_MESSENGER_ENABLED = "1";
    process.env.CLAW_MESSENGER_API_KEY = "cm_test";
    sendClaw.mockResolvedValue({ ok: true, messageId: "claw_1" });
    const { sendPropLaneSms } = await import("@/lib/proplane-sms-transport.server");
    const result = await sendPropLaneSms({
      to: "+15103098345",
      text: "Legacy path",
      fromNumber: "+14258909021",
    });
    expect(result.channel).toBe("claw");
    expect(sendClaw).toHaveBeenCalledTimes(1);
    expect(sendTwilio).not.toHaveBeenCalled();
  });
});

describe("money guard — no number is bought until SMS_PROVISIONING_ENABLED", () => {
  it("refuses to provision (and never calls Twilio) by default", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_test";
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sms_from_number: null }, error: null }) }) }),
      }),
    };
    const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
    const result = await ensureManagerSmsNumber(db as never, "mgr-1");
    expect(result).toEqual({ ok: false, error: "provisioning_disabled" });
    expect(availableList).not.toHaveBeenCalled();
    expect(incomingCreate).not.toHaveBeenCalled();
  });

  it("lets provisioning proceed to Twilio once the flag is on", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "tok_test";
    process.env.SMS_PROVISIONING_ENABLED = "1";
    availableList.mockResolvedValue([{ phoneNumber: "+12065551234" }]);
    incomingCreate.mockResolvedValue({ phoneNumber: "+12065551234", sid: "PN_1" });
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sms_from_number: null }, error: null }) }) }),
        update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ sms_from_number: "+12065551234" }], error: null }) }) }) }),
      }),
    };
    const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
    const result = await ensureManagerSmsNumber(db as never, "mgr-1");
    expect(result).toEqual({ ok: true, number: "+12065551234" });
    expect(availableList).toHaveBeenCalledTimes(1);
    expect(incomingCreate).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sendTwilio = vi.fn();
const sendClaw = vi.fn();
const registerRoute = vi.fn();
const optedOut = vi.fn();

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

vi.mock("@/lib/sms-consent", () => ({
  isPhoneOptedOut: (...args: unknown[]) => optedOut(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({}),
}));

describe("sendResidentOutboundSms", () => {
  beforeEach(() => {
    sendClaw.mockReset();
    registerRoute.mockReset();
    sendTwilio.mockReset();
    optedOut.mockResolvedValue(false);
    delete process.env.CLAW_MESSENGER_API_KEY;
    delete process.env.CLAW_MESSENGER_ENABLED;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.CLAW_MESSENGER_API_KEY;
    delete process.env.CLAW_MESSENGER_ENABLED;
  });

  it("sends via Twilio from the manager work number", async () => {
    sendTwilio.mockResolvedValue({ sent: true, sid: "SM1" });
    const { sendResidentOutboundSms } = await import("@/lib/resident-outbound-sms.server");
    const result = await sendResidentOutboundSms({
      to: "5103098345",
      text: "Lease ready to sign",
      fromNumber: "+14258909021",
    });
    expect(result.sent).toBe(true);
    expect(result.channel).toBe("twilio");
    expect(sendTwilio).toHaveBeenCalled();
    expect(sendClaw).not.toHaveBeenCalled();
  });

  it("does not prefer Claw when Twilio from is available", async () => {
    process.env.CLAW_MESSENGER_API_KEY = "cm_test";
    process.env.CLAW_MESSENGER_ENABLED = "1";
    sendTwilio.mockResolvedValue({ sent: true, sid: "SM2" });
    sendClaw.mockResolvedValue({ ok: true, messageId: "m1" });
    const { sendResidentOutboundSms } = await import("@/lib/resident-outbound-sms.server");
    const result = await sendResidentOutboundSms({
      to: "+15103098345",
      text: "Payment reminder: rent is due.",
      fromNumber: "+14258909021",
    });
    expect(result).toEqual({ sent: true, channel: "twilio", sid: "SM2" });
    expect(sendTwilio).toHaveBeenCalled();
    expect(sendClaw).not.toHaveBeenCalled();
  });

  it("falls back to Claw only when enabled and Twilio from is missing", async () => {
    process.env.CLAW_MESSENGER_API_KEY = "cm_test";
    process.env.CLAW_MESSENGER_ENABLED = "1";
    sendClaw.mockResolvedValue({ ok: true, messageId: "m1" });
    const { sendResidentOutboundSms } = await import("@/lib/resident-outbound-sms.server");
    const result = await sendResidentOutboundSms({
      to: "+15103098345",
      text: "Payment reminder: rent is due.",
    });
    expect(result.sent).toBe(true);
    expect(result.channel).toBe("claw");
    expect(sendClaw).toHaveBeenCalled();
  });
});

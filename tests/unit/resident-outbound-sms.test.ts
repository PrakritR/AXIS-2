import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sendClaw = vi.fn();
const registerRoute = vi.fn();
const sendTwilio = vi.fn();
const optedOut = vi.fn();

vi.mock("@/lib/claw-messenger.server", () => ({
  isClawMessengerConfigured: () => Boolean(process.env.CLAW_MESSENGER_API_KEY?.trim()),
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
    process.env.CLAW_MESSENGER_API_KEY = "cm_test";
  });

  afterEach(() => {
    delete process.env.CLAW_MESSENGER_API_KEY;
  });

  it("prefers Claw when configured", async () => {
    sendClaw.mockResolvedValue({ ok: true, messageId: "m1" });
    const { sendResidentOutboundSms } = await import("@/lib/resident-outbound-sms.server");
    const result = await sendResidentOutboundSms({
      to: "+15103098345",
      text: "Payment reminder: rent is due.",
      fromNumber: "+12065550100",
    });
    expect(result).toEqual({ sent: true, channel: "claw", sid: "m1" });
    expect(registerRoute).toHaveBeenCalled();
    expect(sendClaw).toHaveBeenCalled();
    expect(sendTwilio).not.toHaveBeenCalled();
  });

  it("falls back to Twilio when Claw is not configured", async () => {
    delete process.env.CLAW_MESSENGER_API_KEY;
    sendTwilio.mockResolvedValue({ sent: true, sid: "SM1" });
    vi.resetModules();
    const { sendResidentOutboundSms } = await import("@/lib/resident-outbound-sms.server");
    const result = await sendResidentOutboundSms({
      to: "5103098345",
      text: "Lease ready to sign",
      fromNumber: "+12065550100",
    });
    expect(result.sent).toBe(true);
    expect(result.channel).toBe("twilio");
    expect(sendTwilio).toHaveBeenCalled();
  });
});

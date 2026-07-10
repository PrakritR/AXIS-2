import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("twilio", () => ({ default: { validateRequest: vi.fn().mockReturnValue(true) } }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/agent/vendor-agent.server", () => ({
  findVendorAgentSessionByPhone: vi.fn(),
  runVendorAgentSessionTurn: vi.fn().mockResolvedValue("ok"),
}));

import twilio from "twilio";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { findVendorAgentSessionByPhone, runVendorAgentSessionTurn } from "@/lib/agent/vendor-agent.server";
import { POST } from "@/app/api/webhooks/twilio/sms/route";

const SESSION = {
  id: "sess-1",
  landlord_id: "mgr-a",
  kind: "vendor_work_order",
  vendor_user_id: "vendor-user-1",
  vendor_directory_id: "v-plumb",
  work_order_id: "REQ-1",
  vendor_phone_e164: "+12065550001",
  status: "active",
  inbox_thread_id: null,
};

function smsRequest(params: Record<string, string>, signature: string | null = "sig"): Request {
  const body = new URLSearchParams(params).toString();
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (signature) headers["x-twilio-signature"] = signature;
  return new Request("http://localhost/api/webhooks/twilio/sms", { method: "POST", body, headers });
}

function mockDb() {
  const profileUpdates: Array<{ patch: Record<string, unknown>; ids: string[] }> = [];
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      if (table === "agent_sessions") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                sessionUpdates.push(patch);
                return { error: null };
              },
            }),
          }),
          then: (resolve: (v: { data: unknown[] }) => void) =>
            resolve({ data: [{ vendor_user_id: "vendor-user-1" }] }),
        };
        return chain;
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: "vendor-user-1" }], error: null }),
          }),
          update: (patch: Record<string, unknown>) => ({
            in: async (_c: string, ids: string[]) => {
              profileUpdates.push({ patch, ids });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as never, profileUpdates, sessionUpdates };
}

describe("/api/webhooks/twilio/sms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(twilio.validateRequest).mockReturnValue(true);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
    vi.stubEnv("TWILIO_WEBHOOK_URL", "https://axis.example/api/webhooks/twilio/sms");
    const { client } = mockDb();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client);
    vi.mocked(findVendorAgentSessionByPhone).mockResolvedValue(SESSION as never);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects a forged signature with 403 and runs nothing", async () => {
    vi.mocked(twilio.validateRequest).mockReturnValue(false);
    const res = await POST(smsRequest({ From: "+12065550001", Body: "hola" }));
    expect(res.status).toBe(403);
    expect(runVendorAgentSessionTurn).not.toHaveBeenCalled();
  });

  it("fails closed on Vercel when the signature is missing", async () => {
    vi.stubEnv("VERCEL", "1");
    const res = await POST(smsRequest({ From: "+12065550001", Body: "hola" }, null));
    expect(res.status).toBe(403);
    expect(runVendorAgentSessionTurn).not.toHaveBeenCalled();
  });

  it("silently drops unknown numbers with an empty TwiML 200", async () => {
    vi.mocked(findVendorAgentSessionByPhone).mockResolvedValue(null);
    const res = await POST(smsRequest({ From: "+19998887777", Body: "who dis" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<Response></Response>");
    expect(runVendorAgentSessionTurn).not.toHaveBeenCalled();
  });

  it("binds the newest active session for the sender and runs a turn", async () => {
    const res = await POST(smsRequest({ From: "+1 (206) 555-0001", Body: "cual es el codigo del porton?" }));
    expect(res.status).toBe(200);
    expect(findVendorAgentSessionByPhone).toHaveBeenCalledWith(expect.anything(), "+12065550001");
    expect(runVendorAgentSessionTurn).toHaveBeenCalledWith(
      expect.anything(),
      SESSION,
      "cual es el codigo del porton?",
      "sms",
    );
  });

  it("STOP records the opt-out, unbinds the number, and never runs a turn", async () => {
    const { client, profileUpdates, sessionUpdates } = mockDb();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client);

    const res = await POST(smsRequest({ From: "+12065550001", Body: "STOP" }));
    expect(res.status).toBe(200);
    expect(profileUpdates[0]!.ids).toEqual(["vendor-user-1"]);
    expect(profileUpdates[0]!.patch.sms_opt_out_at).toBeTruthy();
    expect(sessionUpdates[0]!.vendor_phone_e164).toBeNull();
    expect(runVendorAgentSessionTurn).not.toHaveBeenCalled();
  });

  it("rate-limits a flood from one number while still returning 200", async () => {
    const from = "+12065559999";
    for (let i = 0; i < 12; i++) {
      const res = await POST(smsRequest({ From: from, Body: `msg ${i}` }));
      expect(res.status).toBe(200);
    }
    expect(vi.mocked(runVendorAgentSessionTurn).mock.calls.length).toBeLessThanOrEqual(10);
  });
});

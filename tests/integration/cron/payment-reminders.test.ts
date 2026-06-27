import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/twilio", () => ({
  sendSms: vi.fn().mockResolvedValue({ ok: true }),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { GET as paymentReminders } from "@/app/api/cron/send-payment-reminders/route";

describe("GET /api/cron/send-payment-reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NODE_ENV = "test";
  });

  it("rejects unauthorized requests in test with wrong secret", async () => {
    const req = new Request("http://localhost/api/cron/send-payment-reminders", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = await paymentReminders(req);
    expect(res.status).toBe(401);
  });

  it("runs with valid cron secret and no pending charges", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "portal_household_charge_records") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "manager_property_records") {
          return { select: vi.fn().mockResolvedValue({ data: [] }) };
        }
        if (table === "portal_outbound_mail_records") {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        if (table === "manager_automation_settings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
            }),
          };
        }
        if (table === "scheduled_message_overrides") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [] }) };
      }),
    } as never);

    const req = new Request("http://localhost/api/cron/send-payment-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await paymentReminders(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});

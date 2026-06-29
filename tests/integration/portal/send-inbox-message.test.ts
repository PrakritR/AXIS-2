import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  clientIpFrom: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/auth/admin-preview", () => ({
  isAdminUser: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/auth/resident-relationship", () => ({
  managerOwnsResident: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/twilio", () => ({
  sendSms: vi.fn().mockResolvedValue({ sent: false }),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { POST as sendInboxMessage } from "@/app/api/portal/send-inbox-message/route";

const MANAGER_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_SCOPE = "axis_portal_inbox_resident_v1";

function makeDbMock(options: { senderRole?: string; recipientEmail?: string; recipientId?: string } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options.recipientId
      ? { id: options.recipientId, email: options.recipientEmail ?? "recipient@example.com", role: options.senderRole ?? "manager" }
      : { role: options.senderRole ?? "manager" },
    error: null,
  });
  const select = vi.fn().mockReturnThis();
  const from = vi.fn().mockReturnValue({
    select,
    upsert,
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle,
  });
  return { from, upsert };
}

describe("POST /api/portal/send-inbox-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Axis <test@axis.local>";
    vi.mocked(rateLimit).mockReturnValue({ ok: true } as ReturnType<typeof rateLimit>);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: { subject: "Hello", text: "Body" },
    });
    const res = await sendInboxMessage(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when subject is missing", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1", email: "mgr@example.com" } } }) },
    } as never);
    const { from } = makeDbMock({ senderRole: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: { text: "No subject" },
    });
    const res = await sendInboxMessage(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is missing", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1", email: "mgr@example.com" } } }) },
    } as never);
    const { from } = makeDbMock({ senderRole: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: { subject: "A subject" },
    });
    const res = await sendInboxMessage(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(rateLimit).mockReturnValue({ ok: false } as ReturnType<typeof rateLimit>);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1", email: "mgr@example.com" } } }) },
    } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: { subject: "Hi", text: "Msg" },
    });
    const res = await sendInboxMessage(req);
    expect(res.status).toBe(429);
  });

  it("manager → resident: creates sender Sent + recipient inbox record in correct scopes", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "mgr_1", email: "mgr@example.com" } } }) },
    } as never);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingleFns: ReturnType<typeof vi.fn>[] = [];

    // profiles.select().eq().maybeSingle() → sender role
    const senderProfileMaybeSingle = vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null });
    // profiles.select().in() → recipient profiles (by userId)
    const recipientProfilesData = vi.fn().mockResolvedValue({
      data: [{ id: "res_1", email: "resident@example.com", role: "resident" }],
      error: null,
    });

    const from = vi.fn().mockImplementation(() => {
      const obj: Record<string, unknown> = {};
      obj.upsert = upsert;
      obj.select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: senderProfileMaybeSingle }),
        in: vi.fn().mockReturnValue(recipientProfilesData()),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: senderProfileMaybeSingle,
      });
      return obj;
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    // Mock fetch (Resend) to return success
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
    ) as never;

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: {
        subject: "Test message",
        text: "Hello resident",
        toEmails: "resident@example.com",
        deliverToPortalInbox: true,
        deliverViaEmail: false,
      },
    });
    const res = await sendInboxMessage(req);
    const { status } = await parseJsonResponse(res);

    // Should succeed (200 or skipped ok)
    expect(status).toBeLessThan(500);

    // Upsert should have been called for both sender Sent record and recipient inbox record
    expect(upsert).toHaveBeenCalledTimes(2);
    const [senderCall, recipientCall] = upsert.mock.calls;
    expect(senderCall[0]).toMatchObject({ scope: MANAGER_SCOPE, row_data: expect.objectContaining({ folder: "sent" }) });
    expect(recipientCall[0]).toMatchObject({ scope: RESIDENT_SCOPE, row_data: expect.objectContaining({ folder: "inbox" }) });
  });

  it("deliverToPortalInbox:false skips upserts", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "mgr_1", email: "mgr@example.com" } } }) },
    } as never);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }) }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }),
      }),
      upsert,
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: {
        subject: "No inbox",
        text: "Skip portal",
        toEmails: "resident@example.com",
        deliverToPortalInbox: false,
        deliverViaEmail: false,
      },
    });
    await sendInboxMessage(req);
    // No upserts should be made for inbox records when portal delivery is off
    const inboxUpserts = upsert.mock.calls.filter((call) => {
      const data = call[0] as { row_data?: { folder?: string } };
      return data?.row_data?.folder === "sent" || data?.row_data?.folder === "inbox";
    });
    expect(inboxUpserts).toHaveLength(0);
  });

  it("non-staff sender restricted to managed recipients only", async () => {
    const { managerOwnsResident } = await import("@/lib/auth/resident-relationship");
    vi.mocked(managerOwnsResident).mockResolvedValue(false);

    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "res_1", email: "resident@example.com" } } }) },
    } as never);

    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: "resident" }, error: null }) }),
        in: vi.fn().mockResolvedValue({
          data: [{ id: "other_mgr", email: "other@example.com", role: "manager" }],
          error: null,
        }),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "resident" }, error: null }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    const req = jsonRequest("http://localhost/api/portal/send-inbox-message", {
      method: "POST",
      body: {
        subject: "Hello manager",
        text: "Can I message?",
        toUserIds: ["other_mgr"],
        deliverViaEmail: false,
      },
    });
    const res = await sendInboxMessage(req);
    expect(res.status).toBe(403);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";
import { ADMIN_INBOX_SCOPE } from "@/lib/portal-inbox-thread-scope";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST as contactMessage } from "@/app/api/public/contact-message/route";

const validBody = {
  name: "Jane Smith",
  email: "Jane@Company.com",
  topic: "Support",
  body: "I have a question about Axis.",
};

describe("POST /api/public/contact-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing name / invalid email", async () => {
    const res = await contactMessage(
      jsonRequest("http://localhost/api/public/contact-message", {
        method: "POST",
        body: { ...validBody, name: "", email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing topic", async () => {
    const res = await contactMessage(
      jsonRequest("http://localhost/api/public/contact-message", {
        method: "POST",
        body: { ...validBody, topic: "" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing message body", async () => {
    const res = await contactMessage(
      jsonRequest("http://localhost/api/public/contact-message", {
        method: "POST",
        body: { ...validBody, body: "" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("routes a valid anonymous submission into the admin inbox", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never);

    const res = await contactMessage(
      jsonRequest("http://localhost/api/public/contact-message", {
        method: "POST",
        body: validBody,
      }),
    );
    const { status, data } = await parseJsonResponse<{ ok?: boolean }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);

    const [record, options] = upsert.mock.calls[0];
    // Admin-inbox routing: thread is visible to admins via scope, with no owner
    // user (the sender is anonymous / unauthenticated).
    expect(record.scope).toBe(ADMIN_INBOX_SCOPE);
    expect(record.owner_user_id).toBeNull();
    // Full contact payload preserved for the admin inbox thread, including the
    // sender's reply-to email (lowercased server-side).
    expect(record.participant_email).toBe("jane@company.com");
    expect(record.row_data.email).toBe("jane@company.com");
    expect(record.row_data.participantEmail).toBe("jane@company.com");
    expect(record.row_data.name).toBe("Jane Smith");
    expect(record.row_data.topic).toBe("Support");
    expect(record.row_data.body).toBe("I have a question about Axis.");
    expect(record.row_data.senderRole).toBe("partner");
    expect(record.row_data.folder).toBe("inbox");
    expect(options).toEqual({ onConflict: "id" });
  });

  it("returns 500 when the upsert fails", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "db down" } }),
      }),
    } as never);

    const res = await contactMessage(
      jsonRequest("http://localhost/api/public/contact-message", {
        method: "POST",
        body: validBody,
      }),
    );
    expect(res.status).toBe(500);
  });
});

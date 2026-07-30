import { describe, expect, it, vi } from "vitest";
import { recordResidentProspectInboxMessage } from "@/lib/tour-notification-delivery.server";

describe("recordResidentProspectInboxMessage", () => {
  it("writes a resident inbox thread keyed by participant email", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === "portal_inbox_thread_records") {
          return { upsert };
        }
        return {};
      }),
    };

    await recordResidentProspectInboxMessage(db as never, {
      participantEmail: "guest@example.com",
      subject: "Tour request received",
      body: "We received your tour request.",
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0]?.[0] as { participant_email?: string; scope?: string };
    expect(payload.participant_email).toBe("guest@example.com");
    expect(payload.scope).toBe("axis_portal_inbox_resident_v1");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  appendResidentPropertyManagerInboxMessage,
  propertyManagerConversationThreadId,
  propertyManagerThreadLabel,
} from "@/lib/property-manager-inbox-thread.server";

describe("propertyManagerConversationThreadId", () => {
  it("is stable for the same resident, manager, and property", () => {
    const input = {
      residentEmail: "guest@example.com",
      managerUserId: "mgr-1",
      propertyId: "prop-oak",
    };
    expect(propertyManagerConversationThreadId(input)).toBe(propertyManagerConversationThreadId(input));
  });

  it("differs when the property changes", () => {
    const base = {
      residentEmail: "guest@example.com",
      managerUserId: "mgr-1",
    };
    expect(propertyManagerConversationThreadId({ ...base, propertyId: "prop-a" })).not.toBe(
      propertyManagerConversationThreadId({ ...base, propertyId: "prop-b" }),
    );
  });
});

describe("propertyManagerThreadLabel", () => {
  it("labels the thread with the house name", () => {
    expect(propertyManagerThreadLabel("Oak House")).toBe("Property manager (Oak House)");
  });
});

describe("appendResidentPropertyManagerInboxMessage", () => {
  it("reuses one thread id for repeated messages about the same property", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const threadIds: string[] = [];
    const db = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "portal_inbox_thread_records") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, id: string) => {
                threadIds.push(id);
                const found = upsert.mock.calls.find((call) => (call[0] as { id?: string }).id === id);
                return {
                  maybeSingle: vi.fn().mockResolvedValue(
                    found ? { data: { id, row_data: (found[0] as { row_data: unknown }).row_data }, error: null } : { data: null, error: null },
                  ),
                };
              }),
            }),
            upsert,
          };
        }
        return {};
      }),
    };

    const base = {
      participantEmail: "guest@example.com",
      managerUserId: "mgr-1",
      propertyId: "prop-oak",
      propertyTitle: "Oak House",
      counterpartyEmail: "manager@example.com",
    };

    await appendResidentPropertyManagerInboxMessage(db as never, {
      ...base,
      subject: "We received your message — Availability",
      body: "Thanks for reaching out about Oak House.",
      residentMessage: "Is this still available?",
      residentName: "Alex",
    });
    await appendResidentPropertyManagerInboxMessage(db as never, {
      ...base,
      subject: "We received your message — Parking",
      body: "Thanks for reaching out about Oak House.",
      residentMessage: "Is parking included?",
      residentName: "Alex",
    });

    expect(upsert).toHaveBeenCalledTimes(2);
    const firstId = (upsert.mock.calls[0]?.[0] as { id?: string }).id;
    const secondId = (upsert.mock.calls[1]?.[0] as { id?: string }).id;
    expect(firstId).toBe(secondId);
    const secondRow = upsert.mock.calls[1]?.[0] as { row_data?: { from?: string; messages?: unknown[] } };
    expect(secondRow.row_data?.from).toBe("Property manager (Oak House)");
    expect(secondRow.row_data?.messages?.length).toBeGreaterThan(1);
  });
});

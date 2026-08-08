import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyProspectMessagingContactToProfile,
  attachInboxThreadsToResident,
} from "@/lib/tour-resident-link.server";

describe("prospect inbox identity helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyProspectMessagingContactToProfile stores the tour/message form email on the profile", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { email: "asda@gmail.com", phone: null } }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      })),
    };

    await applyProspectMessagingContactToProfile(db as never, {
      userId: "user-1",
      contactEmail: "ogambik22@gmail.com",
      phone: "(206) 555-0100",
    });

    expect(updateEq).toHaveBeenCalledWith("id", "user-1");
  });

  it("backfills owner_user_id on pre-account inbox threads for the email", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null });
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: "thread-1" }, { id: "thread-2" }],
        error: null,
      }),
    };
    const db = {
      from: vi.fn((table: string) => {
        if (table === "portal_inbox_thread_records") {
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn().mockReturnValue({ in: updateIn }),
          };
        }
        return {};
      }),
    };

    await attachInboxThreadsToResident(db as never, "user-abc", "guest@example.com");
    expect(updateIn).toHaveBeenCalledWith("id", ["thread-1", "thread-2"]);
  });
});

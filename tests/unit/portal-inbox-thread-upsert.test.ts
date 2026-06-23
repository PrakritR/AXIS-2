import { describe, expect, it } from "vitest";
import { buildPortalInboxThreadUpsert } from "@/lib/portal-inbox-thread-upsert";

const user = { id: "mgr-1", email: "manager@example.com" };

describe("buildPortalInboxThreadUpsert", () => {
  it("keeps owner_user_id and null participant_email for sent threads", () => {
    const record = buildPortalInboxThreadUpsert(
      {
        id: "msg_mgr-1_123_abcd",
        scope: "axis_portal_inbox_manager_v1",
        folder: "sent",
        email: "resident@example.com",
        subject: "Lease ready",
      },
      user,
    );
    expect(record.owner_user_id).toBe("mgr-1");
    expect(record.participant_email).toBeNull();
  });

  it("preserves sent ownership when moving a sent thread to trash", () => {
    const record = buildPortalInboxThreadUpsert(
      {
        id: "msg_mgr-1_123_abcd",
        scope: "axis_portal_inbox_manager_v1",
        folder: "trash",
        previousFolder: "sent",
        email: "resident@example.com",
        subject: "Lease ready",
      },
      user,
    );
    expect(record.owner_user_id).toBe("mgr-1");
    expect(record.participant_email).toBeNull();
  });

  it("uses participant_email for inbox threads moved to trash", () => {
    const record = buildPortalInboxThreadUpsert(
      {
        id: "msg_inbox_123_abcd",
        scope: "axis_portal_inbox_manager_v1",
        folder: "trash",
        previousFolder: "inbox",
        email: "resident@example.com",
        subject: "Tour request",
      },
      user,
    );
    expect(record.owner_user_id).toBe("mgr-1");
    expect(record.participant_email).toBe("manager@example.com");
  });
});

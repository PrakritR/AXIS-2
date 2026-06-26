import { describe, expect, it } from "vitest";
import {
  beginInboxMutation,
  endInboxMutation,
  mergeInboxRowsWithLocalTrash,
  persistInbox,
  stagePersistedInboxRows,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";

function thread(overrides: Partial<PersistedInboxThread> & Pick<PersistedInboxThread, "id" | "folder">): PersistedInboxThread {
  return {
    from: "Property Manager",
    email: "resident@example.com",
    subject: "Lease ready",
    preview: "Preview",
    body: "Body",
    time: "Jun 22",
    unread: false,
    ...overrides,
  };
}

describe("portal inbox trash race guards", () => {
  it("keeps trashed row when server sync completes after local stage", () => {
    const key = "axis_portal_inbox_manager_v1";
    const sent = [thread({ id: "msg_1", folder: "sent" })];
    const trashed = [thread({ id: "msg_1", folder: "trash", previousFolder: "sent" })];

    beginInboxMutation();
    stagePersistedInboxRows(key, trashed);

    const merged = mergeInboxRowsWithLocalTrash(sent, trashed);
    expect(merged[0]?.folder).toBe("trash");

    endInboxMutation();
  });

  it("blocks full replace persist while a mutation is in flight", () => {
    const key = "axis_portal_inbox_manager_v1";
    const sent = [thread({ id: "msg_1", folder: "sent" })];
    const trashed = [thread({ id: "msg_1", folder: "trash", previousFolder: "sent" })];

    stagePersistedInboxRows(key, trashed);
    beginInboxMutation();
    persistInbox(key, sent);
    endInboxMutation();

    const merged = mergeInboxRowsWithLocalTrash(sent, trashed);
    expect(merged[0]?.folder).toBe("trash");
  });
});

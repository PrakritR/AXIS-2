import { describe, expect, it } from "vitest";
import { mergeAdminInboxWithLocalTrash, type InboxMessage } from "@/lib/demo-admin-partner-inbox";
import { mergeInboxRowsWithLocalTrash, type PersistedInboxThread } from "@/lib/portal-inbox-storage";

function thread(overrides: Partial<PersistedInboxThread> & Pick<PersistedInboxThread, "id" | "folder">): PersistedInboxThread {
  return {
    from: "Axis",
    email: "guest@example.com",
    subject: "Test",
    preview: "Preview",
    body: "Body",
    time: "Jan 1",
    unread: false,
    ...overrides,
  };
}

function adminMsg(overrides: Partial<InboxMessage> & Pick<InboxMessage, "id" | "folder">): InboxMessage {
  return {
    name: "Test User",
    email: "user@example.com",
    topic: "Topic",
    body: "Body",
    createdAt: "2024-01-01T00:00:00.000Z",
    read: false,
    senderRole: "manager",
    thread: [],
    ...overrides,
  };
}

describe("inbox trash tab remount scenarios (manager/resident)", () => {
  it("keeps message in trash when user switches tabs before server persist completes", () => {
    const staleServer = [thread({ id: "msg_1", folder: "sent" })];
    const localAfterTrash = [thread({ id: "msg_1", folder: "trash", previousFolder: "sent" })];

    const afterRemountSync = mergeInboxRowsWithLocalTrash(staleServer, localAfterTrash);

    expect(afterRemountSync).toHaveLength(1);
    expect(afterRemountSync[0]?.folder).toBe("trash");
    expect(afterRemountSync[0]?.previousFolder).toBe("sent");
  });

  it("keeps empty trash after delete-all when server still returns trashed rows", () => {
    const deletedId = "msg_deleted";
    const staleServer = [
      thread({ id: deletedId, folder: "trash" }),
      thread({ id: "msg_kept", folder: "sent" }),
    ];
    const localAfterEmptyTrash = [thread({ id: "msg_kept", folder: "sent" })];
    const excludeIds = new Set([deletedId]);

    const merged = mergeInboxRowsWithLocalTrash(staleServer, localAfterEmptyTrash, { excludeIds });

    expect(merged.map((row) => row.id)).toEqual(["msg_kept"]);
  });

  it("restores to sent when user restores from trash before server catches up", () => {
    const staleServer = [thread({ id: "msg_1", folder: "trash" })];
    const localAfterRestore = [thread({ id: "msg_1", folder: "sent" })];

    const merged = mergeInboxRowsWithLocalTrash(staleServer, localAfterRestore);

    expect(merged[0]?.folder).toBe("sent");
    expect(merged[0]?.previousFolder).toBeUndefined();
  });

  it("uses server trash when local and server agree (persist completed)", () => {
    const server = [thread({ id: "msg_1", folder: "trash", previousFolder: "sent" })];
    const local = [thread({ id: "msg_1", folder: "trash", previousFolder: "sent" })];

    const merged = mergeInboxRowsWithLocalTrash(server, local);

    expect(merged[0]?.folder).toBe("trash");
  });

  it("keeps sent message trash state when only that row changed locally", () => {
    const server = [
      thread({ id: "msg_sent", folder: "sent", subject: "Lease ready" }),
      thread({ id: "msg_inbox", folder: "inbox", subject: "Tour request" }),
    ];
    const localAfterTrash = [
      thread({ id: "msg_sent", folder: "trash", previousFolder: "sent", subject: "Lease ready" }),
      thread({ id: "msg_inbox", folder: "inbox", subject: "Tour request" }),
    ];

    const merged = mergeInboxRowsWithLocalTrash(server, localAfterTrash);

    expect(merged.find((row) => row.id === "msg_sent")?.folder).toBe("trash");
    expect(merged.find((row) => row.id === "msg_inbox")?.folder).toBe("inbox");
  });
});

describe("inbox trash tab remount scenarios (admin)", () => {
  it("keeps message in trash when admin switches tabs before server persist completes", () => {
    const staleServer = [adminMsg({ id: "admin_1", folder: "sent" })];
    const localAfterTrash = [adminMsg({ id: "admin_1", folder: "trash", trashedFrom: "sent" })];

    const afterRemountSync = mergeAdminInboxWithLocalTrash(staleServer, localAfterTrash);

    expect(afterRemountSync[0]?.folder).toBe("trash");
    expect(afterRemountSync[0]?.trashedFrom).toBe("sent");
  });

  it("keeps empty trash after delete-all when server still returns trashed rows", () => {
    const deletedId = "admin_deleted";
    const staleServer = [
      adminMsg({ id: deletedId, folder: "trash", trashedFrom: "inbox" }),
      adminMsg({ id: "admin_kept", folder: "inbox" }),
    ];
    const localAfterEmptyTrash = [adminMsg({ id: "admin_kept", folder: "inbox" })];
    const excludeIds = new Set([deletedId]);

    const merged = mergeAdminInboxWithLocalTrash(staleServer, localAfterEmptyTrash, excludeIds);

    expect(merged.map((row) => row.id)).toEqual(["admin_kept"]);
  });

  it("restores to inbox when admin restores from trash before server catches up", () => {
    const staleServer = [adminMsg({ id: "admin_1", folder: "trash", trashedFrom: "inbox" })];
    const localAfterRestore = [adminMsg({ id: "admin_1", folder: "inbox", read: true })];

    const merged = mergeAdminInboxWithLocalTrash(staleServer, localAfterRestore);

    expect(merged[0]?.folder).toBe("inbox");
    expect(merged[0]?.trashedFrom).toBeUndefined();
    expect(merged[0]?.read).toBe(true);
  });
});

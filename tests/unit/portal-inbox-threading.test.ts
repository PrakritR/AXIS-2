import { describe, expect, it } from "vitest";
import { appendReplyToInboxThread, inboxThreadMessages, type PersistedInboxThread } from "@/lib/portal-inbox-storage";

describe("portal inbox threading", () => {
  const base: PersistedInboxThread = {
    id: "thread-1",
    folder: "inbox",
    from: "Resident",
    email: "resident@example.com",
    subject: "Maintenance",
    preview: "Hello",
    body: "Initial message",
    time: "Jun 1",
    unread: true,
  };

  it("includes root message and replies in thread order", () => {
    const withReply = appendReplyToInboxThread(base, {
      id: "r1",
      from: "Manager",
      body: "We will schedule a visit.",
      at: "Jun 2",
    });
    const messages = inboxThreadMessages(withReply);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.body).toBe("Initial message");
    expect(messages[1]?.body).toBe("We will schedule a visit.");
    expect(withReply.preview).toContain("schedule");
  });
});

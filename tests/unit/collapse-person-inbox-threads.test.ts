import { describe, expect, it } from "vitest";
import {
  collapsePersonInboxThreads,
  inboxThreadMessages,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";

function thread(partial: Partial<PersistedInboxThread> & Pick<PersistedInboxThread, "id" | "email">): PersistedInboxThread {
  return {
    folder: "sent",
    from: "Manager",
    subject: "Hello",
    preview: "Hello",
    body: "Hello",
    time: "Jan 1, 10:00 AM",
    unread: false,
    ...partial,
  };
}

describe("collapsePersonInboxThreads", () => {
  it("merges multiple sent threads for the same resident email", () => {
    const rows = collapsePersonInboxThreads([
      thread({
        id: "payment_sent_mgr_1000_aaaa",
        email: "resident@test.com",
        body: "First reminder",
        time: "Jan 1, 10:00 AM",
      }),
      thread({
        id: "payment_sent_mgr_2000_bbbb",
        email: "resident@test.com",
        body: "Second reminder",
        time: "Jan 2, 10:00 AM",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("payment_sent_mgr_2000_bbbb");
    expect(inboxThreadMessages(rows[0]!).map((m) => m.body)).toEqual(["First reminder", "Second reminder"]);
  });

  it("keeps separate threads for different residents", () => {
    const rows = collapsePersonInboxThreads([
      thread({ id: "t1", email: "a@test.com" }),
      thread({ id: "t2", email: "b@test.com" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("merges inbox and sent rows for the same resident when mergeFolders is set", () => {
    const rows = collapsePersonInboxThreads(
      [
        thread({
          id: "sent_1",
          folder: "sent",
          email: "resident@test.com",
          body: "Reminder",
        }),
        thread({
          id: "inbox_1",
          folder: "inbox",
          email: "resident@test.com",
          body: "Thanks",
          from: "Resident",
        }),
      ],
      { mergeFolders: true },
    );
    expect(rows).toHaveLength(1);
    expect(inboxThreadMessages(rows[0]!).map((m) => m.body)).toEqual(["Reminder", "Thanks"]);
  });
});

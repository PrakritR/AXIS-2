import { describe, expect, it } from "vitest";
import { filterEmailInboxThreads, isPhoneLikeContact, isSmsLikeInboxThread } from "@/lib/communication-inbox-filters";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";

function thread(partial: Partial<PersistedInboxThread> & Pick<PersistedInboxThread, "id" | "from">): PersistedInboxThread {
  return {
    folder: "inbox",
    email: "",
    subject: "Subject",
    preview: "Preview",
    body: "Body",
    time: "Jul 15",
    unread: true,
    ...partial,
  };
}

describe("communication-inbox-filters", () => {
  it("detects phone-like contacts", () => {
    expect(isPhoneLikeContact("+15105794001")).toBe(true);
    expect(isPhoneLikeContact("Test Resident")).toBe(false);
    expect(isPhoneLikeContact("resident@test.axis.local")).toBe(false);
  });

  it("filters sms-like threads out of email channel", () => {
    const rows = [
      thread({ id: "email-1", from: "Test Resident", email: "resident@test.axis.local" }),
      thread({ id: "sms-1", from: "+15105794001" }),
    ];
    expect(filterEmailInboxThreads(rows).map((r) => r.id)).toEqual(["email-1"]);
    expect(isSmsLikeInboxThread(rows[1]!)).toBe(true);
  });
});

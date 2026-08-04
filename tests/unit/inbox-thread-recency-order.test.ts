import { describe, expect, it } from "vitest";
import {
  appendReplyToInboxThread,
  formatInboxStamp,
  inboxThreadSortMs,
  parseInboxStampMs,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";

/**
 * Regression cover for the Communication ordering defect (manager F-COMM-2,
 * resident F9): the conversation list was not ordered by recency, and sending
 * a message did not float its thread to the top.
 */
describe("inbox conversation ordering", () => {
  // Fixed "now" so the year-inference below is deterministic.
  const NOW = new Date("2026-08-03T18:00:00-07:00");

  describe("parseInboxStampMs", () => {
    it("reads a year-less send stamp as the current year, not 2001", () => {
      // `portal-inbox-delivery.ts` writes exactly this shape. Bare Date.parse
      // resolves it to 2001, which is what sank today's threads to the bottom.
      const ms = parseInboxStampMs("Aug 3, 5:31 PM", NOW);
      expect(ms).not.toBeNull();
      expect(new Date(ms!).getFullYear()).toBe(2026);
    });

    it("keeps an explicit year", () => {
      const ms = parseInboxStampMs("Jul 20, 2026", NOW);
      expect(new Date(ms!).getFullYear()).toBe(2026);
    });

    it("rolls a future-looking stamp back a year", () => {
      const ms = parseInboxStampMs("Dec 28, 9:00 AM", new Date("2026-01-02T12:00:00Z"));
      expect(new Date(ms!).getFullYear()).toBe(2025);
    });

    it("returns null when there is nothing to order on", () => {
      expect(parseInboxStampMs("")).toBeNull();
      expect(parseInboxStampMs(null)).toBeNull();
    });
  });

  describe("inboxThreadSortMs", () => {
    it("ranks today's message above an older dated thread", () => {
      // The exact inversion the audit observed: Diego (newest message in the
      // inbox) sat 9th, below a Jul 29 row.
      const todays = inboxThreadSortMs("thread-diego", "Aug 3, 5:31 PM");
      const older = inboxThreadSortMs("thread-sofia", "Jul 29, 3:08 AM");
      expect(todays).toBeGreaterThan(older);
    });

    it("ranks today's message above a year-stamped July thread", () => {
      const todays = inboxThreadSortMs("thread-a", "Aug 3, 5:16 PM");
      const dateOnly = inboxThreadSortMs("thread-b", "Jul 20, 2026");
      expect(todays).toBeGreaterThan(dateOnly);
    });

    it("orders on latest activity, not on the creation epoch in the id", () => {
      // Old thread, but its id embeds a NEWER creation epoch than the other's.
      const staleButNewId = inboxThreadSortMs(`outbound_${Date.parse("2026-08-03T00:00:00Z")}`, "Jul 1, 2026");
      const activeButOldId = inboxThreadSortMs("outbound_1600000000000", "Aug 3, 5:31 PM");
      expect(activeButOldId).toBeGreaterThan(staleButNewId);
    });

    it("does not mistake a phone number in an id for an epoch", () => {
      // 15105794001 is 11 digits — as an epoch it is June 1970, which sorted
      // the row to the very bottom.
      expect(inboxThreadSortMs("sms-15105794001", "Aug 3, 5:31 PM")).toBeGreaterThan(
        inboxThreadSortMs("sms-15105794001", "Jul 1, 2026"),
      );
    });
  });

  describe("appendReplyToInboxThread", () => {
    const base: PersistedInboxThread = {
      id: "thread-kitchen-sink",
      folder: "inbox",
      from: "Resident",
      email: "resident@example.com",
      subject: "Kitchen sink",
      preview: "old preview",
      body: "original body",
      time: "Jul 20, 2026",
      unread: true,
    };

    it("advances the thread stamp to the reply", () => {
      // Audit: "replying to the Kitchen sink thread moved it to position 1 but
      // left its displayed date at Jul 20."
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: "Aug 3, 5:31 PM",
      });
      expect(replied.time).toBe("Aug 3, 5:31 PM");
    });

    /**
     * Every reply call site (manager-inbox, resident-inbox-panel,
     * vendor-inbox-panel) builds `at` with a bare `new Date().toLocaleString()`.
     * Storing that verbatim changed the list row's label from "Aug 3, 5:31 PM"
     * to "8/3/2026, 6:31:00 PM" in a narrow, fixed-width time column.
     */
    it("normalizes a toLocaleString() reply stamp to the canonical format", () => {
      const raw = new Date("2026-08-03T17:31:00-07:00").toLocaleString("en-US");
      expect(raw).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // guard: this IS the long shape
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: raw,
      });
      expect(replied.time).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      expect(replied.time).toBe(formatInboxStamp(new Date("2026-08-03T17:31:00-07:00")));
    });

    it("keeps a normalized stamp orderable", () => {
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: new Date("2026-08-03T17:31:00-07:00").toLocaleString("en-US"),
      });
      expect(parseInboxStampMs(replied.time, NOW)).not.toBeNull();
      expect(inboxThreadSortMs(replied.id, replied.time)).toBeGreaterThan(
        inboxThreadSortMs("thread-other", "Jul 20, 2026"),
      );
    });

    it("falls back to a readable stamp when the reply stamp is unparseable", () => {
      // A non-en locale renders "3.8.2026, 18:31:00", which Date.parse cannot
      // read. Storing it raw would leave the thread unsortable.
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: "3.8.2026, 18:31:00",
      });
      expect(parseInboxStampMs(replied.time, NOW)).not.toBeNull();
      expect(replied.time).not.toBe("3.8.2026, 18:31:00");
    });

    it("floats the replied-to thread above an untouched newer thread", () => {
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: "Aug 3, 5:31 PM",
      });
      const other = inboxThreadSortMs("thread-other", "Aug 1, 2026");
      expect(inboxThreadSortMs(replied.id, replied.time)).toBeGreaterThan(other);
    });

    it("leaves the stamp alone when the reply carries none", () => {
      const replied = appendReplyToInboxThread(base, {
        id: "reply-1",
        from: "Manager",
        body: "On our way.",
        at: "",
      });
      expect(replied.time).toBe("Jul 20, 2026");
    });
  });
});

import { describe, expect, it } from "vitest";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { EMPTY_COMMUNICATION_THREAD_FILTERS } from "@/lib/communication-thread-filters";
import {
  buildResidentPlaceholderInboxItems,
  contactInboxThreadId,
  isContactInboxThreadId,
  parseContactInboxThreadId,
} from "@/lib/communication-resident-placeholders";

const RESIDENT: InboxScopedContact = {
  id: "res-1",
  name: "Alex Resident",
  email: "alex@example.com",
  role: "resident",
  propertyId: "mgr-oak-1",
  propertyLabel: "Oak House",
  tenancyStatus: "resident",
};

describe("communication resident placeholders", () => {
  it("round-trips contact thread ids", () => {
    expect(contactInboxThreadId("res-1")).toBe("contact-res-1");
    expect(parseContactInboxThreadId("contact-res-1")).toBe("res-1");
    expect(isContactInboxThreadId("contact-res-1")).toBe(true);
    expect(isContactInboxThreadId("thr-123")).toBe(false);
  });

  it("adds a placeholder when the resident has no occupied email thread", () => {
    const items = buildResidentPlaceholderInboxItems({
      contacts: [RESIDENT],
      filters: EMPTY_COMMUNICATION_THREAD_FILTERS,
      occupiedEmails: new Set(),
      listSegment: "active",
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Alex Resident");
    expect(items[0]?.preview).toBe("No messages yet.");
  });

  it("skips residents who already have a live conversation", () => {
    const items = buildResidentPlaceholderInboxItems({
      contacts: [RESIDENT],
      filters: EMPTY_COMMUNICATION_THREAD_FILTERS,
      occupiedEmails: new Set(["alex@example.com"]),
      listSegment: "active",
    });
    expect(items).toHaveLength(0);
  });

  it("respects the house filter", () => {
    const items = buildResidentPlaceholderInboxItems({
      contacts: [RESIDENT],
      filters: { propertyIds: ["mgr-maple-2"], roles: [], contactIds: [] },
      occupiedEmails: new Set(),
      listSegment: "active",
    });
    expect(items).toHaveLength(0);
  });

  it("does not add placeholders on the archived segment", () => {
    const items = buildResidentPlaceholderInboxItems({
      contacts: [RESIDENT],
      filters: EMPTY_COMMUNICATION_THREAD_FILTERS,
      occupiedEmails: new Set(),
      listSegment: "archived",
    });
    expect(items).toHaveLength(0);
  });
});

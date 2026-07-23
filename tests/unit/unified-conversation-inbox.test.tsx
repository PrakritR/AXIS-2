// @vitest-environment jsdom
//
// The manager Communication inbox is a single, unified, conversation-based list
// — NO Unopened / Opened / Sent / Trash / Schedule folder tabs. This locks in:
//
//  1. Live conversations (inbox + sent) show together in ONE list; archived
//     (trashed) conversations are reachable via a toggle, not a tab.
//  2. SMS conversations are gated behind `smsUiEnabled`. When off (default,
//     A2P not cleared) the SMS endpoint is never fetched and no SMS row shows;
//     when on, SMS rows join the same list. Transport is unaffected either way.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const EMAIL_INBOX = {
  id: "thr-2000000001",
  folder: "inbox",
  from: "Dana Ramirez",
  email: "dana@example.com",
  subject: "Parking spot question",
  preview: "Is there a parking spot available?",
  body: "Is there a parking spot available?",
  time: "Jul 20, 2026",
  unread: true,
};
const EMAIL_SENT = {
  id: "thr-2000000002",
  folder: "sent",
  from: "Property manager",
  email: "sam@example.com",
  subject: "Lease renewal",
  preview: "Your lease renews next month",
  body: "Your lease renews next month",
  time: "Jul 19, 2026",
  unread: false,
};
const EMAIL_TRASH = {
  id: "thr-2000000003",
  folder: "trash",
  from: "Old Flyer",
  email: "old@example.com",
  subject: "Discount inspection",
  preview: "cheap roof inspection",
  body: "cheap roof inspection",
  time: "Jul 01, 2026",
  unread: false,
};

const ALL_THREADS = [EMAIL_INBOX, EMAIL_SENT, EMAIL_TRASH];

const SMS_PAYLOAD = {
  workNumber: "+12065550999",
  residents: [
    {
      residentUserId: "res-1",
      residentEmail: "jordan@example.com",
      name: "Jordan Lee",
      phone: "+12065550142",
      propertyLabel: "Maple · 2A",
      conversationKey: "owner:resident:res-1",
      messages: [
        {
          id: "sms-1",
          direction: "inbound",
          body: "Can I swap my parking stall?",
          fromPhone: "+12065550142",
          toPhone: "+12065550999",
          messageSid: "SM1",
          source: "work_number",
          createdAt: "2026-07-20T17:00:00.000Z",
          storageTable: "inbound_sms_log",
        },
      ],
    },
  ],
};

vi.mock("@/lib/portal-inbox-storage", () => ({
  MANAGER_INBOX_STORAGE_KEY: "manager-inbox",
  PORTAL_INBOX_CHANGED_EVENT: "portal-inbox-changed",
  loadPersistedInbox: () => ALL_THREADS,
  inboxThreadSortMs: (id: string, t?: string) => {
    const m = String(id ?? "").match(/(\d{10,})/);
    if (m) return parseInt(m[1]!, 10);
    const p = Date.parse(t ?? "");
    return Number.isNaN(p) ? 0 : p;
  },
  inboxThreadMessages: (t: { id: string; from: string; body: string; time: string }) => [
    { id: `${t.id}-root`, from: t.from, body: t.body, at: t.time },
  ],
}));
vi.mock("@/components/portal/manager-inbox", () => ({
  ManagerInbox: () => <div data-testid="embedded-email-thread" />,
}));
vi.mock("@/components/portal/manager-sms-panel", () => ({ ManagerSmsPanel: () => <div /> }));

import { ManagerUnifiedInbox } from "@/components/portal/manager-unified-inbox";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("unified conversation inbox (no folder tabs)", () => {
  it("shows live inbox + sent conversations in one list and archives via a toggle", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<ManagerUnifiedInbox tabId="unopened" commBase="/portal/communication" />);

    // Inbox and sent conversations appear together — no folder segregation.
    expect(screen.getByText("Dana Ramirez")).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    // Trashed conversation is NOT in the default view.
    expect(screen.queryByText("Old Flyer")).toBeNull();

    // Archive is reachable without a tab.
    const toggle = document.querySelector('[data-attr="unified-inbox-archived-toggle"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText("Old Flyer")).toBeTruthy();
    expect(screen.queryByText("Dana Ramirez")).toBeNull();
  });

  it("never fetches SMS and shows no SMS row when the SMS UI flag is off (default)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(SMS_PAYLOAD), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ManagerUnifiedInbox tabId="unopened" commBase="/portal/communication" />);

    await waitFor(() => expect(screen.getByText("Dana Ramirez")).toBeTruthy());
    expect(screen.queryByText("Jordan Lee")).toBeNull();
    const calledSms = fetchMock.mock.calls.some(([url]) => String(url).includes("/api/manager/sms-conversations"));
    expect(calledSms).toBe(false);
  });

  it("shows SMS conversations alongside email when the SMS UI flag is on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(SMS_PAYLOAD), { status: 200 })));
    render(<ManagerUnifiedInbox tabId="unopened" commBase="/portal/communication" smsUiEnabled />);

    await waitFor(() => expect(screen.getByText("Jordan Lee")).toBeTruthy());
    expect(screen.getByText("Dana Ramirez")).toBeTruthy();
  });
});

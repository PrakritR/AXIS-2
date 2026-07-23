// @vitest-environment jsdom
//
// The RESIDENT Communication portal uses the SAME unified, conversation-based
// design as the manager side: no Unopened/Opened/Schedule/Sent/Trash folder
// tabs, one conversation list, an Archived toggle instead of a Trash tab, and
// SMS gated behind `smsUiEnabled` (default false) — correctly scoped to the
// resident's own conversations.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const EMAIL_INBOX = {
  id: "res-thr-1000000001",
  folder: "inbox",
  from: "Property manager",
  email: "manager@example.com",
  subject: "Welcome to your unit",
  preview: "Here is your move-in info",
  body: "Here is your move-in info",
  time: "Jul 20, 2026",
  unread: true,
};
const EMAIL_TRASH = {
  id: "res-thr-1000000002",
  folder: "trash",
  from: "Old notice",
  email: "old@example.com",
  subject: "Old",
  preview: "old",
  body: "old",
  time: "Jul 01, 2026",
  unread: false,
};

vi.mock("@/lib/portal-inbox-storage", () => ({
  PORTAL_INBOX_CHANGED_EVENT: "portal-inbox-changed",
  RESIDENT_INBOX_STORAGE_KEY: "resident-inbox",
  loadPersistedInbox: () => [EMAIL_INBOX, EMAIL_TRASH],
  inboxThreadMessages: (t: { id: string; from: string; body: string; time: string }) => [
    { id: `${t.id}-root`, from: t.from, body: t.body, at: t.time },
  ],
}));
vi.mock("@/components/portal/resident-inbox-panel", () => ({
  ResidentInboxPanel: () => <div data-testid="resident-thread" />,
}));
vi.mock("@/components/portal/role-sms-panel", () => ({ RoleSmsPanel: () => <div data-testid="role-sms" /> }));

import { ResidentCommunication } from "@/components/portal/resident-communication";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("resident conversation inbox (no folder tabs)", () => {
  it("shows no folder tabs, a unified list, and an archive toggle", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<ResidentCommunication />);

    const text = document.body.innerText;
    expect(/\bUnopened\b/.test(text)).toBe(false);
    expect(/\bSchedule\b/.test(text)).toBe(false);
    // The live conversation shows; the trashed one does not (until archived).
    expect(screen.getByText("Property manager")).toBeTruthy();
    expect(screen.queryByText("Old notice")).toBeNull();

    const toggle = document.querySelector('[data-attr="resident-inbox-archived-toggle"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText("Old notice")).toBeTruthy();
  });

  it("does not fetch SMS when the SMS UI flag is off (default)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResidentCommunication />);
    await waitFor(() => expect(screen.getByText("Property manager")).toBeTruthy());
    const calledSms = fetchMock.mock.calls.some(([url]) => String(url).includes("/api/resident/sms-conversations"));
    expect(calledSms).toBe(false);
  });
});

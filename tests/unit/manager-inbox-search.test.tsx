// @vitest-environment jsdom
//
// Manager inbox message search. Three things this locks in, all of which broke
// when the search was first ported from a base where the inbox still owned its
// own page shell:
//
//  1. The search box must render when Communication owns the shell
//     (`embeddedInCommunication`). That is the ONLY way the real manager portal
//     mounts the inbox — `/portal/inbox/*` redirects to Communication — so a
//     search box rendered only in the standalone shell is reachable from /demo
//     and nowhere else.
//  2. Search spans folders, so the destructive trash-tab row actions must not
//     follow the active tab into search mode. Otherwise a per-row "Delete" on
//     the Trash tab permanently deletes a live inbox message, with no confirm.
//  3. Rows must be labelled from their own folder, not the active tab, or a
//     sent thread surfaced from Unopened is shown as if its recipient sent it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const THREADS = [
  {
    id: "thr-1000000001",
    folder: "inbox",
    from: "Dana Ramirez",
    email: "dana@example.com",
    subject: "Roof leak in unit 2",
    preview: "There is water coming through the ceiling",
    body: "There is water coming through the ceiling",
    time: "Jul 20, 2026",
    unread: true,
  },
  {
    id: "thr-1000000002",
    folder: "sent",
    from: "Property manager",
    email: "sam@example.com",
    subject: "Re: roof repair scheduled",
    preview: "The roofer comes Thursday",
    body: "The roofer comes Thursday",
    time: "Jul 19, 2026",
    unread: false,
  },
  {
    id: "thr-1000000003",
    folder: "trash",
    from: "Old Sender",
    email: "old@example.com",
    subject: "Roof flyer",
    preview: "discount roof inspection",
    body: "discount roof inspection",
    time: "Jul 01, 2026",
    unread: false,
  },
  {
    id: "thr-1000000004",
    folder: "inbox",
    from: "Jordan Fox",
    email: "jordan@example.com",
    subject: "Parking spot question",
    preview: "Can I get a second spot",
    body: "Can I get a second spot",
    time: "Jul 18, 2026",
    unread: false,
  },
];

vi.mock("@/lib/portal-inbox-storage", () => ({
  MANAGER_INBOX_STORAGE_KEY: "manager-inbox",
  PORTAL_INBOX_CHANGED_EVENT: "portal-inbox-changed",
  loadPersistedInbox: () => THREADS,
  syncPersistedInboxFromServer: () => Promise.resolve(THREADS),
  persistInbox: () => {},
  persistInboxAwait: () => Promise.resolve(),
  invalidatePersistedInboxCache: () => {},
  inboxMutationInFlight: () => false,
  runInboxMutation: (fn: () => unknown) => fn(),
  stagePersistedInboxRows: () => {},
  upsertPersistedInboxRows: () => {},
  deleteInboxThreadIds: () => Promise.resolve(),
  inboxThreadMessages: () => [],
  appendReplyToInboxThread: () => THREADS,
}));

vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: "mgr-1", email: "mgr@example.com", ready: true }),
}));

vi.mock("@/lib/portal-nav-client", () => ({
  usePortalNavigate: () => () => {},
}));

vi.mock("@/lib/portal-base-path-client", () => ({
  usePaidPortalBasePath: () => "/portal",
}));

vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: () => {} }),
}));

vi.mock("@/components/portal/payment-schedule-ui", () => ({
  useScheduledPaymentMessages: () => ({ messages: [] }),
}));

vi.mock("@/components/portal/manager-inbox-schedule-panel", () => ({
  ManagerInboxSchedulePanel: () => null,
}));

vi.mock("@/lib/manager-inbox-contacts", () => ({
  buildManagerInboxLiveContacts: () => [],
}));

vi.mock("@/lib/demo/demo-session", () => ({
  isDemoModeActive: () => true,
}));

import { ManagerInbox } from "@/components/portal/manager-inbox";

afterEach(cleanup);

function searchBox() {
  return screen.getByLabelText("Search messages by sender, subject, or content");
}

describe("manager inbox search", () => {
  it("renders the search box when Communication owns the shell", () => {
    render(<ManagerInbox tabId="unopened" embeddedInCommunication externalTitleActions suppressCompose commBase="/portal/communication" />);
    expect(searchBox()).toBeTruthy();
  });

  it("renders the search box in the standalone shell too", () => {
    render(<ManagerInbox tabId="unopened" />);
    expect(searchBox()).toBeTruthy();
  });

  it("matches across folders, excluding trash, ranked sender > subject > body", () => {
    render(<ManagerInbox tabId="unopened" embeddedInCommunication externalTitleActions suppressCompose />);
    fireEvent.change(searchBox(), { target: { value: "roof" } });

    // Inbox + sent match; the trash thread whose subject also says "Roof" does not.
    expect(screen.getAllByText(/2 messages matching/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Roof flyer")).toBeNull();
  });

  it("labels each search row from its own folder, not the active tab", () => {
    render(<ManagerInbox tabId="unopened" embeddedInCommunication externalTitleActions suppressCompose />);
    fireEvent.change(searchBox(), { target: { value: "roof" } });

    // Mixed list gets a neutral column header...
    expect(screen.getAllByText("From / To").length).toBeGreaterThan(0);
    // ...and the sent thread is shown by recipient, explicitly marked "To:",
    // rather than looking like a message Sam sent to the manager.
    expect(screen.getAllByText("To: sam@example.com").length).toBeGreaterThan(0);
  });

  it("never offers permanent delete on a search row opened from the Trash tab", () => {
    render(<ManagerInbox tabId="trash" embeddedInCommunication externalTitleActions suppressCompose />);
    fireEvent.change(searchBox(), { target: { value: "roof" } });

    // The rows on screen are live inbox/sent messages, so the trash-only
    // Restore / Delete-forever actions must be gone.
    const rows = screen.getAllByText("Roof leak in unit 2");
    fireEvent.click(rows[0]!);

    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Trash" }).length).toBeGreaterThan(0);
  });

  it("keeps the trash tab's own actions when no search is active", () => {
    render(<ManagerInbox tabId="trash" embeddedInCommunication externalTitleActions suppressCompose />);

    const rows = screen.getAllByText("Roof flyer");
    fireEvent.click(rows[0]!);

    expect(screen.getAllByRole("button", { name: "Restore" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(0);
  });

  it("clears back to the plain tab list", () => {
    render(<ManagerInbox tabId="unopened" embeddedInCommunication externalTitleActions suppressCompose />);
    fireEvent.change(searchBox(), { target: { value: "roof" } });
    expect(screen.getAllByText(/messages matching/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(screen.queryByText(/messages matching/)).toBeNull();
    // Back to Unopened: the unread inbox thread, and not the sent one.
    expect(screen.getAllByText("Roof leak in unit 2").length).toBeGreaterThan(0);
    expect(screen.queryByText("Re: roof repair scheduled")).toBeNull();
  });
});

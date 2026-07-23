// @vitest-environment jsdom
//
// The unified Communication inbox owns its folder badges. The panels it embeds
// (ManagerInbox for an open email thread) only ever count EMAIL, so forwarding
// their counts upward drops the SMS half of every badge the moment a thread pane
// mounts — the badges then flip back on the next 20s poll, i.e. they oscillate.
// This locks the parent as the single source of the counts.
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

const EMAIL_THREAD = {
  id: "thr-2000000001",
  folder: "inbox",
  from: "Dana Ramirez",
  email: "dana@example.com",
  subject: "Parking spot question",
  preview: "Hi, is there a parking spot available this month?",
  body: "Hi, is there a parking spot available this month?",
  time: "Jul 20, 2026",
  unread: true,
};

const SMS_PAYLOAD = {
  workNumber: "+12065550999",
  personalPhone: null,
  phoneVerified: true,
  forwardInbound: false,
  smsConfigured: true,
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
  loadPersistedInbox: () => [EMAIL_THREAD],
  inboxThreadMessages: () => [{ id: "m1", from: "Dana Ramirez", body: EMAIL_THREAD.body, at: "2026-07-20T16:00:00.000Z" }],
}));

// Stand-in for the embedded email panel: it emits the EMAIL-ONLY counts the real
// ManagerInbox emits, which is exactly what must not reach the parent's badges.
vi.mock("@/components/portal/manager-inbox", () => ({
  ManagerInbox: ({
    onTabCountsChange,
  }: {
    onTabCountsChange?: (c: { unopened: number; opened: number; schedule: number; sent: number; trash: number }) => void;
  }) => {
    useEffect(() => {
      onTabCountsChange?.({ unopened: 1, opened: 0, schedule: 4, sent: 0, trash: 0 });
    }, [onTabCountsChange]);
    return <div data-testid="embedded-email-thread" />;
  },
}));
vi.mock("@/components/portal/manager-sms-panel", () => ({ ManagerSmsPanel: () => <div /> }));

import { ManagerUnifiedInbox } from "@/components/portal/manager-unified-inbox";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("unified Communication tab counts", () => {
  it("keeps the SMS contribution when an embedded email thread pane reports email-only counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(SMS_PAYLOAD), { status: 200 })),
    );

    const counts: { unopened: number; schedule: number }[] = [];
    render(
      <ManagerUnifiedInbox
        tabId="unopened"
        commBase="/portal/communication"
        onTabCountsChange={(c) => counts.push({ unopened: c.unopened, schedule: c.schedule })}
      />,
    );

    // One unread email + one unread SMS thread.
    await waitFor(() => expect(counts.at(-1)?.unopened).toBe(2));
    const beforeOpen = counts.length;

    fireEvent.click(screen.getByText("Dana Ramirez"));
    expect(await screen.findByTestId("embedded-email-thread")).toBeTruthy();

    // The embedded panel said "unopened: 1" — the badge must still read 2, and
    // its schedule count (which only that panel knows) must be adopted.
    await waitFor(() => expect(counts.at(-1)?.schedule).toBe(4));
    expect(counts.slice(beforeOpen - 1).every((c) => c.unopened === 2)).toBe(true);
  });
});

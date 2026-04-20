"use client";

import { useMemo, useState } from "react";
import { ManagerSectionShell } from "./manager-section-shell";
import {
  inboxTabItems,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "./portal-inbox-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { TabNav } from "@/components/ui/tabs";

type DemoThread = {
  id: string;
  category: string;
  from: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
};

const threads: DemoThread[] = [
  {
    id: "t1",
    category: "priority",
    from: "Sofia Nguyen",
    email: "sofia.nguyen@example.com",
    subject: "Lease packet question before signing",
    preview: "I’m ready to sign today, but I want to confirm the move-in utilities section...",
    time: "9:14 AM",
    unread: true,
  },
  {
    id: "t2",
    category: "applications",
    from: "Leasing Bot",
    email: "bot@axishousing.com",
    subject: "Two new applications need review",
    preview: "Pioneer Heights received two new applications with complete screening data.",
    time: "8:32 AM",
    unread: true,
  },
  {
    id: "t3",
    category: "vendors",
    from: "Northside Plumbing",
    email: "dispatch@northside.example.com",
    subject: "Kitchen leak appointment confirmed",
    preview: "Our tech can be onsite tomorrow at 11:00 AM for Marina Commons room 7.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "t4",
    category: "residents",
    from: "Lila Chen",
    email: "lila.chen@example.com",
    subject: "Move-in checklist completed",
    preview: "I uploaded the checklist and pet paperwork. Let me know what’s next.",
    time: "Yesterday",
    unread: false,
  },
];

function toRows(list: DemoThread[]): PortalInboxTableRow[] {
  return list.map((t) => ({
    id: t.id,
    name: t.from,
    email: t.email,
    topic: t.subject,
    preview: t.preview,
    whenLabel: t.time,
    read: !t.unread,
  }));
}

export function ManagerInbox({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const [local, setLocal] = useState(() => threads.map((t) => ({ ...t })));

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened") return local.filter((t) => t.unread);
    if (tabId === "opened") return local.filter((t) => !t.unread);
    return [];
  }, [local, tabId]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    showToast("Marked as read.");
  };

  const emptyCopy =
    tabId === "sent" || tabId === "trash"
      ? "Nothing to show yet"
      : tabId === "opened" && rowsForTab.length === 0
        ? "No opened messages yet"
        : "No messages yet";

  const tabs = inboxTabItems("/manager");

  return (
    <ManagerSectionShell
      title="Inbox"
      actions={[
        {
          label: "New message",
          variant: "primary",
          onClick: () => showToast("Compose is not wired yet — this is a demo inbox."),
        },
        { label: "Refresh", variant: "outline", onClick: () => showToast("Refreshed inbox.") },
      ]}
    >
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "sent" || tabId === "trash" ? (
          <PortalInboxEmptyState title={emptyCopy} />
        ) : rowsForTab.length === 0 ? (
          <PortalInboxEmptyState
            title={emptyCopy}
            hint={
              tabId === "unopened" ? (
                <p className="max-w-md">Messages from applicants, residents, and vendors appear here.</p>
              ) : undefined
            }
          />
        ) : (
          <PortalInboxMessageTable rows={toRows(rowsForTab)} onMarkRead={markRead} />
        )}
      </div>
    </ManagerSectionShell>
  );
}

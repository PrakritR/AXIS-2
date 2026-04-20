"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import {
  INBOX_TAB_DEFS,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "./portal-inbox-ui";

type DemoThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  from: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
};

const initialThreads: DemoThread[] = [
  {
    id: "t1",
    folder: "inbox",
    from: "Sofia Nguyen",
    email: "sofia.nguyen@example.com",
    subject: "Lease packet question before signing",
    preview: "I’m ready to sign today, but I want to confirm the move-in utilities section...",
    time: "9:14 AM",
    unread: true,
  },
  {
    id: "t2",
    folder: "inbox",
    from: "Leasing Bot",
    email: "bot@axishousing.com",
    subject: "Two new applications need review",
    preview: "Pioneer Heights received two new applications with complete screening data.",
    time: "8:32 AM",
    unread: true,
  },
  {
    id: "t3",
    folder: "inbox",
    from: "Northside Plumbing",
    email: "dispatch@northside.example.com",
    subject: "Kitchen leak appointment confirmed",
    preview: "Our tech can be onsite tomorrow at 11:00 AM for Marina Commons room 7.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "t4",
    folder: "inbox",
    from: "Lila Chen",
    email: "lila.chen@example.com",
    subject: "Move-in checklist completed",
    preview: "I uploaded the checklist and pet paperwork. Let me know what’s next.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "s1",
    folder: "sent",
    from: "Marina Commons (you)",
    email: "manager@marina.example.com",
    subject: "Re: Vendor schedule — approved",
    preview: "Approved for Tuesday; please coordinate access with the resident.",
    time: "Mon",
    unread: false,
  },
  {
    id: "x1",
    folder: "trash",
    from: "Old Vendor Co.",
    email: "noreply@oldvendor.example.com",
    subject: "Service contract renewal",
    preview: "We’re reaching out about renewing your annual maintenance plan.",
    time: "Apr 2",
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

function countThreads(threads: DemoThread[]) {
  return {
    unopened: threads.filter((t) => t.folder === "inbox" && t.unread).length,
    opened: threads.filter((t) => t.folder === "inbox" && !t.unread).length,
    sent: threads.filter((t) => t.folder === "sent").length,
    trash: threads.filter((t) => t.folder === "trash").length,
  };
}

export function ManagerInbox({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const [local, setLocal] = useState(() => initialThreads.map((t) => ({ ...t })));

  const counts = useMemo(() => countThreads(local), [local]);
  const tabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    [counts],
  );

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened") return local.filter((t) => t.folder === "inbox" && t.unread);
    if (tabId === "opened") return local.filter((t) => t.folder === "inbox" && !t.unread);
    if (tabId === "sent") return local.filter((t) => t.folder === "sent");
    if (tabId === "trash") return local.filter((t) => t.folder === "trash");
    return [];
  }, [local, tabId]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    showToast("Marked as read.");
  };

  const emptyCopy =
    tabId === "sent" && rowsForTab.length === 0
      ? "No sent messages yet"
      : tabId === "trash" && rowsForTab.length === 0
        ? "Trash is empty"
        : tabId === "opened" && rowsForTab.length === 0
          ? "No opened messages yet"
          : tabId === "unopened" && rowsForTab.length === 0
            ? "No unopened messages"
            : "No messages yet";

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => showToast("Compose is not wired yet — this is a demo inbox.")}>
            New message
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed inbox.")}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <ManagerPortalStatusPills
          activeTone="primary"
          tabs={tabs}
          activeId={tabId}
          onChange={(id) => router.push(`/manager/inbox/${id}`)}
        />
      }
    >
      {rowsForTab.length === 0 ? (
        <PortalInboxEmptyState
          title={emptyCopy}
          hint={
            tabId === "unopened" ? (
              <p className="max-w-md">Messages from applicants, residents, and vendors appear here.</p>
            ) : undefined
          }
        />
      ) : (
        <PortalInboxMessageTable
          rows={toRows(rowsForTab)}
          onMarkRead={tabId === "unopened" ? markRead : undefined}
        />
      )}
    </ManagerPortalPageShell>
  );
}

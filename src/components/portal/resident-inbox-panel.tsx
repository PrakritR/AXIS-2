"use client";

import { useMemo, useState } from "react";
import {
  inboxTabItems,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "@/components/portal/portal-inbox-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { TabNav } from "@/components/ui/tabs";
import { demoResidentInboxThreads } from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

function toRows(
  list: { id: string; from: string; email: string; subject: string; preview: string; when: string; unread: boolean }[],
): PortalInboxTableRow[] {
  return list.map((t) => ({
    id: t.id,
    name: t.from,
    email: t.email,
    topic: t.subject,
    preview: t.preview,
    whenLabel: t.when,
    read: !t.unread,
  }));
}

export function ResidentInboxPanel({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const [threads, setThreads] = useState(() => demoResidentInboxThreads.map((t) => ({ ...t })));

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened") return threads.filter((t) => t.unread);
    if (tabId === "opened") return threads.filter((t) => !t.unread);
    return [];
  }, [threads, tabId]);

  const markRead = (id: string) => {
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    showToast("Marked as read.");
  };

  const emptyCopy =
    tabId === "sent" || tabId === "trash"
      ? "Nothing to show yet"
      : tabId === "opened" && rowsForTab.length === 0
        ? "No opened messages yet"
        : "No messages yet";

  const tabs = inboxTabItems("/resident");

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
                <p className="max-w-md">Notices from your property team and maintenance will appear here.</p>
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

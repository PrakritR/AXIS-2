"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import {
  inboxTabItems,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "@/components/portal/portal-inbox-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { TabNav } from "@/components/ui/tabs";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  markPartnerInboxMessageRead,
  readPartnerInboxMessages,
  type PartnerInboxMessage,
} from "@/lib/demo-admin-partner-inbox";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function toTableRows(messages: PartnerInboxMessage[]): PortalInboxTableRow[] {
  return messages.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    topic: row.topic,
    preview: row.body,
    whenLabel: formatWhen(row.createdAt),
    read: row.read,
  }));
}

export function AdminInboxClient({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed inbox.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const all = useMemo(() => readPartnerInboxMessages(), [tick]);

  const rows = useMemo(() => {
    if (tabId === "unopened") return all.filter((m) => !m.read);
    if (tabId === "opened") return all.filter((m) => m.read);
    return [] as PartnerInboxMessage[];
  }, [all, tabId]);

  const shellActions = [
    {
      label: "New message",
      variant: "primary" as const,
      onClick: () => showToast("Compose is not wired yet — partners reach you from axishousing.com/partner/contact."),
    },
    { label: "Refresh", variant: "outline" as const, onClick: refresh },
  ];

  const emptyCopy =
    tabId === "sent" || tabId === "trash"
      ? "Nothing to show yet"
      : tabId === "opened" && rows.length === 0
        ? "No opened messages yet"
        : "No partner messages yet";

  const tabs = inboxTabItems("/admin");

  return (
    <ManagerSectionShell title="Inbox" actions={shellActions}>
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "sent" || tabId === "trash" ? (
          <PortalInboxEmptyState title={emptyCopy} />
        ) : rows.length === 0 ? (
          <PortalInboxEmptyState
            title={emptyCopy}
            hint={
              tabId === "unopened" ? (
                <p className="max-w-md">Partner inquiries sent from the public contact page appear here.</p>
              ) : undefined
            }
          />
        ) : (
          <PortalInboxMessageTable
            rows={toTableRows(rows)}
            onMarkRead={(id) => {
              if (markPartnerInboxMessageRead(id)) {
                showToast("Marked as read.");
                setTick((t) => t + 1);
              }
            }}
          />
        )}
      </div>
    </ManagerSectionShell>
  );
}

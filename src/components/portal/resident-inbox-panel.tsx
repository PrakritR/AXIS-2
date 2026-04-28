"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "@/components/portal/portal-inbox-ui";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import { appendPersistedInboxThread, MANAGER_INBOX_STORAGE_KEY } from "@/lib/portal-inbox-storage";
import type { DemoResidentInboxThread } from "@/data/demo-portal";

let residentSentRows: DemoResidentInboxThread[] = [];

function readSentRows(): DemoResidentInboxThread[] {
  return residentSentRows;
}

function writeSentRows(rows: DemoResidentInboxThread[]) {
  if (typeof window === "undefined") return;
  residentSentRows = rows;
  window.dispatchEvent(new Event("axis-resident-inbox"));
}

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

function previewLine(body: string, max = 100) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function ResidentInboxPanel({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const [threads, setThreads] = useState<DemoResidentInboxThread[]>([]);
  const [sent, setSent] = useState<DemoResidentInboxThread[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setSent(readSentRows());
    const sync = () => setSent(readSentRows());
    window.addEventListener("axis-resident-inbox", sync);
    return () => window.removeEventListener("axis-resident-inbox", sync);
  }, []);

  useEffect(() => {
    writeSentRows(sent);
  }, [sent]);

  const trashCount = 0;

  const counts = useMemo(
    () => ({
      unopened: threads.filter((t) => t.unread).length,
      opened: threads.filter((t) => !t.unread).length,
      sent: sent.length,
      trash: trashCount,
    }),
    [threads, sent, trashCount],
  );

  const tabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    [counts],
  );

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened") return threads.filter((t) => t.unread);
    if (tabId === "opened") return threads.filter((t) => !t.unread);
    if (tabId === "sent") return sent;
    return [];
  }, [threads, sent, tabId]);

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of threads) m[t.id] = t.body;
    for (const t of sent) m[t.id] = t.body;
    return m;
  }, [threads, sent]);

  const markRead = (id: string) => {
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    showToast("Marked as read.");
  };

  const handleComposeSend = useCallback(
    (p: ScopedInboxSendPayload) => {
      const when = new Date().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      if (p.kind === "admin") {
        appendPortalMessageToAdminInbox({
          role: "resident",
          name: p.senderName,
          email: p.senderEmail,
          topic: p.subject.trim(),
          body: p.body.trim(),
        });
      }
      const row: DemoResidentInboxThread = {
        id: `sent_${Date.now()}`,
        from: "You",
        email: p.kind === "admin" ? "Axis admin team" : p.toEmailLine,
        subject: p.subject.trim(),
        preview: previewLine(p.body),
        when,
        unread: false,
        body: p.body.trim(),
      };
      if (p.kind === "peer") {
        appendPersistedInboxThread(
          MANAGER_INBOX_STORAGE_KEY,
          {
            id: `inbox_resident_${Date.now()}`,
            folder: "inbox",
            from: "Resident",
            email: "resident@example.com",
            subject: p.subject.trim(),
            preview: previewLine(p.body),
            body: p.body.trim(),
            time: when,
            unread: true,
          },
          [],
        );
      }
      setSent((prev) => [row, ...prev]);
      setComposeOpen(false);
      showToast(p.kind === "admin" ? "Message sent to the admin team." : "Message sent.");
      router.push("/resident/inbox/sent");
      router.refresh();
    },
    [router, showToast],
  );

  const refreshInbox = () => {
    showToast("Inbox refreshed.");
  };

  const emptyCopy =
    tabId === "trash"
      ? "Nothing to show yet"
      : tabId === "sent" && rowsForTab.length === 0
        ? "No sent messages yet"
        : tabId === "opened" && rowsForTab.length === 0
          ? "No opened messages yet"
          : "No messages yet";

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setComposeOpen(true)}>
            New message
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refreshInbox}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <ManagerPortalStatusPills
          activeTone="primary"
          tabs={tabs}
          activeId={tabId}
          onChange={(id) => router.push(`/resident/inbox/${id}`)}
        />
      }
    >
      <ScopedInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
        portal="resident"
        senderName="Resident"
        senderEmail="resident@example.com"
      />

      {tabId === "trash" ? (
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
        <PortalInboxMessageTable
          rows={toRows(rowsForTab)}
          onMarkRead={tabId === "unopened" ? markRead : undefined}
          getDetailBody={(row) => bodyById[row.id]}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
        />
      )}
    </ManagerPortalPageShell>
  );
}

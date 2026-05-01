"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "@/components/portal/portal-inbox-ui";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { demoResidentInboxThreads } from "@/data/demo-portal";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  appendPersistedInboxThread,
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  type PersistedInboxThread,
  persistInbox,
  loadPersistedInbox,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

type InboxThread = PersistedInboxThread;

/** Stable seed when localStorage is empty (matches demo-portal resident inbox seeds). */
export const RESIDENT_INBOX_THREAD_FALLBACK: PersistedInboxThread[] = demoResidentInboxThreads.map((t) => ({
  id: t.id,
  folder: "inbox" as const,
  from: t.from,
  email: t.email,
  subject: t.subject,
  preview: t.preview,
  body: t.body,
  time: t.when,
  unread: t.unread,
}));

function previewLine(body: string, max = 100) {
  const x = body.trim().replace(/\s+/g, " ");
  if (x.length <= max) return x;
  return `${x.slice(0, max)}…`;
}

function toRows(list: InboxThread[]): PortalInboxTableRow[] {
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

function countThreads(threads: InboxThread[]) {
  return {
    unopened: threads.filter((t) => t.folder === "inbox" && t.unread).length,
    opened: threads.filter((t) => t.folder === "inbox" && !t.unread).length,
    sent: threads.filter((t) => t.folder === "sent").length,
    trash: threads.filter((t) => t.folder === "trash").length,
  };
}

export function ResidentInboxPanel({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const [local, setLocal] = useState<InboxThread[]>(
    () => loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK) as InboxThread[],
  );
  const [persistReady] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    void syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY).then((rows) => setLocal(rows as InboxThread[]));
  }, []);

  useEffect(() => {
    const sync = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const ce = evt as CustomEvent<{ key?: string }>;
        if (ce.detail?.key && ce.detail.key !== RESIDENT_INBOX_STORAGE_KEY) return;
      }
      setLocal(loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK) as InboxThread[]);
    };
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    persistInbox(RESIDENT_INBOX_STORAGE_KEY, local);
  }, [local, persistReady]);

  const counts = useMemo(() => countThreads(local), [local]);

  const tabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    [counts],
  );

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened") return local.filter((t) => t.folder === "inbox" && t.unread);
    if (tabId === "opened") return local.filter((t) => t.folder === "inbox" && !t.unread);
    if (tabId === "sent") return local.filter((t) => t.folder === "sent");
    return [];
  }, [local, tabId]);

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
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
      if (p.includesAxisAdmin) {
        appendPortalMessageToAdminInbox({
          role: "resident",
          name: p.senderName,
          email: p.senderEmail,
          topic: p.subject.trim(),
          body: p.body.trim(),
        });
      }
      const id = `sent_${Date.now()}`;
      const row: InboxThread = {
        id,
        folder: "sent",
        from: "You",
        email: p.toEmailLine,
        subject: p.subject.trim(),
        preview: previewLine(p.body),
        body: p.body.trim(),
        time: when,
        unread: false,
      };
      if (p.includesDirectoryRecipients) {
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
      setLocal((prev) => [row, ...prev]);
      setComposeOpen(false);
      showToast(
        p.includesAxisAdmin && !p.includesDirectoryRecipients
          ? "Message sent to Axis Housing admin."
          : "Message sent.",
      );
      router.push("/resident/inbox/sent");
      router.refresh();
    },
    [router, showToast],
  );

  const refreshInbox = () => {
    void syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
      setLocal(rows as InboxThread[]);
      showToast("Inbox refreshed.");
    });
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

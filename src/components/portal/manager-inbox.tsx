"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  loadPersistedInbox,
  persistInbox,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "./portal-inbox-ui";

type InboxThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
};

function previewLine(body: string, max = 100) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
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

export function ManagerInbox({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const portalBase = usePaidPortalBasePath();
  const [local, setLocal] = useState<InboxThread[]>(() => loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[]);
  const [persistReady] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY).then((rows) => setLocal(rows as InboxThread[]));
  }, []);

  useEffect(() => {
    const sync = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const ce = evt as CustomEvent<{ key?: string }>;
        if (ce.detail?.key && ce.detail.key !== MANAGER_INBOX_STORAGE_KEY) return;
      }
      setLocal(loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[]);
    };
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    persistInbox(MANAGER_INBOX_STORAGE_KEY, local);
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
    if (tabId === "trash") return local.filter((t) => t.folder === "trash");
    return [];
  }, [local, tabId]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    setExpandedId((e) => (e === id ? null : e));
    showToast("Marked as read.");
  };

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const moveToTrash = (id: string) => {
    setLocal((prev) =>
      prev.map((t) => (t.id === id && (t.folder === "inbox" || t.folder === "sent") ? { ...t, folder: "trash" as const, unread: false } : t)),
    );
    setExpandedId((e) => (e === id ? null : e));
    showToast("Moved to trash.");
  };

  const restoreFromTrash = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "trash" ? { ...t, folder: "inbox" as const, unread: false } : t)));
    setExpandedId((e) => (e === id ? null : e));
    showToast("Restored to inbox.");
  };

  const deleteForever = (id: string) => {
    setLocal((prev) => prev.filter((t) => t.id !== id));
    setExpandedId((e) => (e === id ? null : e));
    showToast("Message deleted.");
  };

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
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
          role: "manager",
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
        email: p.kind === "admin" ? "prakritramachandran@gmail.com" : p.toEmailLine,
        subject: p.subject.trim(),
        preview: previewLine(p.body),
        body: p.body.trim(),
        time: when,
        unread: false,
      };
      setLocal((prev) => [row, ...prev]);
      setComposeOpen(false);
      showToast(p.kind === "admin" ? "Message sent to prakritramachandran@gmail.com." : "Message sent.");
      router.push(`${portalBase}/inbox/sent`);
    },
    [router, showToast, portalBase],
  );

  const refreshInbox = () => {
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
      setLocal(rows as InboxThread[]);
      showToast("Inbox refreshed.");
    });
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
          onChange={(id) => router.push(`${portalBase}/inbox/${id}`)}
        />
      }
    >
      <ScopedInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
        portal="manager"
        senderName="Property manager"
        senderEmail="manager@example.com"
      />

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
          getDetailBody={(row) => bodyById[row.id]}
          expandedId={expandedId}
          onToggleExpand={toggleExpand}
          renderExtraActions={(row) => {
            if (tabId === "trash") {
              return (
                <>
                  <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs" onClick={() => restoreFromTrash(row.id)}>
                    Restore
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-rose-200 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-50"
                    onClick={() => deleteForever(row.id)}
                  >
                    Delete
                  </Button>
                </>
              );
            }
            return (
              <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs" onClick={() => moveToTrash(row.id)}>
                Trash
              </Button>
            );
          }}
        />
      )}
    </ManagerPortalPageShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "@/components/portal/portal-inbox-ui";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PORTAL_DETAIL_BTN } from "@/components/portal/portal-data-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { demoResidentInboxThreads } from "@/data/demo-portal";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  appendPersistedInboxThread,
  PORTAL_INBOX_CHANGED_EVENT,
  type PersistedInboxThread,
  deleteInboxThreadIds,
  invalidatePersistedInboxCache,
  inboxMutationInFlight,
  persistInbox,
  persistInboxAwait,
  loadPersistedInbox,
  RESIDENT_INBOX_STORAGE_KEY,
  runInboxMutation,
  stagePersistedInboxRows,
  syncPersistedInboxFromServer,
  upsertPersistedInboxRows,
  inboxThreadMessages,
  appendReplyToInboxThread,
  type InboxThreadMessage,
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

function toRows(list: InboxThread[], tabId: string): PortalInboxTableRow[] {
  return list.map((t) => ({
    id: t.id,
    name: tabId === "sent" ? (t.email || "Unknown recipient") : t.from,
    email: tabId === "sent" ? (t.from ? `From ${t.from}` : "") : t.email,
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
  const [persistReady, setPersistReady] = useState(false);
  const persistInboxRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    persistInboxRef.current = false;
    void syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY).then((rows) => {
      if (!inboxMutationInFlight()) {
        setLocal(rows as InboxThread[]);
      }
      setPersistReady(true);
      if (!inboxMutationInFlight()) {
        persistInboxRef.current = true;
      }
    });
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
    if (!persistReady || !persistInboxRef.current) return;
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
    if (tabId === "trash") return local.filter((t) => t.folder === "trash");
    return [];
  }, [local, tabId]);

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    showToast("Marked as read — view in Opened tab.");
  };

  const markUnread = useCallback(
    (id: string) => {
      setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: true } : t)));
      showToast("Marked as unread.");
    },
    [showToast],
  );

  function inferPreviousFolder(t: InboxThread): "inbox" | "sent" {
    if (t.previousFolder) return t.previousFolder;
    if (/^(sent_|msg_|welcome_)/.test(t.id)) return "sent";
    return "inbox";
  }

  const moveToTrash = useCallback(
    (id: string) => {
      void runInboxMutation(async () => {
        persistInboxRef.current = false;
        try {
          const prev = loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK) as InboxThread[];
          const target = prev.find((t) => t.id === id);
          if (!target || target.folder === "trash" || (target.folder !== "inbox" && target.folder !== "sent")) return;
          const updated: InboxThread = {
            ...target,
            folder: "trash",
            previousFolder: target.folder,
            unread: false,
          };
          const next = prev.map((t) => (t.id === id ? updated : t));
          stagePersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, next);
          setLocal(next);
          setExpandedId(null);
          const ok = await upsertPersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, [updated], next);
          if (!ok) {
            stagePersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, prev);
            setLocal(prev);
            showToast("Could not move message to trash.");
            return;
          }
          showToast("Moved to trash.");
        } finally {
          persistInboxRef.current = true;
        }
      });
    },
    [showToast],
  );

  const restoreFromTrash = useCallback(
    (id: string) => {
      void runInboxMutation(async () => {
        persistInboxRef.current = false;
        try {
          const prev = loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK) as InboxThread[];
          const target = prev.find((t) => t.id === id && t.folder === "trash");
          if (!target) return;
          const dest = inferPreviousFolder(target);
          const updated: InboxThread = {
            ...target,
            folder: dest,
            previousFolder: undefined,
            unread: dest === "inbox" ? target.unread : false,
          };
          const next = prev.map((t) => (t.id === id ? updated : t));
          stagePersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, next);
          setLocal(next);
          setExpandedId(null);
          const ok = await upsertPersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, [updated], next);
          if (!ok) {
            stagePersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, prev);
            setLocal(prev);
            showToast("Could not restore message.");
            return;
          }
          showToast("Restored.");
        } finally {
          persistInboxRef.current = true;
        }
      });
    },
    [showToast],
  );

  const deleteForever = useCallback(
    (id: string) => {
      void (async () => {
        invalidatePersistedInboxCache(RESIDENT_INBOX_STORAGE_KEY);
        const ok = await deleteInboxThreadIds([id]);
        if (!ok) {
          showToast("Could not delete message.");
          return;
        }
        const next = local.filter((t) => t.id !== id);
        persistInboxRef.current = false;
        setLocal(next);
        setExpandedId(null);
        await persistInboxAwait(RESIDENT_INBOX_STORAGE_KEY, next);
        const deletedIds = new Set([id]);
        const synced = await syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY, { force: true, excludeIds: deletedIds });
        setLocal((synced as InboxThread[]).filter((t) => !deletedIds.has(t.id)));
        persistInboxRef.current = true;
        showToast("Deleted permanently.");
      })();
    },
    [local, showToast],
  );

  const emptyTrash = useCallback(() => {
    const trashItems = local.filter((t) => t.folder === "trash");
    if (trashItems.length === 0) {
      showToast("Trash is already empty.");
      return;
    }
    if (!window.confirm(`Delete all ${trashItems.length} trash message${trashItems.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    void (async () => {
      invalidatePersistedInboxCache(RESIDENT_INBOX_STORAGE_KEY);
      const ids = trashItems.map((t) => t.id).filter(Boolean);
      const ok = await deleteInboxThreadIds(ids);
      if (!ok) {
        showToast("Could not empty trash.");
        return;
      }
      const next = local.filter((t) => t.folder !== "trash");
      persistInboxRef.current = false;
      setLocal(next);
      setExpandedId(null);
      await persistInboxAwait(RESIDENT_INBOX_STORAGE_KEY, next);
      const deletedIds = new Set(ids);
      const synced = await syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY, { force: true, excludeIds: deletedIds });
      setLocal((synced as InboxThread[]).filter((t) => !deletedIds.has(t.id)));
      persistInboxRef.current = true;
      showToast("Trash emptied.");
    })().catch(() => showToast("Could not empty trash."));
  }, [local, showToast]);

  const handleComposeSend = useCallback(
    (p: ScopedInboxSendPayload) => {
      if (p.includesAxisAdmin) {
        appendPortalMessageToAdminInbox({
          role: "resident",
          name: p.senderName,
          email: p.senderEmail,
          topic: p.subject.trim(),
          body: p.body.trim(),
        });
      }
      setComposeOpen(false);

      void (async () => {
        try {
          if (p.includesDirectoryRecipients) {
            const res = await fetch("/api/portal/send-inbox-message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                fromName: p.senderName,
                fromEmail: p.senderEmail,
                toEmails: p.directRecipientEmailLine.split(";").map((e) => e.trim()).filter(Boolean),
                toBroadcast: p.broadcastCategories,
                subject: p.subject.trim(),
                text: p.body.trim(),
                deliverToPortalInbox: true,
                deliverViaEmail: p.deliverViaEmail !== false,
                deliverViaSms: p.deliverViaSms,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
            if (!res.ok || !data.ok) {
              showToast("Message could not be sent.");
              return;
            }
          }
          invalidatePersistedInboxCache(RESIDENT_INBOX_STORAGE_KEY);
          const rows = await syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY, { force: true });
          setLocal(rows as InboxThread[]);
          showToast(
            p.includesAxisAdmin && !p.includesDirectoryRecipients
              ? "Message sent to Axis admin."
              : "Message sent via inbox and email.",
          );
          router.push("/resident/inbox/sent");
        } catch {
          showToast("Message could not be sent.");
        }
      })();
    },
    [router, showToast],
  );

  const handleReply = useCallback(
    async (row: PortalInboxTableRow, text: string) => {
      const thread = local.find((t) => t.id === row.id);
      if (!thread) return;
      const reply: InboxThreadMessage = {
        id: `reply-${Date.now().toString(36)}`,
        from: "Resident",
        body: text,
        at: new Date().toLocaleString(),
      };
      const updated = appendReplyToInboxThread(thread, reply);
      const next = local.map((t) => (t.id === thread.id ? updated : t));
      persistInboxRef.current = false;
      setLocal(next);
      const ok = await upsertPersistedInboxRows(RESIDENT_INBOX_STORAGE_KEY, [updated], next);
      persistInboxRef.current = true;
      if (!ok) {
        setLocal(local);
        throw new Error("persist failed");
      }
      const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;
      await fetch("/api/portal/send-inbox-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          threadId: thread.id,
          subject,
          text,
          toEmails: [thread.email],
          deliverToPortalInbox: true,
        }),
      });
      void syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY, { force: true });
    },
    [local],
  );

  const renderExtraActions = useCallback(
    (row: PortalInboxTableRow) => {
      if (tabId === "trash") {
        return (
          <>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => restoreFromTrash(row.id)}>
              Restore
            </Button>
            <Button
              type="button"
              variant="danger"
              className={PORTAL_DETAIL_BTN}
              onClick={() => deleteForever(row.id)}
            >
              Delete forever
            </Button>
          </>
        );
      }
      if (tabId === "opened") {
        return (
          <>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => markUnread(row.id)}>
              Mark unread
            </Button>
            <Button
              type="button"
              variant="danger"
              className={PORTAL_DETAIL_BTN}
              onClick={() => moveToTrash(row.id)}
            >
              Trash
            </Button>
          </>
        );
      }
      return (
        <Button
          type="button"
          variant="danger"
          className={PORTAL_DETAIL_BTN}
          onClick={() => moveToTrash(row.id)}
        >
          Trash
        </Button>
      );
    },
    [tabId, moveToTrash, restoreFromTrash, deleteForever, markUnread],
  );

  const emptyCopy =
    tabId === "trash"
      ? "Trash is empty"
      : tabId === "sent"
        ? "No sent messages yet"
        : tabId === "opened"
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
          {tabId === "trash" && counts.trash > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full text-[var(--status-overdue-fg)]"
              onClick={emptyTrash}
            >
              Empty trash
            </Button>
          ) : null}
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

      {rowsForTab.length === 0 ? (
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
          rows={toRows(rowsForTab, tabId)}
          primaryPartyHeader={tabId === "sent" ? "To" : "From"}
          onMarkRead={tabId === "unopened" ? markRead : undefined}
          getDetailBody={(row) => bodyById[row.id]}
          getThreadMessages={(row) => {
            const thread = local.find((t) => t.id === row.id);
            return thread ? inboxThreadMessages(thread) : [];
          }}
          onReply={tabId === "trash" ? undefined : handleReply}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          renderExtraActions={renderExtraActions}
        />
      )}
    </ManagerPortalPageShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Button } from "@/components/ui/button";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "@/components/portal/portal-inbox-ui";
import { NotificationPrefsButton } from "@/components/portal/notification-prefs-panel";
import {
  PortalInboxSelectionToolbar,
  sendManualScheduledMessageNow,
  useInboxRowSelection,
} from "@/components/portal/portal-inbox-selection";
import { ManagerPortalPageShell, ManagerPortalStatusPills, ManagerPortalFilterRow, PORTAL_FILTER_ACTIONS_MOBILE, PORTAL_HEADER_ACTION_BTN, PORTAL_PAGE_ACTIONS_DESKTOP } from "@/components/portal/portal-metrics";
import { PORTAL_DETAIL_BTN } from "@/components/portal/portal-data-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { demoResidentInboxThreads } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import { isUpcomingScheduledInboxMessage, type ScheduledInboxMessageRecord } from "@/lib/scheduled-inbox-messages";
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

function toRows(list: InboxThread[], tabId: string): PortalInboxTableRow[] {
  return list.map((t) => ({
    id: t.id,
    name: tabId === "sent" ? (t.email || "Unknown recipient") : t.from,
    email: tabId === "sent" ? (t.from ? `From ${t.from}` : "") : t.email,
    subject: t.subject,
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

function scheduledToRows(list: ScheduledInboxMessageRecord[]): PortalInboxTableRow[] {
  return list.map((message) => ({
    id: message.id,
    name: message.recipientName || message.recipientEmail,
    email: message.recipientEmail,
    subject: message.subject,
    whenLabel: formatPacificDateTime(message.sendAt),
    read: message.status !== "scheduled",
    selectable: message.status === "scheduled" || message.status === "cancelled",
  }));
}

export function ResidentInboxPanel({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const navigate = usePortalNavigate();
  const [local, setLocal] = useState<InboxThread[]>(
    () => loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK) as InboxThread[],
  );
  const [persistReady, setPersistReady] = useState(false);
  const persistInboxRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Threads marked read while viewing "Unopened" stay listed until the tab is
  // switched or the page is refreshed; they only move to "Opened" on reset.
  const [retainedIds, setRetainedIds] = useState<Set<string>>(() => new Set());
  // Individually-selectable recipients (this resident's own manager[s] + co-managers),
  // scoped server-side by /api/portal/inbox-eligible-contacts.
  const [eligibleContacts, setEligibleContacts] = useState<InboxScopedContact[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledInboxMessageRecord[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const reloadScheduledMessages = useCallback(async () => {
    if (isDemoModeActive()) return;
    setScheduledLoading(true);
    try {
      const res = await fetch("/api/portal/scheduled-inbox-messages?as=resident", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ScheduledInboxMessageRecord[] };
      setScheduledMessages(Array.isArray(data.messages) ? data.messages : []);
    } finally {
      setScheduledLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemoModeActive()) return;
    let active = true;
    void fetch("/api/portal/inbox-eligible-contacts?portal=resident", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { contacts: [] }))
      .then((data: { contacts?: InboxScopedContact[] }) => {
        if (active) setEligibleContacts(Array.isArray(data.contacts) ? data.contacts : []);
      })
      .catch(() => {
        if (active) setEligibleContacts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void reloadScheduledMessages();
  }, [reloadScheduledMessages]);

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

  const scheduledRows = useMemo(
    () =>
      scheduledMessages
        .filter((message) => isUpcomingScheduledInboxMessage(message.sendAt, message.status))
        .sort((a, b) => a.sendAt.localeCompare(b.sendAt)),
    [scheduledMessages],
  );

  const scheduleSelectableIds = useMemo(
    () =>
      scheduledRows
        .filter((m) => m.status === "scheduled" || m.status === "cancelled")
        .map((m) => m.id),
    [scheduledRows],
  );
  const scheduleSelection = useInboxRowSelection(scheduleSelectableIds);

  const selectedScheduledRows = useMemo(
    () => scheduledRows.filter((m) => scheduleSelection.selectedIds.has(m.id)),
    [scheduledRows, scheduleSelection.selectedIds],
  );

  const counts = useMemo(() => countThreads(local), [local]);

  const tabs = useMemo(
    () => [
      ...INBOX_TAB_DEFS.map(({ id, label }) => ({
        id,
        label,
        count: id === "schedule" ? scheduledRows.length : counts[id as keyof typeof counts],
      })),
    ],
    [counts, scheduledRows.length],
  );

  const rowsForTab = useMemo(() => {
    if (tabId === "unopened")
      return local.filter((t) => t.folder === "inbox" && (t.unread || retainedIds.has(t.id)));
    if (tabId === "opened") return local.filter((t) => t.folder === "inbox" && !t.unread);
    if (tabId === "sent") return local.filter((t) => t.folder === "sent");
    if (tabId === "trash") return local.filter((t) => t.folder === "trash");
    return [];
  }, [local, tabId, retainedIds]);

  // Returning to Unopened (or refreshing) shows the true unread set.
  useEffect(() => {
    setRetainedIds(new Set());
  }, [tabId]);

  const threadRowIds = useMemo(() => rowsForTab.map((t) => t.id), [rowsForTab]);
  const threadSelection = useInboxRowSelection(threadRowIds);

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const scheduledBodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const message of scheduledRows) m[message.id] = message.body;
    return m;
  }, [scheduledRows]);

  const toggleScheduledCancelled = useCallback(
    async (id: string, cancelled: boolean) => {
      try {
        const res = await fetch(`/api/portal/scheduled-inbox-messages/${encodeURIComponent(id)}?as=resident`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cancelled, senderPortal: "resident" }),
        });
        if (!res.ok) throw new Error("Could not update scheduled message.");
        showToast(cancelled ? "Scheduled message cancelled." : "Scheduled message restored.");
        void reloadScheduledMessages();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not update scheduled message.");
      }
    },
    [reloadScheduledMessages, showToast],
  );

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    setRetainedIds((prev) => new Set(prev).add(id));
    showToast("Marked as read — moves to Opened after refresh.");
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
      setComposeOpen(false);
      const senderName = p.senderName.trim() || "Resident";
      const senderEmail = session.email?.trim().toLowerCase() || p.senderEmail;

      void (async () => {
        try {
          if (p.scheduleLater && p.sendAt) {
            const recipientEmail = p.directRecipientEmailLine.split(";").map((e) => e.trim()).filter(Boolean)[0];
            if (!recipientEmail) {
              showToast("Choose your property manager.");
              return;
            }
            const contact = eligibleContacts.find((c) => c.email.trim().toLowerCase() === recipientEmail);
            const res = await fetch("/api/portal/scheduled-inbox-messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                subject: p.subject.trim(),
                body: p.body.trim(),
                sendAt: p.sendAt,
                recipientEmail,
                recipientName: contact?.name?.trim() || recipientEmail,
                deliverViaEmail: p.deliverViaEmail !== false,
                deliverViaSms: p.deliverViaSms,
                senderPortal: "resident",
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              showToast(data.error ?? "Could not schedule message.");
              return;
            }
            showToast("Message scheduled.");
            void reloadScheduledMessages();
            navigate("/resident/inbox/schedule");
            return;
          }

          if (p.includesDirectoryRecipients) {
            const res = await fetch("/api/portal/send-inbox-message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                fromName: senderName,
                fromEmail: senderEmail,
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
          showToast("Message sent via inbox and email.");
          navigate("/resident/inbox/sent");
        } catch {
          showToast("Message could not be sent.");
        }
      })();
    },
    [eligibleContacts, navigate, reloadScheduledMessages, session.email, showToast],
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
      if (tabId === "schedule") {
        const message = scheduledRows.find((item) => item.id === row.id);
        const cancelled = message?.status === "cancelled";
        return (
          <>
            {message?.status === "scheduled" ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => {
                  void (async () => {
                    try {
                      await sendManualScheduledMessageNow(row.id, { asResident: true });
                      showToast("Message sent.");
                      void reloadScheduledMessages();
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : "Could not send message.");
                    }
                  })();
                }}
              >
                Send now
              </Button>
            ) : null}
            <Button
              type="button"
              variant={cancelled ? "outline" : "danger"}
              className={PORTAL_DETAIL_BTN}
              onClick={() => void toggleScheduledCancelled(row.id, !cancelled)}
            >
              {cancelled ? "Restore" : "Cancel send"}
            </Button>
          </>
        );
      }
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
    [tabId, scheduledRows, toggleScheduledCancelled, moveToTrash, restoreFromTrash, deleteForever, markUnread, reloadScheduledMessages, showToast],
  );

  const bulkScheduleSendNow = async () => {
    const targets = selectedScheduledRows.filter((m) => m.status === "scheduled");
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let ok = 0;
      for (const message of targets) {
        try {
          await sendManualScheduledMessageNow(message.id, { asResident: true });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      showToast(ok === 1 ? "Message sent." : `Sent ${ok} messages.`);
      scheduleSelection.clearSelection();
      void reloadScheduledMessages();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkScheduleCancel = async () => {
    const targets = selectedScheduledRows.filter((m) => m.status === "scheduled");
    for (const message of targets) {
      await toggleScheduledCancelled(message.id, true);
    }
    scheduleSelection.clearSelection();
  };

  const bulkScheduleRestore = async () => {
    const targets = selectedScheduledRows.filter((m) => m.status === "cancelled");
    for (const message of targets) {
      await toggleScheduledCancelled(message.id, false);
    }
    scheduleSelection.clearSelection();
  };

  const bulkMarkRead = () => {
    for (const id of threadSelection.selectedIds) markRead(id);
    threadSelection.clearSelection();
  };

  const bulkMoveToTrash = () => {
    for (const id of threadSelection.selectedIds) moveToTrash(id);
    threadSelection.clearSelection();
  };

  const bulkRestoreFromTrash = () => {
    for (const id of threadSelection.selectedIds) restoreFromTrash(id);
    threadSelection.clearSelection();
  };

  const bulkDeleteForever = () => {
    if (!window.confirm(`Delete ${threadSelection.selectedIds.size} message(s) permanently?`)) return;
    for (const id of threadSelection.selectedIds) deleteForever(id);
    threadSelection.clearSelection();
  };

  const bulkMarkUnread = () => {
    for (const id of threadSelection.selectedIds) markUnread(id);
    threadSelection.clearSelection();
  };

  const emptyCopy =
    tabId === "trash"
      ? "No trash messages yet."
      : tabId === "schedule"
        ? scheduledLoading
          ? "Loading scheduled messages…"
          : "No scheduled messages yet."
      : tabId === "sent"
        ? "No sent messages yet."
        : tabId === "opened"
          ? "No opened messages yet."
          : "No messages yet.";

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          <NotificationPrefsButton className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} />
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setComposeOpen(true)}>
            New message
          </Button>
          {tabId === "trash" && counts.trash > 0 ? (
            <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
              <Button
                type="button"
                variant="outline"
                className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} text-[var(--status-overdue-fg)]`}
                onClick={emptyTrash}
              >
                Empty trash
              </Button>
            </div>
          ) : null}
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            activeTone="primary"
            tabs={tabs}
            activeId={tabId}
            onChange={(id) => navigate(`/resident/inbox/${id}`)}
          />
          {tabId === "trash" && counts.trash > 0 ? (
            <div className={PORTAL_FILTER_ACTIONS_MOBILE}>
              <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={emptyTrash}>
                Empty
              </Button>
            </div>
          ) : null}
        </ManagerPortalFilterRow>
      }
    >
      <ScopedInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
        portal="resident"
        senderName="Resident"
        senderEmail={session.email?.trim().toLowerCase() || "resident@example.com"}
        liveContacts={eligibleContacts}
      />

      {tabId === "schedule" ? (
        scheduledRows.length === 0 ? (
          <PortalInboxEmptyState title={emptyCopy} />
        ) : (
          <div className="space-y-3">
            <PortalInboxSelectionToolbar count={scheduleSelection.selectedIds.size} onClear={scheduleSelection.clearSelection}>
              <Button type="button" variant="primary" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkScheduleSendNow()}>
                Send now
              </Button>
              <Button type="button" variant="outline" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkScheduleCancel()}>
                Cancel send
              </Button>
              <Button type="button" variant="outline" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkScheduleRestore()}>
                Restore send
              </Button>
            </PortalInboxSelectionToolbar>
            <PortalInboxMessageTable
              rows={scheduledToRows(scheduledRows)}
              layout="schedule"
              primaryPartyHeader="Recipient"
              getDetailBody={(row) => scheduledBodyById[row.id]}
              onReply={undefined}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              renderExtraActions={renderExtraActions}
              selection={{
                selectedIds: scheduleSelection.selectedIds,
                onToggleSelected: scheduleSelection.toggleSelected,
                onToggleSelectAll: scheduleSelection.toggleSelectAll,
                allSelected: scheduleSelection.allSelected,
                selectableCount: scheduleSelectableIds.length,
              }}
            />
          </div>
        )
      ) : rowsForTab.length === 0 ? (
        <PortalInboxEmptyState title={emptyCopy} />
      ) : (
        <div className="space-y-3">
          <PortalInboxSelectionToolbar count={threadSelection.selectedIds.size} onClear={threadSelection.clearSelection}>
            {tabId === "unopened" ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMarkRead}>
                  Mark read
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMoveToTrash}>
                  Trash
                </Button>
              </>
            ) : null}
            {tabId === "opened" ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMarkUnread}>
                  Mark unread
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMoveToTrash}>
                  Trash
                </Button>
              </>
            ) : null}
            {tabId === "sent" ? (
              <Button type="button" variant="outline" className="rounded-full" onClick={bulkMoveToTrash}>
                Trash
              </Button>
            ) : null}
            {tabId === "trash" ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkRestoreFromTrash}>
                  Restore
                </Button>
                <Button type="button" variant="outline" className="rounded-full text-rose-700" onClick={bulkDeleteForever}>
                  Delete forever
                </Button>
              </>
            ) : null}
          </PortalInboxSelectionToolbar>
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
            selection={{
              selectedIds: threadSelection.selectedIds,
              onToggleSelected: threadSelection.toggleSelected,
              onToggleSelectAll: threadSelection.toggleSelectAll,
              allSelected: threadSelection.allSelected,
              selectableCount: threadRowIds.length,
            }}
          />
        </div>
      )}
    </ManagerPortalPageShell>
  );
}

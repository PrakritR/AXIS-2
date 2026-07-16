"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills, ManagerPortalFilterRow, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import { formatPacificDateTime } from "@/lib/pacific-time";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  deleteInboxThreadIds,
  invalidatePersistedInboxCache,
  inboxMutationInFlight,
  loadPersistedInbox,
  persistInbox,
  persistInboxAwait,
  runInboxMutation,
  stagePersistedInboxRows,
  syncPersistedInboxFromServer,
  upsertPersistedInboxRows,
  inboxThreadMessages,
  appendReplyToInboxThread,
  type InboxThreadMessage,
} from "@/lib/portal-inbox-storage";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "./portal-inbox-ui";
import {
  PortalInboxSelectionToolbar,
  useInboxRowSelection,
} from "@/components/portal/portal-inbox-selection";
import { ManagerInboxSchedulePanel } from "@/components/portal/manager-inbox-schedule-panel";
import { useScheduledPaymentMessages } from "@/components/portal/payment-schedule-ui";
import { MANAGER_APPLICATIONS_EVENT } from "@/lib/manager-applications-storage";
import { buildManagerInboxLiveContacts } from "@/lib/manager-inbox-contacts";
import {
  isUpcomingScheduledInboxMessage,
  type ScheduledInboxMessageRecord,
} from "@/lib/scheduled-inbox-messages";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";
import {
  threadPassesCommunicationFilters,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";

type InboxThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  previousFolder?: "inbox" | "sent";
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

function countThreads(threads: InboxThread[], scheduleCount: number) {
  return {
    unopened: threads.filter((t) => t.folder === "inbox" && t.unread).length,
    opened: threads.filter((t) => t.folder === "inbox" && !t.unread).length,
    schedule: scheduleCount,
    sent: threads.filter((t) => t.folder === "sent").length,
    trash: threads.filter((t) => t.folder === "trash").length,
  };
}

export type ManagerInboxHandle = {
  openCompose: () => void;
  deleteAllTrash: () => void;
  reloadInbox: () => void;
};

export const ManagerInbox = forwardRef<
  ManagerInboxHandle,
  {
    tabId: string;
    embeddedInCommunication?: boolean;
    commBase?: string;
    externalTitleActions?: boolean;
    /** When true, Communication shell owns New message — do not render compose here. */
    suppressCompose?: boolean;
    threadFilters?: CommunicationThreadFilters;
    filterContacts?: InboxScopedContact[];
    onTabCountsChange?: (counts: ReturnType<typeof countThreads>) => void;
  }
>(function ManagerInbox(
  {
    tabId,
    embeddedInCommunication = false,
    commBase,
    externalTitleActions = false,
    suppressCompose = false,
    threadFilters,
    filterContacts,
    onTabCountsChange,
  },
  ref,
) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const portalBase = usePaidPortalBasePath();
  const inboxBase = embeddedInCommunication && commBase ? `${commBase}/inbox` : `${portalBase}/inbox`;
  const { messages: scheduledMessages } = useScheduledPaymentMessages({ includeHidden: false });
  const [manualScheduledMessages, setManualScheduledMessages] = useState<ScheduledInboxMessageRecord[]>([]);

  useEffect(() => {
    if (isDemoModeActive()) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/portal/scheduled-inbox-messages", { credentials: "include", cache: "no-store" });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { messages?: ScheduledInboxMessageRecord[] };
      setManualScheduledMessages(Array.isArray(body.messages) ? body.messages : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleCount = useMemo(() => {
    const upcoming = (status: string, sendAt: string) =>
      status === "scheduled" && isUpcomingScheduledInboxMessage(sendAt, status);
    return (
      manualScheduledMessages.filter((m) => upcoming(m.status, m.sendAt)).length +
      scheduledMessages.filter((m) => upcoming(m.status, m.sendAt)).length
    );
  }, [manualScheduledMessages, scheduledMessages]);
  const { userId } = useManagerUserId();
  const [local, setLocal] = useState<InboxThread[]>(() => loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[]);
  const [inboxSynced, setInboxSynced] = useState(false);
  const persistInboxRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [contactTick, setContactTick] = useState(0);
  // Threads marked read while viewing "Unopened" stay listed until the tab is
  // switched or the page is refreshed; they only move to "Opened" on reset.
  const [retainedIds, setRetainedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    persistInboxRef.current = false;
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY).then((rows) => {
      setLocal(rows as InboxThread[]);
      setInboxSynced(true);
      persistInboxRef.current = true;
    });
  }, []);

  useEffect(() => {
    const bump = () => setContactTick((n) => n + 1);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener("axis-pro-relationships", bump);
    window.addEventListener("axis:manager-vendors", bump);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener("axis-pro-relationships", bump);
      window.removeEventListener("axis:manager-vendors", bump);
    };
  }, []);

  const liveContacts = useMemo((): InboxScopedContact[] => {
    void contactTick;
    return buildManagerInboxLiveContacts(userId);
  }, [userId, contactTick]);

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
    if (!inboxSynced || !persistInboxRef.current) return;
    persistInbox(MANAGER_INBOX_STORAGE_KEY, local);
  }, [local, inboxSynced]);

  const emailThreads = useMemo(() => {
    const base = embeddedInCommunication ? filterEmailInboxThreads(local) : local;
    if (!threadFilters || !filterContacts) return base;
    return base.filter((t) =>
      threadPassesCommunicationFilters({
        filters: threadFilters,
        contacts: filterContacts,
        counterpartyEmail: t.email,
      }),
    );
  }, [embeddedInCommunication, local, threadFilters, filterContacts]);

  const counts = useMemo(() => countThreads(emailThreads, scheduleCount), [emailThreads, scheduleCount]);
  const tabs = useMemo(
    () => [
      ...INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    ],
    [counts],
  );

  useEffect(() => {
    if (embeddedInCommunication) onTabCountsChange?.(counts);
  }, [counts, embeddedInCommunication, onTabCountsChange]);

  function threadTimestamp(t: InboxThread): number {
    const match = t.id.match(/(\d{10,})/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  const rowsForTab = useMemo(() => {
    let filtered: InboxThread[];
    if (tabId === "unopened")
      filtered = emailThreads.filter((t) => t.folder === "inbox" && (t.unread || retainedIds.has(t.id)));
    else if (tabId === "opened") filtered = emailThreads.filter((t) => t.folder === "inbox" && !t.unread);
    else if (tabId === "sent") filtered = emailThreads.filter((t) => t.folder === "sent");
    else if (tabId === "trash") filtered = emailThreads.filter((t) => t.folder === "trash");
    else filtered = [];

    return [...filtered].sort((a, b) => threadTimestamp(b) - threadTimestamp(a));
  }, [emailThreads, tabId, retainedIds]);

  // Returning to Unopened (or refreshing) shows the true unread set.
  useEffect(() => {
    setRetainedIds(new Set());
  }, [tabId]);

  const threadRowIds = useMemo(() => rowsForTab.map((t) => t.id), [rowsForTab]);
  const threadSelection = useInboxRowSelection(threadRowIds);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    setRetainedIds((prev) => new Set(prev).add(id));
    showToast("Marked as read — moves to Opened after refresh.");
  };

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const moveToTrash = (id: string) => {
    void runInboxMutation(async () => {
      persistInboxRef.current = false;
      try {
        const prev = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[];
        const target = prev.find((t) => t.id === id);
        if (!target || target.folder === "trash" || (target.folder !== "inbox" && target.folder !== "sent")) return;
        const updated: InboxThread = {
          ...target,
          folder: "trash",
          previousFolder: target.folder,
          unread: false,
        };
        const next = prev.map((t) => (t.id === id ? updated : t));
        stagePersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, next);
        setLocal(next);
        setExpandedId((e) => (e === id ? null : e));
        const ok = await upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
        if (!ok) {
          stagePersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, prev);
          setLocal(prev);
          showToast("Could not move message to trash.");
          return;
        }
        showToast("Moved to trash.");
      } finally {
        persistInboxRef.current = true;
      }
    });
  };

  function inferPreviousFolder(t: InboxThread): "inbox" | "sent" {
    if (t.previousFolder) return t.previousFolder;
    if (/^(sent_|msg_|welcome_)/.test(t.id)) return "sent";
    return "inbox";
  }

  const restoreFromTrash = (id: string) => {
    void runInboxMutation(async () => {
      persistInboxRef.current = false;
      try {
        const prev = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[];
        const target = prev.find((t) => t.id === id && t.folder === "trash");
        if (!target) return;
        const dest = inferPreviousFolder(target);
        const updated: InboxThread = { ...target, folder: dest, previousFolder: undefined, unread: false };
        const next = prev.map((t) => (t.id === id ? updated : t));
        stagePersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, next);
        setLocal(next);
        setExpandedId((e) => (e === id ? null : e));
        const ok = await upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
        if (!ok) {
          stagePersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, prev);
          setLocal(prev);
          showToast("Could not restore message.");
          return;
        }
        showToast("Restored.");
      } finally {
        persistInboxRef.current = true;
      }
    });
  };

  const deleteForever = (id: string) => {
    void (async () => {
      invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
      const ok = await deleteInboxThreadIds([id]);
      if (!ok) {
        showToast("Could not delete message.");
        return;
      }
      const next = local.filter((t) => t.id !== id);
      persistInboxRef.current = false;
      setLocal(next);
      setExpandedId((e) => (e === id ? null : e));
      await persistInboxAwait(MANAGER_INBOX_STORAGE_KEY, next);
      const deletedIds = new Set([id]);
      const synced = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true, excludeIds: deletedIds });
      setLocal((synced as InboxThread[]).filter((t) => !deletedIds.has(t.id)));
      persistInboxRef.current = true;
      showToast("Message deleted.");
    })();
  };

  const deleteAllTrash = useCallback(() => {
    const trashItems = local.filter((t) => t.folder === "trash");
    if (trashItems.length === 0) {
      showToast("Trash is already empty.");
      return;
    }
    if (!window.confirm(`Delete all ${trashItems.length} trash message${trashItems.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    void (async () => {
      invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
      const ids = trashItems.map((item) => item.id).filter(Boolean);
      if (ids.length === 0) return;
      const ok = await deleteInboxThreadIds(ids);
      if (!ok) {
        showToast("Could not clear trash.");
        return;
      }
      const next = local.filter((t) => t.folder !== "trash");
      persistInboxRef.current = false;
      setLocal(next);
      setExpandedId(null);
      await persistInboxAwait(MANAGER_INBOX_STORAGE_KEY, next);
      const deletedIds = new Set(ids);
      const synced = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true, excludeIds: deletedIds });
      setLocal((synced as InboxThread[]).filter((t) => !deletedIds.has(t.id)));
      persistInboxRef.current = true;
      showToast("Trash cleared.");
    })().catch(() => showToast("Could not clear trash."));
  }, [local, showToast]);

  const reloadInbox = useCallback(() => {
    invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
      setLocal(rows as InboxThread[]);
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      openCompose: () => {
        if (!suppressCompose) setComposeOpen(true);
      },
      deleteAllTrash,
      reloadInbox,
    }),
    [deleteAllTrash, reloadInbox, suppressCompose],
  );

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const handleReply = useCallback(
    async (row: PortalInboxTableRow, text: string) => {
      const thread = local.find((t) => t.id === row.id);
      if (!thread) return;
      const reply: InboxThreadMessage = {
        id: `reply-${Date.now().toString(36)}`,
        from: "Property manager",
        body: text,
        at: new Date().toLocaleString(),
      };
      const updated = appendReplyToInboxThread(thread, reply);
      const next = local.map((t) => (t.id === thread.id ? updated : t));
      persistInboxRef.current = false;
      setLocal(next);
      const ok = await upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
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
      void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
    },
    [local],
  );

  const handleComposeSend = useCallback(
    (p: ScopedInboxSendPayload) => {
      if (p.includesAxisAdmin) {
        appendPortalMessageToAdminInbox({
          role: "manager",
          name: p.senderName,
          email: p.senderEmail,
          topic: p.subject.trim(),
          body: p.body.trim(),
        });
      }
      setComposeOpen(false);

      void (async () => {
        try {
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
              deliverViaSms: p.deliverViaSms === true,
              eventCategory: "messages",
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
          if (!res.ok || !data.ok) {
            showToast("Message could not be sent.");
            return;
          }
          invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
          const rows = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
          setLocal(rows as InboxThread[]);
          showToast(
            p.includesAxisAdmin && !p.includesDirectoryRecipients
              ? "Message sent to PropLane admin."
              : p.deliverViaSms
                ? "Message sent via inbox, email, and text."
                : "Message sent.",
          );
          navigate(`${inboxBase}/sent`);
        } catch {
          showToast("Message could not be sent.");
        }
      })();
    },
    [navigate, showToast, inboxBase],
  );

  const emptyCopy =
    tabId === "sent" && rowsForTab.length === 0
      ? "No sent messages yet."
      : tabId === "trash" && rowsForTab.length === 0
        ? "No trash messages yet."
        : tabId === "opened" && rowsForTab.length === 0
          ? "No opened messages yet."
          : tabId === "unopened" && rowsForTab.length === 0
            ? "No unopened messages yet."
            : "No messages yet.";

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

  const inboxBody = (
    <>
      {embeddedInCommunication && !externalTitleActions ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {tabId === "trash" ? (
            <Button
              type="button"
              variant="outline"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
              onClick={deleteAllTrash}
            >
              Delete all trash
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            data-attr="inbox-new-message"
            onClick={() => setComposeOpen(true)}
          >
            New message
          </Button>
        </div>
      ) : null}

      {!suppressCompose ? (
        <ScopedInboxComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onSend={handleComposeSend}
          portal="manager"
          senderName="Property manager"
          senderEmail="manager@example.com"
          liveContacts={liveContacts}
        />
      ) : null}

      {tabId === "schedule" ? (
        <ManagerInboxSchedulePanel portalBase={portalBase} />
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
            {tabId === "opened" || tabId === "sent" ? (
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
                  Delete
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
            onToggleExpand={toggleExpand}
            selection={{
              selectedIds: threadSelection.selectedIds,
              onToggleSelected: threadSelection.toggleSelected,
              onToggleSelectAll: threadSelection.toggleSelectAll,
              allSelected: threadSelection.allSelected,
              selectableCount: threadRowIds.length,
            }}
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
                      className="rounded-full border-rose-200 px-3 py-1.5 text-xs text-rose-800 hover:bg-[var(--status-overdue-bg)]"
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
        </div>
      )}
    </>
  );

  if (embeddedInCommunication) return inboxBody;

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          {tabId === "trash" ? (
            <Button
              type="button"
              variant="outline"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
              onClick={deleteAllTrash}
            >
              Delete all trash
            </Button>
          ) : null}
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} data-attr="inbox-new-message" onClick={() => setComposeOpen(true)}>
            New message
          </Button>
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={tabs}
            activeId={tabId}
            onChange={(id) => navigate(`${inboxBase}/${id}`)}
          />
        </ManagerPortalFilterRow>
      }
    >
      {inboxBody}
    </ManagerPortalPageShell>
  );
});

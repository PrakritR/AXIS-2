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

/**
 * `perRowFolder` is for lists that span folders (search results): "is this a
 * sent message?" then has to be answered per row, because the active tab no
 * longer describes what the row is. Such a list also gets the recipient marked
 * "To:" so a sent thread is never read as one the recipient sent us.
 */
function toRows(list: InboxThread[], tabId: string, perRowFolder = false): PortalInboxTableRow[] {
  return list.map((t) => {
    const sentSemantics = perRowFolder ? t.folder === "sent" : tabId === "sent";
    const recipientLabel = t.email || "Unknown recipient";
    return {
      id: t.id,
      name: sentSemantics ? (perRowFolder ? `To: ${recipientLabel}` : recipientLabel) : t.from,
      email: sentSemantics ? (t.from ? `From ${t.from}` : "") : t.email,
      subject: t.subject,
      whenLabel: t.time,
      read: !t.unread,
    };
  });
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
  const [query, setQuery] = useState("");
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

  /**
   * Relevance score for message search: sender name/email matches rank above
   * subject matches, which rank above body matches. 0 = no match.
   */
  function searchScore(t: InboxThread, q: string): number {
    const has = (s: string | undefined) => Boolean(s && s.toLowerCase().includes(q));
    if (has(t.from) || has(t.email)) return 3;
    if (has(t.subject)) return 2;
    if (has(t.body) || has(t.preview)) return 1;
    return 0;
  }

  const searchQuery = query.trim().toLowerCase();
  const searchActive = searchQuery.length > 0;

  const rowsForTab = useMemo(() => {
    // Search mode: match across every folder except trash (a resident's or
    // applicant's messages regardless of read state), best matches first,
    // newest first within the same relevance.
    if (searchActive) {
      return emailThreads
        .filter((t) => t.folder !== "trash")
        .map((t) => ({ t, score: searchScore(t, searchQuery) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || threadTimestamp(b.t) - threadTimestamp(a.t))
        .map((x) => x.t);
    }

    let filtered: InboxThread[];
    if (tabId === "unopened")
      filtered = emailThreads.filter((t) => t.folder === "inbox" && (t.unread || retainedIds.has(t.id)));
    else if (tabId === "opened") filtered = emailThreads.filter((t) => t.folder === "inbox" && !t.unread);
    else if (tabId === "sent") filtered = emailThreads.filter((t) => t.folder === "sent");
    else if (tabId === "trash") filtered = emailThreads.filter((t) => t.folder === "trash");
    else filtered = [];

    return [...filtered].sort((a, b) => threadTimestamp(b) - threadTimestamp(a));
  }, [emailThreads, tabId, retainedIds, searchActive, searchQuery]);

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

  const markReadIfUnreadInbox = (id: string) => {
    const thread = local.find((t) => t.id === id);
    if (thread && thread.folder === "inbox" && thread.unread) markRead(id);
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

  // Rendered next to the tab pills when Inbox owns its own page shell, and at
  // the top of the body when Communication owns it. Both are required: the real
  // manager portal only ever mounts the embedded branch (/portal/inbox/*
  // redirects to Communication), so a filter-row-only search box would render
  // on /demo and nowhere else.
  const searchBox = (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages…"
        aria-label="Search messages by sender, subject, or content"
        data-attr="inbox-message-search"
        className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-8 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
      />
      {searchActive ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );

  const inboxBody = (
    <>
      {embeddedInCommunication ? <div className="mb-4 flex">{searchBox}</div> : null}
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

      {tabId === "schedule" && !searchActive ? (
        <ManagerInboxSchedulePanel portalBase={portalBase} />
      ) : rowsForTab.length === 0 ? (
        <PortalInboxEmptyState
          title={searchActive ? `No messages match “${query.trim()}”.` : emptyCopy}
        />
      ) : (
        <div className="space-y-3">
          {searchActive ? (
            <p className="text-sm text-muted">
              {rowsForTab.length} message{rowsForTab.length === 1 ? "" : "s"} matching{" "}
              <span className="font-medium text-foreground">“{query.trim()}”</span> — best matches
              first.
            </p>
          ) : null}
          <PortalInboxSelectionToolbar count={threadSelection.selectedIds.size} onClear={threadSelection.clearSelection}>
            {!searchActive && tabId === "unopened" ? (
              <>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMarkRead}>
                  Mark read
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={bulkMoveToTrash}>
                  Trash
                </Button>
              </>
            ) : null}
            {searchActive || tabId === "opened" || tabId === "sent" ? (
              <Button type="button" variant="outline" className="rounded-full" onClick={bulkMoveToTrash}>
                Trash
              </Button>
            ) : null}
            {!searchActive && tabId === "trash" ? (
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
            rows={toRows(rowsForTab, tabId, searchActive)}
            primaryPartyHeader={searchActive ? "From / To" : tabId === "sent" ? "To" : "From"}
            onMarkRead={searchActive ? markReadIfUnreadInbox : tabId === "unopened" ? markRead : undefined}
            getDetailBody={(row) => bodyById[row.id]}
            getThreadMessages={(row) => {
              const thread = local.find((t) => t.id === row.id);
              return thread ? inboxThreadMessages(thread) : [];
            }}
            onReply={!searchActive && tabId === "trash" ? undefined : handleReply}
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
              // Search spans folders but excludes trash, so a search row is
              // always a live message. Letting the Trash tab's actions through
              // here would put a no-confirm permanent delete on real mail.
              if (!searchActive && tabId === "trash") {
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
          {searchBox}
        </ManagerPortalFilterRow>
      }
    >
      {inboxBody}
    </ManagerPortalPageShell>
  );
});

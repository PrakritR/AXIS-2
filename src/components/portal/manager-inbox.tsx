"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills, ManagerPortalFilterRow, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  deleteInboxThreadIds,
  invalidatePersistedInboxCache,
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
  type InboxAiDraft,
} from "@/lib/portal-inbox-storage";
import {
  INBOX_TAB_DEFS,
  INBOX_LIST_SCROLL,
  AiDraftReplyCard,
  InboxComposer,
  InboxConversationRow,
  InboxThreadEmpty,
  InboxThreadView,
  InboxTwoPane,
  PortalInboxEmptyState,
  inboxTabEmptyCopy,
  type InboxBubbleMessage,
} from "./portal-inbox-ui";
import { useInboxRowSelection } from "@/components/portal/portal-inbox-selection";
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
  messages?: InboxThreadMessage[];
  /** Manager-only pending AI reply draft (never present on resident rows). */
  aiDraft?: InboxAiDraft;
};

/** Search deliberately skips the trash folder; say so rather than letting a
 *  manager conclude a trashed message no longer exists. Re-clicking the pill of
 *  the tab you are already on does not change `tabId`, so "open the Trash tab"
 *  is not a way out when Trash is already the active tab — name the step that
 *  actually applies from where the reader is standing. */
function searchSkipsTrashNote(tabId: string) {
  return tabId === "trash"
    ? "Trash isn’t searched; clear the search to browse it."
    : "Trash isn’t searched; clear the search, then open the Trash tab.";
}

function previewLine(body: string, max = 100) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
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
    /** When true, only the open thread pane is rendered (unified Communication list lives elsewhere). */
    suppressListPane?: boolean;
    /** Controlled selection for unified Communication. */
    controlledExpandedId?: string | null;
    onControlledExpandedIdChange?: (id: string | null) => void;
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
    suppressListPane = false,
    controlledExpandedId,
    onControlledExpandedIdChange,
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
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(null);
  const expandedId = controlledExpandedId !== undefined ? controlledExpandedId : internalExpandedId;
  const setExpandedId = useCallback(
    (id: string | null | ((prev: string | null) => string | null)) => {
      const resolve = (prev: string | null) => (typeof id === "function" ? id(prev) : id);
      if (controlledExpandedId !== undefined) {
        onControlledExpandedIdChange?.(resolve(controlledExpandedId));
      } else {
        setInternalExpandedId(resolve);
      }
    },
    [controlledExpandedId, onControlledExpandedIdChange],
  );
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

  // Returning to Unopened (or refreshing) shows the true unread set. Search
  // spans folders and overrides the tab, so picking a tab also ends the search
  // rather than leaving the pill highlighted over an unchanged result list.
  useEffect(() => {
    setRetainedIds(new Set());
    setQuery("");
    // Switching folders closes the open thread — its row no longer belongs to
    // the visible list, so keeping it selected would strand the right pane.
    // In CONTROLLED mode (unified Communication), the parent owns selection and
    // already clears it on tab change; clearing here would ALSO fire on mount —
    // when the parent has just selected a thread and mounted this pane — and
    // immediately wipe that selection back to "Select a conversation".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (controlledExpandedId === undefined) setExpandedId(null);
  }, [tabId]);

  const threadRowIds = useMemo(() => rowsForTab.map((t) => t.id), [rowsForTab]);
  const threadSelection = useInboxRowSelection(threadRowIds);

  // Mark an unread inbox thread read without a toast — used when a thread is
  // opened in the two-pane view (kept listed under Unopened until refresh via
  // `retainedIds`, matching the explicit "Mark read" behaviour).
  const markReadSilent = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    setRetainedIds((prev) => new Set(prev).add(id));
  };

  const markRead = (id: string) => {
    markReadSilent(id);
    showToast("Marked as read. Moves to Opened after refresh.");
  };

  const isUnreadInboxThread = (id: string) => {
    const thread = local.find((t) => t.id === id);
    return Boolean(thread && thread.folder === "inbox" && thread.unread);
  };

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

  const handleReply = useCallback(
    async (rowId: string, text: string) => {
      const thread = local.find((t) => t.id === rowId);
      if (!thread) return;
      const reply: InboxThreadMessage = {
        id: `reply-${Date.now().toString(36)}`,
        from: "Property manager",
        body: text,
        at: new Date().toLocaleString(),
      };
      // Sending a reply supersedes any pending AI draft — clear it so it never
      // lingers (and never leaks) once a real reply has gone out.
      const updated = { ...appendReplyToInboxThread(thread, reply), aiDraft: undefined };
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
          // Name the sender so the reply reads as the manager on the resident's
          // side (matches the reply bubble above), not the generic default.
          fromName: "Property manager",
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

  // ---- Open conversation (right pane) ----------------------------------
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);

  const activeThread = useMemo(
    () => (expandedId ? local.find((t) => t.id === expandedId) ?? null : null),
    [expandedId, local],
  );

  // A fresh draft per conversation.
  useEffect(() => {
    setReplyDraft("");
    setEditingDraft(false);
  }, [expandedId]);

  const activeIsSent = activeThread?.folder === "sent";
  const activeFolder = activeThread
    ? activeThread.folder === "trash"
      ? inferPreviousFolder(activeThread)
      : activeThread.folder
    : "inbox";

  const activeBubbles = useMemo((): InboxBubbleMessage[] => {
    if (!activeThread) return [];
    return inboxThreadMessages(activeThread).map((m, i) => {
      // Root direction follows the folder (a Sent thread we authored); every
      // appended message in this model is a manager reply, i.e. outbound.
      const outbound = i === 0 ? activeFolder === "sent" : true;
      return {
        id: m.id,
        author: m.from,
        body: m.body,
        at: m.at,
        direction: outbound ? "outbound" : "inbound",
      } satisfies InboxBubbleMessage;
    });
  }, [activeThread, activeFolder]);

  const openThread = useCallback(
    (thread: InboxThread) => {
      setExpandedId(thread.id);
      // Opening an unread inbox message reads it (natural inbox behaviour).
      if (thread.folder === "inbox" && thread.unread) markReadSilent(thread.id);
    },
    // markReadSilent only closes over stable state setters.
    [],
  );

  const sendActiveReply = useCallback(async () => {
    if (!activeThread) return;
    const text = replyDraft.trim();
    if (!text) return;
    setReplySending(true);
    try {
      await handleReply(activeThread.id, text);
      setReplyDraft("");
      setEditingDraft(false);
      showToast("Reply sent.");
    } catch {
      showToast("Could not send reply.");
    } finally {
      setReplySending(false);
    }
  }, [activeThread, replyDraft, handleReply, showToast]);

  // ---- Approval-first AI drafts ----------------------------------------
  // PropLane AI drafts a reply to each incoming resident message. The draft is
  // stored only on the manager's own thread row (invisible to the resident) and
  // NEVER sends without the manager's explicit Approve/Edit action.
  const [editingDraft, setEditingDraft] = useState(false);
  const [approvingDraft, setApprovingDraft] = useState(false);
  const [draftingIds, setDraftingIds] = useState<Set<string>>(() => new Set());
  const [draftErrorIds, setDraftErrorIds] = useState<Set<string>>(() => new Set());
  // Threads we've already asked the server to draft (success, skip, or error).
  // Prevents auto-regenerating a draft the manager discarded or the server
  // declined (e.g. a non-resident sender).
  const draftAttemptedRef = useRef<Set<string>>(new Set());
  // Threads the server declined to draft (non-resident sender, empty, no AI) —
  // no manual "generate" affordance is offered for these.
  const draftSkippedRef = useRef<Set<string>>(new Set());

  const generateDraft = useCallback(async (rowId: string) => {
    draftAttemptedRef.current.add(rowId);
    draftSkippedRef.current.delete(rowId);
    setDraftErrorIds((s) => {
      if (!s.has(rowId)) return s;
      const n = new Set(s);
      n.delete(rowId);
      return n;
    });
    setDraftingIds((s) => new Set(s).add(rowId));
    try {
      const res = await fetch("/api/portal/inbox-draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threadId: rowId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        draft?: InboxAiDraft;
        skip?: boolean;
      };
      if (data.ok && data.draft?.text) {
        // Reflect the server-persisted draft in local state (the row already
        // carries it server-side; this just re-renders the open conversation).
        setLocal((prev) => prev.map((t) => (t.id === rowId ? { ...t, aiDraft: data.draft } : t)));
      } else if (data.skip) {
        draftSkippedRef.current.add(rowId);
      } else {
        setDraftErrorIds((s) => new Set(s).add(rowId));
      }
    } catch {
      setDraftErrorIds((s) => new Set(s).add(rowId));
    } finally {
      setDraftingIds((s) => {
        const n = new Set(s);
        n.delete(rowId);
        return n;
      });
    }
  }, []);

  // Auto-draft eligible incoming resident messages once the inbox has synced.
  useEffect(() => {
    if (!inboxSynced || isDemoModeActive()) return;
    const eligible = local.filter(
      (t) =>
        t.folder === "inbox" &&
        !t.aiDraft &&
        inboxThreadMessages(t).length <= 1 && // no manager reply yet
        !draftAttemptedRef.current.has(t.id),
    );
    // Cap the burst so a large inbox doesn't fan out dozens of requests at once.
    for (const t of eligible.slice(0, 8)) void generateDraft(t.id);
  }, [local, inboxSynced, generateDraft]);

  const approveDraft = useCallback(
    async (rowId: string) => {
      const thread = local.find((t) => t.id === rowId);
      const text = thread?.aiDraft?.text?.trim();
      if (!thread || !text) return;
      setApprovingDraft(true);
      try {
        // handleReply sends through the normal path AND strips the draft.
        await handleReply(rowId, text);
        showToast("Reply approved and sent.");
      } catch {
        showToast("Could not send reply.");
      } finally {
        setApprovingDraft(false);
      }
    },
    [local, handleReply, showToast],
  );

  const startEditDraft = useCallback(
    (rowId: string) => {
      const thread = local.find((t) => t.id === rowId);
      setReplyDraft(thread?.aiDraft?.text ?? "");
      setEditingDraft(true);
    },
    [local],
  );

  const discardDraft = useCallback(
    async (rowId: string) => {
      // Keep it discarded: block auto-regeneration for the rest of the session.
      draftAttemptedRef.current.add(rowId);
      const thread = local.find((t) => t.id === rowId);
      if (!thread) return;
      const updated: InboxThread = { ...thread, aiDraft: undefined };
      const next = local.map((t) => (t.id === rowId ? updated : t));
      persistInboxRef.current = false;
      setLocal(next);
      await upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
      persistInboxRef.current = true;
    },
    [local],
  );

  const emptyCopy = inboxTabEmptyCopy(tabId);

  const bulkMarkRead = () => {
    const eligible = [...threadSelection.selectedIds].filter(isUnreadInboxThread);
    if (eligible.length === 0) {
      showToast("Nothing to mark read. The selection has no unread inbox messages.");
      return;
    }
    for (const id of eligible) markRead(id);
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
        className="portal-inbox-search h-9 w-full rounded-full border border-border bg-card pl-9 pr-8 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
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

  const rowCheckbox = (thread: InboxThread) => (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
      checked={threadSelection.selectedIds.has(thread.id)}
      onChange={() => threadSelection.toggleSelected(thread.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select message ${thread.subject}`}
    />
  );

  const bulkButtons = (
    <>
      {searchActive || tabId === "unopened" ? (
        <Button type="button" variant="outline" className="min-h-0 rounded-full px-3 py-1.5 text-xs" onClick={bulkMarkRead}>
          Mark read
        </Button>
      ) : null}
      {searchActive || tabId === "unopened" || tabId === "opened" || tabId === "sent" ? (
        <Button type="button" variant="outline" className="min-h-0 rounded-full px-3 py-1.5 text-xs" onClick={bulkMoveToTrash}>
          Trash
        </Button>
      ) : null}
      {!searchActive && tabId === "trash" ? (
        <>
          <Button type="button" variant="outline" className="min-h-0 rounded-full px-3 py-1.5 text-xs" onClick={bulkRestoreFromTrash}>
            Restore
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-0 rounded-full border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-[var(--status-overdue-bg)]"
            onClick={bulkDeleteForever}
          >
            Delete
          </Button>
        </>
      ) : null}
      <Button type="button" variant="outline" className="min-h-0 rounded-full px-3 py-1.5 text-xs" onClick={threadSelection.clearSelection}>
        Clear
      </Button>
    </>
  );

  const hasSelection = threadSelection.selectedIds.size > 0;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="portal-inbox-list-toolbar shrink-0 space-y-2 border-b border-border p-2.5">
        {searchBox}
        {searchActive ? (
          <p className="px-1 text-[11px] leading-snug text-muted">
            {rowsForTab.length} message{rowsForTab.length === 1 ? "" : "s"} matching{" "}
            <span className="font-medium text-foreground">“{query.trim()}”</span>, best first.{" "}
            {searchSkipsTrashNote(tabId)}
          </p>
        ) : null}
        {rowsForTab.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={threadSelection.allSelected}
                onChange={() => threadSelection.toggleSelectAll()}
                aria-label="Select all messages"
              />
              {hasSelection ? `${threadSelection.selectedIds.size} selected` : "Select all"}
            </label>
            {hasSelection ? <div className="flex flex-wrap items-center gap-1.5">{bulkButtons}</div> : null}
          </div>
        ) : null}
      </div>
      <div className={INBOX_LIST_SCROLL}>
        {rowsForTab.length === 0 ? (
          <div className="p-4">
            <PortalInboxEmptyState title={searchActive ? `No messages match “${query.trim()}”.` : emptyCopy} />
          </div>
        ) : (
          rowsForTab.map((thread) => {
            const sentSemantics = searchActive ? thread.folder === "sent" : tabId === "sent";
            const recipientLabel = thread.email || "Unknown recipient";
            const displayName = sentSemantics
              ? searchActive
                ? `To: ${recipientLabel}`
                : recipientLabel
              : thread.from || thread.email || "Unknown sender";
            const msgs = inboxThreadMessages(thread);
            const lastMsg = msgs[msgs.length - 1];
            const folder = thread.folder === "trash" ? inferPreviousFolder(thread) : thread.folder;
            const lastOutbound = msgs.length > 1 ? true : folder === "sent";
            return (
              <InboxConversationRow
                key={thread.id}
                name={displayName}
                subtitle={thread.subject}
                preview={previewLine(lastMsg?.body ?? thread.preview ?? "", 80)}
                previewPrefix={lastOutbound ? "You: " : undefined}
                time={thread.time}
                unread={thread.folder === "inbox" && thread.unread}
                selected={expandedId === thread.id}
                onOpen={() => openThread(thread)}
                leading={rowCheckbox(thread)}
              />
            );
          })
        )}
      </div>
    </div>
  );

  const threadHeaderActions = activeThread ? (
    activeThread.folder === "trash" ? (
      <>
        <Button
          type="button"
          variant="outline"
          className="min-h-0 rounded-full px-3 py-1.5 text-xs"
          onClick={() => restoreFromTrash(activeThread.id)}
        >
          Restore
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-0 rounded-full border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-[var(--status-overdue-bg)]"
          onClick={() => deleteForever(activeThread.id)}
        >
          Delete
        </Button>
      </>
    ) : (
      <Button
        type="button"
        variant="outline"
        className="min-h-0 rounded-full px-3 py-1.5 text-xs"
        data-attr="inbox-thread-trash"
        onClick={() => moveToTrash(activeThread.id)}
      >
        Trash
      </Button>
    )
  ) : null;

  const threadPane = activeThread ? (
    <InboxThreadView
      title={
        activeIsSent
          ? activeThread.email || "Unknown recipient"
          : activeThread.from || activeThread.email || "Unknown sender"
      }
      subtitle={activeThread.subject || (activeIsSent ? undefined : activeThread.email)}
      messages={activeBubbles}
      threadKey={activeThread.id}
      onBack={() => setExpandedId(null)}
      headerActions={threadHeaderActions}
      emptyLabel="No messages in this conversation."
      composer={
        activeThread.folder === "trash" ? undefined : (
          <>
            {activeThread.folder === "inbox" && !editingDraft ? (
              <AiDraftReplyCard
                drafting={draftingIds.has(activeThread.id) && !activeThread.aiDraft}
                draft={activeThread.aiDraft?.text}
                error={draftErrorIds.has(activeThread.id) ? "error" : undefined}
                approving={approvingDraft}
                onApprove={() => void approveDraft(activeThread.id)}
                onEdit={() => startEditDraft(activeThread.id)}
                onDiscard={() => void discardDraft(activeThread.id)}
                onGenerate={
                  !activeThread.aiDraft &&
                  !draftingIds.has(activeThread.id) &&
                  !draftSkippedRef.current.has(activeThread.id) &&
                  draftAttemptedRef.current.has(activeThread.id)
                    ? () => void generateDraft(activeThread.id)
                    : undefined
                }
              />
            ) : null}
            <InboxComposer
              value={replyDraft}
              onChange={setReplyDraft}
              onSubmit={() => void sendActiveReply()}
              sending={replySending}
              placeholder={editingDraft ? "Edit the AI draft, then send…" : "Write a reply…"}
              dataAttr="inbox-reply"
            />
          </>
        )
      }
    />
  ) : (
    <InboxThreadEmpty />
  );

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

      {tabId === "schedule" && !searchActive ? (
        <ManagerInboxSchedulePanel portalBase={portalBase} />
      ) : suppressListPane ? (
        <div className="flex min-h-0 flex-1 flex-col">{threadPane}</div>
      ) : (
        <InboxTwoPane threadOpen={Boolean(activeThread)} list={listPane} thread={threadPane} />
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

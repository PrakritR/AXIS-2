"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills, ManagerPortalFilterRow, PORTAL_FILTER_ACTIONS_MOBILE, PORTAL_HEADER_ACTION_BTN, PORTAL_PAGE_ACTIONS_DESKTOP } from "@/components/portal/portal-metrics";
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
import { ManagerInboxSchedulePanel } from "@/components/portal/manager-inbox-schedule-panel";
import { useScheduledPaymentMessages } from "@/components/portal/payment-schedule-ui";
import { MANAGER_APPLICATIONS_EVENT } from "@/lib/manager-applications-storage";
import { buildManagerInboxLiveContacts } from "@/lib/manager-inbox-contacts";
import {
  isUpcomingScheduledInboxMessage,
  type ScheduledInboxMessageRecord,
} from "@/lib/scheduled-inbox-messages";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
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
    topic: t.subject,
    preview: t.preview,
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

export function ManagerInbox({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const portalBase = usePaidPortalBasePath();
  const { messages: scheduledMessages } = useScheduledPaymentMessages({ includeHidden: false });
  const [manualScheduledMessages, setManualScheduledMessages] = useState<ScheduledInboxMessageRecord[]>([]);

  useEffect(() => {
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
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener("axis-pro-relationships", bump);
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

  const counts = useMemo(() => countThreads(local, scheduleCount), [local, scheduleCount]);
  const tabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    [counts],
  );

  function threadTimestamp(t: InboxThread): number {
    const match = t.id.match(/(\d{10,})/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  const rowsForTab = useMemo(() => {
    let filtered: InboxThread[];
    if (tabId === "unopened") filtered = local.filter((t) => t.folder === "inbox" && t.unread);
    else if (tabId === "opened") filtered = local.filter((t) => t.folder === "inbox" && !t.unread);
    else if (tabId === "sent") filtered = local.filter((t) => t.folder === "sent");
    else if (tabId === "trash") filtered = local.filter((t) => t.folder === "trash");
    else filtered = [];

    return [...filtered].sort((a, b) => threadTimestamp(b) - threadTimestamp(a));
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

  const deleteAllTrash = () => {
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
  };

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
              deliverViaEmail: p.deliverViaEmail !== false,
              deliverViaSms: p.deliverViaSms,
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
              ? "Message sent to Axis admin."
              : "Message sent via inbox and email.",
          );
          navigate(`${portalBase}/inbox/sent`);
        } catch {
          showToast("Message could not be sent.");
        }
      })();
    },
    [navigate, showToast, portalBase],
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

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
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
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setComposeOpen(true)}>
            New message
          </Button>
        </div>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={tabs}
            activeId={tabId}
            onChange={(id) => navigate(`${portalBase}/inbox/${id}`)}
          />
          <div className={PORTAL_FILTER_ACTIONS_MOBILE}>
            {tabId === "trash" ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_HEADER_ACTION_BTN}
                onClick={deleteAllTrash}
              >
                Empty trash
              </Button>
            ) : null}
            <Button type="button" variant="primary" className={PORTAL_HEADER_ACTION_BTN} onClick={() => setComposeOpen(true)}>
              New
            </Button>
          </div>
        </ManagerPortalFilterRow>
      }
    >
      <ScopedInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
        portal="manager"
        senderName="Property manager"
        senderEmail="manager@example.com"
        liveContacts={liveContacts}
      />

      {tabId === "schedule" ? (
        <ManagerInboxSchedulePanel portalBase={portalBase} />
      ) : rowsForTab.length === 0 ? (
        <PortalInboxEmptyState title={emptyCopy} />
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
      )}
    </ManagerPortalPageShell>
  );
}

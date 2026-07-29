"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ManagerInbox, type ManagerInboxHandle } from "@/components/portal/manager-inbox";
import { ManagerSmsPanel, type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import {
  INBOX_LIST_SCROLL,
  InboxConversationRow,
  InboxListSegmentTabs,
  InboxThreadEmpty,
  InboxTwoPane,
  PORTAL_INBOX_LIST_TOOLBAR_CLASS,
  PortalInboxEmptyState,
  type InboxListSegment,
} from "@/components/portal/portal-inbox-ui";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";
import {
  threadPassesCommunicationFilters,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  collapsePersonInboxThreads,
  loadPersistedInbox,
  inboxThreadMessages,
  inboxThreadSortMs,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import {
  mergeUnifiedInboxItems,
  parseUnifiedInboxKey,
  unifiedInboxKey,
  type CommunicationListSort,
  type UnifiedInboxListItem,
} from "@/lib/unified-inbox-merge";
import {
  normalizeManagerSmsConversationsPayload,
  smsConversationDisplayName,
  smsConversationSubtitle,
  smsThreadHasUnread,
  type ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";

const SMS_OPENED_STORAGE_KEY = "axis_manager_sms_opened_v1";
const SMS_HIDDEN_STORAGE_KEY = "axis_manager_sms_hidden_v2";

function previewLine(body: string, max = 80) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function smsConversationId(resident: ManagerSmsResidentConversation): string {
  return (
    resident.conversationKey ??
    resident.phone ??
    resident.residentUserId ??
    resident.residentEmail ??
    resident.name
  );
}

function loadSmsOpenedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SMS_OPENED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function loadSmsHiddenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SMS_HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function iosListTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

/** Desktop shows list + thread together; phones use list-then-thread navigation. */
function inboxUsesDesktopSplit(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function ManagerUnifiedInbox({
  tabId,
  commBase,
  threadFilters,
  filterContacts,
  listSort = "recent",
  smsUiEnabled = false,
  onSmsUnreadCountChange,
  inboxRef,
  smsRef,
  onThreadOpenChange,
}: {
  tabId: string;
  commBase: string;
  threadFilters?: CommunicationThreadFilters;
  filterContacts?: InboxScopedContact[];
  /** Conversation list order — default is most recent activity. */
  listSort?: CommunicationListSort;
  /** When false, SMS conversations / rows / panel are hidden (transport unaffected). */
  smsUiEnabled?: boolean;
  onSmsUnreadCountChange?: (unread: number) => void;
  inboxRef?: React.RefObject<ManagerInboxHandle | null>;
  smsRef?: React.RefObject<ManagerSmsPanelHandle | null>;
  onThreadOpenChange?: (open: boolean) => void;
}) {
  const [emailThreads, setEmailThreads] = useState(() =>
    loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []),
  );
  const [smsResidents, setSmsResidents] = useState<ManagerSmsResidentConversation[]>([]);
  const [smsOpenedIds, setSmsOpenedIds] = useState<Set<string>>(() => loadSmsOpenedIds());
  const [smsHiddenIds, setSmsHiddenIds] = useState<Set<string>>(() => loadSmsHiddenIds());
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [listSegment, setListSegment] = useState<InboxListSegment>("active");

  useEffect(() => {
    const sync = () => setEmailThreads(loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
  }, []);

  useEffect(() => {
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
      setEmailThreads(rows);
    });
  }, []);

  const loadSms = useCallback(async () => {
    // SMS UI hidden until A2P clears — never fetch SMS conversations. Inbound
    // texts still land as inbox notices and fall through to the unified list
    // (see filterEmailInboxThreads keepSmsLike below); transport is unaffected.
    if (!smsUiEnabled) return;
    try {
      const res = await fetch("/api/manager/sms-conversations", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { residents?: ManagerSmsResidentConversation[] };
      const normalized = normalizeManagerSmsConversationsPayload(body);
      setSmsResidents(normalized.residents);
    } catch {
      /* keep prior */
    }
  }, [smsUiEnabled]);

  useEffect(() => {
    // smsUiEnabled is a stable server prop; when off, loadSms no-ops and
    // smsResidents stays its initial [] — no fetch, no polling.
    if (!smsUiEnabled) return;
    void loadSms();
    // Poll for inbound texts, but skip while the tab is backgrounded (no point
    // spending egress on a hidden page) and refetch immediately on refocus so
    // the list is fresh the moment the manager returns.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadSms();
    };
    const id = window.setInterval(tick, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadSms();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadSms, smsUiEnabled]);

  // Stable identity: passed into ManagerSmsPanel's controlled-open effect, so an
  // inline callback here would change every render and loop the effect forever.
  // Opening a conversation only changes local read state — refresh the opened-id
  // set for the unread badges, but do NOT refetch (the server data is unchanged,
  // and the open SMS panel already reloads on its own; a refetch here was a
  // redundant round-trip on every thread open).
  const handleSmsConversationOpened = useCallback(() => {
    setSmsOpenedIds(loadSmsOpenedIds());
  }, []);

  const filteredEmail = useMemo(() => {
    // When SMS UI is hidden, KEEP SMS-like inbound notices so an inbound text is
    // still visible in the person's conversation instead of vanishing into a
    // hidden SMS panel.
    const base = collapsePersonInboxThreads(
      filterEmailInboxThreads(emailThreads, { keepSmsLike: !smsUiEnabled }),
      { mergeFolders: true },
    );
    if (!threadFilters || !filterContacts) return base;
    return base.filter((t) =>
      threadPassesCommunicationFilters({
        filters: threadFilters,
        contacts: filterContacts,
        counterpartyEmail: t.email,
      }),
    );
  }, [emailThreads, threadFilters, filterContacts, smsUiEnabled]);

  const emailListItems = useMemo((): UnifiedInboxListItem[] => {
    const q = query.trim().toLowerCase();
    let rows = filteredEmail;
    if (q) {
      // Search spans every conversation except archived/trash.
      rows = rows.filter((t) => {
        if (t.folder === "trash") return false;
        const hay = [t.from, t.email, t.subject, t.body, t.preview].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    } else if (listSegment === "archived") {
      rows = rows.filter((t) => t.folder === "trash");
    } else if (listSegment === "unread") {
      rows = rows.filter((t) => t.folder !== "trash" && t.folder === "inbox" && t.unread);
    } else {
      rows = rows.filter((t) => t.folder !== "trash");
    }

    return rows.map((t) => {
      const msgs = inboxThreadMessages(t);
      const lastMsg = msgs[msgs.length - 1];
      const sentSemantics = t.folder === "sent";
      const displayName = sentSemantics ? t.email || "Unknown recipient" : t.from || t.email || "Unknown sender";
      const lastOutbound = lastMsg?.outbound ?? (msgs.length > 1 ? true : t.folder === "sent");
      return {
        key: unifiedInboxKey("email", t.id),
        channel: "email" as const,
        threadId: t.id,
        name: displayName,
        subtitle: t.subject,
        preview: previewLine(lastMsg?.body ?? t.preview ?? "", 80),
        previewPrefix: lastOutbound ? "You: " : undefined,
        time: t.time,
        unread: t.folder === "inbox" && t.unread,
        sortMs: inboxThreadSortMs(t.id, lastMsg?.at),
      };
    });
  }, [filteredEmail, query, listSegment]);

  // SMS rows (scoped + de-hidden), each tagged with its haystack and
  // last-message direction. Empty unless the SMS UI flag is on.
  const allSmsItems = useMemo((): { item: UnifiedInboxListItem; lastOutbound: boolean; haystack: string }[] => {
    if (!smsUiEnabled) return [];
    const scoped = !threadFilters || !filterContacts
      ? smsResidents
      : smsResidents.filter((resident) =>
          threadPassesCommunicationFilters({
            filters: threadFilters,
            contacts: filterContacts,
            counterpartyEmail: resident.residentEmail,
            propertyLabel: resident.propertyLabel,
            isResidentThread: true,
          }),
        );

    return scoped
      .map((resident) => {
        const messages = Array.isArray(resident.messages) ? resident.messages : [];
        const lastMessage = messages[messages.length - 1] ?? null;
        const rowId = smsConversationId(resident);
        if (!lastMessage || smsHiddenIds.has(rowId)) return null;
        const unread = smsThreadHasUnread(messages, smsOpenedIds);
        const lastOutbound = lastMessage.direction === "outbound";
        const item: UnifiedInboxListItem = {
          key: unifiedInboxKey("sms", rowId),
          channel: "sms",
          threadId: rowId,
          // Never surface a raw phone number in Communication — show name/unit.
          name: smsConversationDisplayName(resident),
          subtitle: smsConversationSubtitle(resident) || undefined,
          preview: previewLine(lastMessage.body, 80),
          previewPrefix: lastOutbound ? "You: " : undefined,
          time: iosListTimestamp(lastMessage.createdAt),
          unread,
          sortMs: Date.parse(lastMessage.createdAt) || 0,
        };
        // The phone is hidden in the UI but stays in the search index — a
        // manager who types a resident's number must still find the thread.
        const haystack = [
          resident.name,
          resident.phone,
          resident.residentEmail,
          resident.propertyLabel,
          lastMessage.body,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return { item, lastOutbound, haystack };
      })
      .filter((x): x is { item: UnifiedInboxListItem; lastOutbound: boolean; haystack: string } => x !== null);
  }, [filterContacts, smsHiddenIds, smsOpenedIds, smsResidents, threadFilters, smsUiEnabled]);

  const smsListItems = useMemo((): UnifiedInboxListItem[] => {
    if (listSegment === "archived") return [];
    const q = query.trim().toLowerCase();
    let items = allSmsItems;
    if (listSegment === "unread") {
      items = items.filter(({ item }) => item.unread);
    }
    return items.filter(({ haystack }) => (q ? haystack.includes(q) : true)).map(({ item }) => item);
  }, [allSmsItems, query, listSegment]);

  const mergedRows = useMemo(
    () => mergeUnifiedInboxItems([...emailListItems, ...smsListItems], listSort),
    [emailListItems, smsListItems, listSort],
  );

  const archivedCount = useMemo(
    () => filteredEmail.filter((t) => t.folder === "trash").length,
    [filteredEmail],
  );

  const unreadCount = useMemo(() => {
    const emailUnread = filteredEmail.filter((t) => t.folder === "inbox" && t.unread).length;
    const smsUnread = allSmsItems.filter(({ item }) => item.unread).length;
    return emailUnread + smsUnread;
  }, [filteredEmail, allSmsItems]);

  const selection = useMemo(() => (selectedKey ? parseUnifiedInboxKey(selectedKey) : null), [selectedKey]);

  useEffect(() => {
    onThreadOpenChange?.(mobileThreadOpen && Boolean(selection));
  }, [onThreadOpenChange, mobileThreadOpen, selection]);

  // Toggling the segment is a different result set — clear search; return to list on phones.
  useEffect(() => {
    setQuery("");
    setMobileThreadOpen(false);
    if (!inboxUsesDesktopSplit()) {
      setSelectedKey(null);
    }
  }, [listSegment]);

  useEffect(() => {
    if (mergedRows.length === 0) {
      setSelectedKey(null);
      setMobileThreadOpen(false);
      return;
    }
    setSelectedKey((cur) => {
      if (cur && mergedRows.some((r) => r.key === cur)) return cur;
      if (inboxUsesDesktopSplit()) return mergedRows[0]!.key;
      return null;
    });
  }, [mergedRows]);

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={PORTAL_INBOX_LIST_TOOLBAR_CLASS}>
        <InboxListSegmentTabs
          value={listSegment}
          onChange={setListSegment}
          unreadTotal={unreadCount}
          archivedTotal={archivedCount}
        />
        <div className="relative min-w-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search residents or messages"
            className="portal-inbox-search h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            data-attr="unified-inbox-search"
          />
        </div>
        {mergedRows.length > 0 ? (
          <p className="hidden px-1 text-[11px] text-muted sm:block">
            {mergedRows.length} conversation{mergedRows.length === 1 ? "" : "s"}
            {query.trim() ? ` matching “${query.trim()}”` : ""}
          </p>
        ) : null}
      </div>
      <div className={INBOX_LIST_SCROLL}>
        {mergedRows.length === 0 ? (
          <div className="p-4">
            <PortalInboxEmptyState
              title={
                query.trim()
                  ? `No messages match “${query.trim()}”.`
                  : listSegment === "archived"
                    ? "No archived conversations."
                    : listSegment === "unread"
                      ? "No unread conversations."
                      : "No conversations yet."
              }
            />
          </div>
        ) : (
          mergedRows.map((row) => (
            <InboxConversationRow
              key={row.key}
              name={row.name}
              subtitle={row.subtitle}
              preview={row.preview}
              previewPrefix={row.previewPrefix}
              time={row.time}
              unread={row.unread}
              unreadCount={row.unread ? 1 : 0}
              selected={selectedKey === row.key}
              channelBadge={row.channel === "email" ? "Email" : "SMS"}
              onOpen={() => {
                setSelectedKey(row.key);
                setMobileThreadOpen(true);
              }}
            />
          ))
        )}
      </div>
    </div>
  );

  const threadPane =
    selection?.channel === "email" ? (
      <ManagerInbox
        ref={inboxRef}
        tabId={tabId}
        embeddedInCommunication
        externalTitleActions
        suppressCompose
        suppressListPane
        commBase={commBase}
        threadFilters={threadFilters}
        filterContacts={filterContacts}
        controlledExpandedId={selection.threadId}
        onControlledExpandedIdChange={(id) => {
          if (!id) {
            setSelectedKey(null);
            setMobileThreadOpen(false);
          }
        }}
      />
    ) : selection?.channel === "sms" ? (
      <ManagerSmsPanel
        ref={smsRef}
        threadFilters={threadFilters}
        filterContacts={filterContacts}
        allowInlineCompose={false}
        suppressListPane
        controlledActiveId={selection.threadId}
        onControlledActiveIdChange={(id) => {
          if (!id) {
            setSelectedKey(null);
            setMobileThreadOpen(false);
          }
        }}
        onUnreadCountChange={onSmsUnreadCountChange}
        onConversationOpened={handleSmsConversationOpened}
      />
    ) : (
      <InboxThreadEmpty
        title="Select a conversation"
        hint="Choose a resident on the left to read and reply."
      />
    );

  return (
    <InboxTwoPane
      mobileCompact
      className="max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
      threadOpen={mobileThreadOpen && Boolean(selection)}
      list={listPane}
      thread={threadPane}
    />
  );
}

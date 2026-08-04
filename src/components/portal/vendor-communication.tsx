"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VendorInboxPanel, type VendorInboxPanelHandle } from "@/components/portal/vendor-inbox-panel";
import { RoleSmsPanel } from "@/components/portal/role-sms-panel";
import {
  INBOX_LIST_SCROLL,
  InboxConversationRow,
  InboxTwoPane,
  PortalInboxEmptyState,
  type InboxListSegment,
} from "@/components/portal/portal-inbox-ui";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PORTAL_HEADER_PRIMARY_ACTION_BTN } from "@/components/portal/portal-metrics";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";
import {
  mergeUnifiedInboxItems,
  parseUnifiedInboxKey,
  unifiedInboxKey,
  type UnifiedInboxListItem,
} from "@/lib/unified-inbox-merge";
import {
  PORTAL_INBOX_CHANGED_EVENT,
  VENDOR_INBOX_STORAGE_KEY,
  inboxThreadMessages,
  inboxThreadSortMs,
  loadPersistedInbox,
} from "@/lib/portal-inbox-storage";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  normalizeRoleSmsPayload,
  smsMessageBucket,
  type ManagerSmsBucketId,
  type ManagerSmsMessageRow,
} from "@/lib/manager-sms-messages";

const SMS_THREAD_ID = "text-messages";
const SMS_OPENED_KEY = "axis_role_sms_opened_vendor";

function previewLine(body: string, max = 80) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function loadOpenedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SMS_OPENED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function VendorUnifiedInbox({
  inboxRef,
  smsUiEnabled,
  listSegment,
  routeThreadId,
  searchQuery,
  onThreadOpenChange,
  onFolderCountsChange,
  commBase,
}: {
  inboxRef: React.RefObject<VendorInboxPanelHandle | null>;
  smsUiEnabled: boolean;
  listSegment: InboxListSegment;
  routeThreadId?: string;
  searchQuery: string;
  onThreadOpenChange?: (open: boolean) => void;
  onFolderCountsChange?: (counts: { unread: number; archived: number }) => void;
  commBase: string;
}) {
  const navigate = usePortalNavigate();
  const [emailThreads, setEmailThreads] = useState(() => loadPersistedInbox(VENDOR_INBOX_STORAGE_KEY, []));
  const [smsMessages, setSmsMessages] = useState<ManagerSmsMessageRow[]>([]);
  const [smsOpened] = useState<Set<string>>(() => loadOpenedIds());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setEmailThreads(loadPersistedInbox(VENDOR_INBOX_STORAGE_KEY, []));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
  }, []);

  useEffect(() => {
    if (!smsUiEnabled) return;
    void (async () => {
      try {
        const res = await fetch("/api/vendor/sms-conversations", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        setSmsMessages(normalizeRoleSmsPayload(body).messages);
      } catch {
        /* keep */
      }
    })();
  }, [smsUiEnabled]);

  useEffect(() => {
    setSelectedKey(null);
  }, [listSegment]);

  const filteredEmail = useMemo(
    () => filterEmailInboxThreads(emailThreads, { keepSmsLike: !smsUiEnabled }),
    [emailThreads, smsUiEnabled],
  );

  const emailItems = useMemo((): UnifiedInboxListItem[] => {
    const q = searchQuery.trim().toLowerCase();
    let rows = filteredEmail;
    if (q) {
      rows = rows.filter((t) => {
        if (t.folder === "trash") return false;
        const hay = [t.from, t.email, t.subject, t.body, t.preview].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    } else if (listSegment === "archived") {
      rows = rows.filter((t) => t.folder === "trash");
    } else {
      rows = rows.filter((t) => t.folder !== "trash");
    }

    return rows.map((t) => {
      const msgs = inboxThreadMessages(t);
      const lastMsg = msgs[msgs.length - 1];
      const sentSemantics = t.folder === "sent";
      return {
        key: unifiedInboxKey("email", t.id),
        channel: "email" as const,
        threadId: t.id,
        name: sentSemantics ? t.email || "Recipient" : t.from || t.email || "Sender",
        subtitle: t.subject,
        preview: previewLine(lastMsg?.body ?? t.preview ?? "", 80),
        previewPrefix: t.folder === "sent" ? "You: " : undefined,
        time: t.time,
        unread: t.folder === "inbox" && t.unread,
        sortMs: inboxThreadSortMs(t.id, lastMsg?.at),
      };
    });
  }, [filteredEmail, searchQuery, listSegment]);

  const smsItems = useMemo((): UnifiedInboxListItem[] => {
    if (!smsUiEnabled || listSegment === "archived") return [];
    const scoped = smsMessages;
    if (scoped.length === 0) return [];
    const last = [...scoped].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    const unread = scoped.some((m) => m.direction === "inbound" && smsMessageBucket(m, smsOpened) === "unopened");
    const item: UnifiedInboxListItem = {
      key: unifiedInboxKey("sms", SMS_THREAD_ID),
      channel: "sms",
      threadId: SMS_THREAD_ID,
      name: "Text messages",
      subtitle: "Property management",
      preview: previewLine(last.body, 80),
      previewPrefix: last.direction === "outbound" ? "You: " : undefined,
      time: new Date(last.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      unread,
      sortMs: Date.parse(last.createdAt) || 0,
    };
    const q = searchQuery.trim().toLowerCase();
    if (q && !["text messages", "property manager", last.body].join(" ").toLowerCase().includes(q)) return [];
    return [item];
  }, [listSegment, searchQuery, smsMessages, smsOpened, smsUiEnabled]);

  const merged = useMemo(() => mergeUnifiedInboxItems([...emailItems, ...smsItems]), [emailItems, smsItems]);
  const selection = useMemo(() => (selectedKey ? parseUnifiedInboxKey(selectedKey) : null), [selectedKey]);
  const archivedCount = useMemo(() => filteredEmail.filter((t) => t.folder === "trash").length, [filteredEmail]);
  const unreadCount = useMemo(() => {
    const emailUnread = filteredEmail.filter((t) => t.folder === "inbox" && t.unread).length;
    const smsUnread = smsUiEnabled
      ? smsMessages.some((m) => m.direction === "inbound" && smsMessageBucket(m, smsOpened) === "unopened")
        ? 1
        : 0
      : 0;
    return emailUnread + smsUnread;
  }, [filteredEmail, smsMessages, smsOpened, smsUiEnabled]);

  useEffect(() => {
    onFolderCountsChange?.({ unread: unreadCount, archived: archivedCount });
  }, [archivedCount, onFolderCountsChange, unreadCount]);

  useEffect(() => {
    if (!routeThreadId) return;
    const match = merged.find((r) => r.threadId === routeThreadId);
    if (match) setSelectedKey(match.key);
  }, [routeThreadId, merged]);

  useEffect(() => {
    onThreadOpenChange?.(Boolean(selection));
  }, [onThreadOpenChange, selection]);

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      {merged.length > 0 && searchQuery.trim() ? (
        <p className="mb-2 hidden px-1 text-[11px] text-muted sm:block">
          {merged.length} conversation{merged.length === 1 ? "" : "s"} matching “{searchQuery.trim()}”
        </p>
      ) : null}
      <div className={INBOX_LIST_SCROLL}>
        {merged.length === 0 ? (
          <div className="p-4">
            <PortalInboxEmptyState
              title={
                searchQuery.trim()
                  ? `No messages match “${searchQuery.trim()}”.`
                  : listSegment === "archived"
                    ? "No archived conversations."
                    : "No conversations yet."
              }
            />
          </div>
        ) : (
          merged.map((row) => (
            <InboxConversationRow
              key={row.key}
              name={row.name}
              subtitle={row.subtitle}
              preview={row.preview}
              previewPrefix={row.previewPrefix}
              time={row.time}
              unread={row.unread}
              selected={selectedKey === row.key}
              channelBadge={row.channel === "email" ? "Email" : "SMS"}
              onOpen={() => {
                setSelectedKey(row.key);
                navigate(`${commBase}/${listSegment}/${row.threadId}`);
              }}
            />
          ))
        )}
      </div>
    </div>
  );

  const smsSelected = selection?.channel === "sms";
  const threadPane = (
    <>
      {smsSelected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <RoleSmsPanel apiPath="/api/vendor/sms-conversations" storageScope="vendor" tabId={"all" as ManagerSmsBucketId} />
        </div>
      ) : null}
      <div className={smsSelected ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        <VendorInboxPanel
          ref={inboxRef}
          tabId={listSegment === "archived" ? "trash" : "all"}
          embeddedInCommunication
          externalTitleActions
          suppressListPane
          smsUiEnabled={smsUiEnabled}
          controlledExpandedId={selection?.channel === "email" ? selection.threadId : null}
          onControlledExpandedIdChange={(id) => {
            if (!id) {
              setSelectedKey(null);
              navigate(`${commBase}/${listSegment}`);
              return;
            }
            setSelectedKey(unifiedInboxKey("email", id));
            navigate(`${commBase}/${listSegment}/${id}`);
          }}
        />
      </div>
    </>
  );

  return (
    <InboxTwoPane
      heightMode="viewport"
      fillViewport={Boolean(selection)}
      fillParent
      mobileCompact
      className="min-h-0 flex-1 max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
      threadOpen={Boolean(selection)}
      list={listPane}
      thread={threadPane}
    />
  );
}

/** @deprecated Folder tabs removed; kept so legacy routes still resolve. */
export type VendorEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

export function VendorCommunication({
  listSegment = "active",
  threadId,
  smsUiEnabled = false,
}: {
  /** Routed conversation list segment (Active / Archived). */
  listSegment?: InboxListSegment;
  /** Deep-linked thread id from `/communication/{segment}/{threadId}`. */
  threadId?: string;
  /** @deprecated Folder tabs removed; kept so legacy routes still resolve. */
  inboxTabId?: VendorEmailTabId;
  smsUiEnabled?: boolean;
}) {
  const commBase = "/vendor/communication";
  const inboxRef = useRef<VendorInboxPanelHandle>(null);
  const [threadOpen, setThreadOpen] = useState(Boolean(threadId));
  const [searchQuery, setSearchQuery] = useState("");
  const [archivedCount, setArchivedCount] = useState(0);

  useEffect(() => {
    setThreadOpen(Boolean(threadId));
  }, [threadId]);

  const onFolderCountsChange = useCallback((counts: { unread: number; archived: number }) => {
    setArchivedCount(counts.archived);
  }, []);

  const newMessageButton = (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_PRIMARY_ACTION_BTN}`}
      data-attr="communication-new-message"
      onClick={() => inboxRef.current?.openCompose()}
    >
      New message
    </Button>
  );

  const controlStack = (
    <PortalListControlStack
      destinations={[
        { id: "active", label: "Active", href: `${commBase}/active`, dataAttr: "communication-segment-active" },
        {
          id: "archived",
          label: "Archived",
          href: `${commBase}/archived`,
          count: archivedCount,
          dataAttr: "communication-segment-archived",
        },
      ]}
      activeDestinationId={listSegment}
      destinationAriaLabel="Conversation folders"
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search messages",
        dataAttr: "vendor-inbox-search",
      }}
    />
  );

  return (
    <PortalCommunicationShell
      title="Communication"
      titleAside={newMessageButton}
      hideTitleOnMobileNav
      controlStack={controlStack}
      hideMobileFilterRow={threadOpen}
      mobileThreadReading={threadOpen}
    >
      <VendorUnifiedInbox
        inboxRef={inboxRef}
        smsUiEnabled={smsUiEnabled}
        listSegment={listSegment}
        routeThreadId={threadId}
        searchQuery={searchQuery}
        onThreadOpenChange={setThreadOpen}
        onFolderCountsChange={onFolderCountsChange}
        commBase={commBase}
      />
    </PortalCommunicationShell>
  );
}

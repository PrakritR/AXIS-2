"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResidentInboxPanel, type ResidentInboxPanelHandle, type ResidentInboxTabCounts } from "@/components/portal/resident-inbox-panel";
import { RoleSmsPanel } from "@/components/portal/role-sms-panel";
import {
  INBOX_LIST_SCROLL,
  InboxConversationRow,
  InboxThreadEmpty,
  InboxTwoPane,
  PortalInboxEmptyState,
} from "@/components/portal/portal-inbox-ui";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { INBOX_TAB_DEFS } from "@/components/portal/portal-inbox-ui";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";
import {
  mergeUnifiedInboxItems,
  parseUnifiedInboxKey,
  unifiedInboxKey,
  type UnifiedInboxListItem,
} from "@/lib/unified-inbox-merge";
import {
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  inboxThreadMessages,
  loadPersistedInbox,
} from "@/lib/portal-inbox-storage";
import {
  normalizeRoleSmsPayload,
  smsMessageBucket,
  type ManagerSmsBucketId,
  type ManagerSmsMessageRow,
} from "@/lib/manager-sms-messages";

const SMS_THREAD_ID = "text-messages";
const SMS_OPENED_KEY = "axis_role_sms_opened_resident";

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

function smsMatchesTab(tabId: string, msg: ManagerSmsMessageRow, opened: Set<string>): boolean {
  if (tabId === "schedule" || tabId === "trash") return false;
  const bucket = smsMessageBucket(msg, opened);
  if (tabId === "unopened") return bucket === "unopened";
  if (tabId === "opened") return bucket === "opened";
  if (tabId === "sent") return bucket === "sent";
  return true;
}

function ResidentUnifiedInbox({
  tabId,
  inboxRef,
  onTabCountsChange,
}: {
  tabId: string;
  inboxRef: React.RefObject<ResidentInboxPanelHandle | null>;
  onTabCountsChange: (counts: ResidentInboxTabCounts) => void;
}) {
  const [emailThreads, setEmailThreads] = useState(() => loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, []));
  const [smsMessages, setSmsMessages] = useState<ManagerSmsMessageRow[]>([]);
  const [smsOpened, setSmsOpened] = useState<Set<string>>(() => loadOpenedIds());
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setEmailThreads(loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, []));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/resident/sms-conversations", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        setSmsMessages(normalizeRoleSmsPayload(body).messages);
      } catch {
        /* keep */
      }
    })();
  }, []);

  useEffect(() => {
    setSelectedKey(null);
    setQuery("");
  }, [tabId]);

  const filteredEmail = useMemo(() => filterEmailInboxThreads(emailThreads), [emailThreads]);

  const emailItems = useMemo((): UnifiedInboxListItem[] => {
    const q = query.trim().toLowerCase();
    let rows = filteredEmail;
    if (q) {
      rows = rows.filter((t) => {
        if (t.folder === "trash") return false;
        const hay = [t.from, t.email, t.subject, t.body, t.preview].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    } else if (tabId === "unopened") rows = rows.filter((t) => t.folder === "inbox" && t.unread);
    else if (tabId === "opened") rows = rows.filter((t) => t.folder === "inbox" && !t.unread);
    else if (tabId === "sent") rows = rows.filter((t) => t.folder === "sent");
    else if (tabId === "trash") rows = rows.filter((t) => t.folder === "trash");
    else rows = [];

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
        sortMs: Date.parse(lastMsg?.at ?? "") || 0,
      };
    });
  }, [filteredEmail, query, tabId]);

  const smsItems = useMemo((): UnifiedInboxListItem[] => {
    if (tabId === "schedule" || tabId === "trash") return [];
    const scoped = smsMessages.filter((m) => smsMatchesTab(tabId, m, smsOpened));
    if (scoped.length === 0) return [];
    const last = [...scoped].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    const unread = scoped.some((m) => m.direction === "inbound" && smsMessageBucket(m, smsOpened) === "unopened");
    const item: UnifiedInboxListItem = {
      key: unifiedInboxKey("sms", SMS_THREAD_ID),
      channel: "sms",
      threadId: SMS_THREAD_ID,
      name: "Text messages",
      subtitle: "Property manager",
      preview: previewLine(last.body, 80),
      previewPrefix: last.direction === "outbound" ? "You: " : undefined,
      time: new Date(last.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      unread,
      sortMs: Date.parse(last.createdAt) || 0,
    };
    const q = query.trim().toLowerCase();
    if (q && !["text messages", "property manager", last.body].join(" ").toLowerCase().includes(q)) return [];
    return [item];
  }, [query, smsMessages, smsOpened, tabId]);

  const merged = useMemo(() => mergeUnifiedInboxItems([...emailItems, ...smsItems]), [emailItems, smsItems]);
  const selection = useMemo(() => (selectedKey ? parseUnifiedInboxKey(selectedKey) : null), [selectedKey]);

  useEffect(() => {
    const smsUnread = smsMessages.some(
      (m) => m.direction === "inbound" && smsMessageBucket(m, smsOpened) === "unopened",
    );
    onTabCountsChange({
      unopened: filteredEmail.filter((t) => t.folder === "inbox" && t.unread).length + (smsUnread ? 1 : 0),
      opened: filteredEmail.filter((t) => t.folder === "inbox" && !t.unread).length,
      schedule: 0,
      sent: filteredEmail.filter((t) => t.folder === "sent").length,
      trash: filteredEmail.filter((t) => t.folder === "trash").length,
    });
  }, [filteredEmail, onTabCountsChange, smsMessages, smsOpened]);

  if (tabId === "schedule") {
    return (
      <ResidentInboxPanel
        ref={inboxRef}
        tabId={tabId}
        embeddedInCommunication
        externalTitleActions
        onTabCountsChange={onTabCountsChange}
      />
    );
  }

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages"
          className="h-9 w-full rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className={INBOX_LIST_SCROLL}>
        {merged.length === 0 ? (
          <div className="p-4">
            <PortalInboxEmptyState title="No messages yet." />
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
              onOpen={() => setSelectedKey(row.key)}
            />
          ))
        )}
      </div>
    </div>
  );

  const smsTab = (tabId === "unopened" ? "unopened" : tabId === "opened" ? "opened" : tabId === "sent" ? "sent" : "all") as ManagerSmsBucketId;

  const threadPane =
    selection?.channel === "email" ? (
      <ResidentInboxPanel
        ref={inboxRef}
        tabId={tabId}
        embeddedInCommunication
        externalTitleActions
        suppressListPane
        controlledExpandedId={selection.threadId}
        onControlledExpandedIdChange={(id) => {
          if (!id) setSelectedKey(null);
        }}
        onTabCountsChange={onTabCountsChange}
      />
    ) : selection?.channel === "sms" ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        <RoleSmsPanel apiPath="/api/resident/sms-conversations" storageScope="resident" tabId={smsTab} />
      </div>
    ) : (
      <InboxThreadEmpty />
    );

  return <InboxTwoPane threadOpen={Boolean(selection)} list={listPane} thread={threadPane} />;
}

export type ResidentEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

export function ResidentCommunication({ inboxTabId = "unopened" }: { inboxTabId?: ResidentEmailTabId }) {
  const navigate = usePortalNavigate();
  const commBase = `${RESIDENT_PORTAL_BASE_PATH}/communication`;
  const inboxRef = useRef<ResidentInboxPanelHandle>(null);
  const [tabCounts, setTabCounts] = useState<ResidentInboxTabCounts>({
    unopened: 0,
    opened: 0,
    schedule: 0,
    sent: 0,
    trash: 0,
  });

  const handleTabCountsChange = useCallback((counts: ResidentInboxTabCounts) => {
    setTabCounts(counts);
  }, []);

  const statusPills = (
    <ManagerPortalStatusPills
      activeTone="primary"
      tabs={INBOX_TAB_DEFS.map(({ id, label }) => ({
        id,
        label,
        count: tabCounts[id as keyof ResidentInboxTabCounts],
      }))}
      activeId={inboxTabId}
      onChange={(id) => navigate(`${commBase}/inbox/${id}`)}
    />
  );

  const titleAside = (
    <>
      {inboxTabId === "trash" && tabCounts.trash > 0 ? (
        <Button
          type="button"
          variant="outline"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} text-[var(--status-overdue-fg)]`}
          onClick={() => inboxRef.current?.emptyTrash()}
        >
          Empty trash
        </Button>
      ) : null}
      <Button
        type="button"
        variant="primary"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        onClick={() => inboxRef.current?.openCompose()}
      >
        New message
      </Button>
    </>
  );

  return (
    <PortalCommunicationShell title="Communication" titleAside={titleAside} statusPills={statusPills}>
      <ResidentUnifiedInbox tabId={inboxTabId} inboxRef={inboxRef} onTabCountsChange={handleTabCountsChange} />
    </PortalCommunicationShell>
  );
}

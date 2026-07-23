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
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
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

function ResidentUnifiedInbox({
  inboxRef,
  smsUiEnabled,
}: {
  inboxRef: React.RefObject<ResidentInboxPanelHandle | null>;
  smsUiEnabled: boolean;
}) {
  const [emailThreads, setEmailThreads] = useState(() => loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, []));
  const [smsMessages, setSmsMessages] = useState<ManagerSmsMessageRow[]>([]);
  const [smsOpened] = useState<Set<string>>(() => loadOpenedIds());
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Archived (trashed) conversations reachable via a toggle, not a tab.
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const sync = () => setEmailThreads(loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, []));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
  }, []);

  useEffect(() => {
    // SMS UI hidden until A2P clears — never fetch SMS. Inbound texts still land
    // as inbox notices and fall through to the unified list (keepSmsLike below).
    if (!smsUiEnabled) return;
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
  }, [smsUiEnabled]);

  useEffect(() => {
    setSelectedKey(null);
    setQuery("");
  }, [showArchived]);

  const filteredEmail = useMemo(
    () => filterEmailInboxThreads(emailThreads, { keepSmsLike: !smsUiEnabled }),
    [emailThreads, smsUiEnabled],
  );

  const emailItems = useMemo((): UnifiedInboxListItem[] => {
    const q = query.trim().toLowerCase();
    let rows = filteredEmail;
    if (q) {
      rows = rows.filter((t) => {
        if (t.folder === "trash") return false;
        const hay = [t.from, t.email, t.subject, t.body, t.preview].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    } else if (showArchived) {
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
        sortMs: Date.parse(lastMsg?.at ?? "") || 0,
      };
    });
  }, [filteredEmail, query, showArchived]);

  const smsItems = useMemo((): UnifiedInboxListItem[] => {
    if (!smsUiEnabled || showArchived) return [];
    const scoped = smsMessages;
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
  }, [query, smsMessages, smsOpened, smsUiEnabled, showArchived]);

  const merged = useMemo(() => mergeUnifiedInboxItems([...emailItems, ...smsItems]), [emailItems, smsItems]);
  const selection = useMemo(() => (selectedKey ? parseUnifiedInboxKey(selectedKey) : null), [selectedKey]);
  const archivedCount = useMemo(() => filteredEmail.filter((t) => t.folder === "trash").length, [filteredEmail]);

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
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          {merged.length > 0 ? (
            <p className="text-[11px] text-muted">
              {merged.length} conversation{merged.length === 1 ? "" : "s"}
              {query.trim() ? ` matching “${query.trim()}”` : showArchived ? " · archived" : ""}
            </p>
          ) : (
            <span />
          )}
          {!query.trim() ? (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                showArchived
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted hover:bg-foreground/5 hover:text-foreground"
              }`}
              data-attr="resident-inbox-archived-toggle"
              aria-pressed={showArchived}
            >
              {showArchived ? "← Conversations" : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}
            </button>
          ) : null}
        </div>
      </div>
      <div className={INBOX_LIST_SCROLL}>
        {merged.length === 0 ? (
          <div className="p-4">
            <PortalInboxEmptyState
              title={
                query.trim()
                  ? `No messages match “${query.trim()}”.`
                  : showArchived
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
              onOpen={() => setSelectedKey(row.key)}
            />
          ))
        )}
      </div>
    </div>
  );

  const threadPane =
    selection?.channel === "email" ? (
      <ResidentInboxPanel
        ref={inboxRef}
        tabId={showArchived ? "trash" : "all"}
        embeddedInCommunication
        externalTitleActions
        suppressListPane
        controlledExpandedId={selection.threadId}
        onControlledExpandedIdChange={(id) => {
          if (!id) setSelectedKey(null);
        }}
      />
    ) : selection?.channel === "sms" ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        <RoleSmsPanel apiPath="/api/resident/sms-conversations" storageScope="resident" tabId={"all" as ManagerSmsBucketId} />
      </div>
    ) : (
      <InboxThreadEmpty />
    );

  return <InboxTwoPane threadOpen={Boolean(selection)} list={listPane} thread={threadPane} />;
}

export type ResidentEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

export function ResidentCommunication({
  smsUiEnabled = false,
}: {
  /** @deprecated Folder tabs removed; kept so legacy routes still resolve. */
  inboxTabId?: ResidentEmailTabId;
  smsUiEnabled?: boolean;
}) {
  const inboxRef = useRef<ResidentInboxPanelHandle>(null);

  const titleAside = (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
      onClick={() => inboxRef.current?.openCompose()}
    >
      New message
    </Button>
  );

  return (
    <PortalCommunicationShell title="Communication" titleAside={titleAside}>
      <ResidentUnifiedInbox inboxRef={inboxRef} smsUiEnabled={smsUiEnabled} />
    </PortalCommunicationShell>
  );
}

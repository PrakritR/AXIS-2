"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { ManagerInbox, type ManagerInboxHandle } from "@/components/portal/manager-inbox";
import { ManagerSmsPanel, type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import {
  InboxThreadEmpty,
  InboxTwoPane,
} from "@/components/portal/portal-inbox-ui";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  inboxThreadMessages,
  inboxThreadSortMs,
  loadPersistedInbox,
} from "@/lib/portal-inbox-storage";
import {
  mergeUnifiedInboxItems,
  parseUnifiedInboxKey,
  unifiedInboxKey,
  type UnifiedInboxListItem,
} from "@/lib/unified-inbox-merge";
import {
  normalizeManagerSmsConversationsPayload,
  smsConversationDisplayName,
  smsConversationSubtitle,
  smsThreadHasUnread,
  type ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";

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
    const raw = window.localStorage.getItem("axis_manager_sms_opened_v1");
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

/**
 * Unified conversation inbox for one resident inside the manager Residents detail
 * panel — direct chat with this resident (no conversation list sidebar).
 */
export function ManagerResidentDetailInbox({
  residentEmail,
  portalBase,
  smsUiEnabled = false,
  inboxRef,
  smsRef,
}: {
  residentEmail: string;
  portalBase: string;
  smsUiEnabled?: boolean;
  inboxRef?: RefObject<ManagerInboxHandle | null>;
  smsRef?: RefObject<ManagerSmsPanelHandle | null>;
}) {
  const commBase = `${portalBase}/communication`;
  const emailNorm = residentEmail.trim().toLowerCase();
  const [emailThreads, setEmailThreads] = useState(() => loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []));
  const [smsResidents, setSmsResidents] = useState<ManagerSmsResidentConversation[]>([]);
  const [smsOpenedIds, setSmsOpenedIds] = useState<Set<string>>(() => loadSmsOpenedIds());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const sync = () => setEmailThreads(loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
  }, []);

  const loadSms = useCallback(async () => {
    if (!smsUiEnabled) return;
    try {
      const res = await fetch("/api/manager/sms-conversations", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { residents?: ManagerSmsResidentConversation[] };
      setSmsResidents(normalizeManagerSmsConversationsPayload(body).residents);
    } catch {
      /* keep */
    }
  }, [smsUiEnabled]);

  useEffect(() => {
    void loadSms();
  }, [loadSms]);

  const handleSmsConversationOpened = useCallback(() => {
    setSmsOpenedIds(loadSmsOpenedIds());
  }, []);

  const filteredEmail = useMemo(() => {
    const scoped = emailThreads.filter((t) => t.email.trim().toLowerCase() === emailNorm);
    return filterEmailInboxThreads(scoped, { keepSmsLike: !smsUiEnabled });
  }, [emailNorm, smsUiEnabled, emailThreads]);

  const emailListItems = useMemo((): UnifiedInboxListItem[] => {
    let rows = filteredEmail;
    if (showArchived) {
      rows = rows.filter((t) => t.folder === "trash");
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
  }, [filteredEmail, showArchived]);

  const smsListItems = useMemo((): UnifiedInboxListItem[] => {
    if (!smsUiEnabled || showArchived) return [];
    const scoped = smsResidents.filter((r) => r.residentEmail?.trim().toLowerCase() === emailNorm);
    return scoped
      .map((resident) => {
        const messages = Array.isArray(resident.messages) ? resident.messages : [];
        const lastMessage = messages[messages.length - 1] ?? null;
        if (!lastMessage) return null;
        const rowId = smsConversationId(resident);
        const unread = smsThreadHasUnread(messages, smsOpenedIds);
        const lastOutbound = lastMessage.direction === "outbound";
        const item: UnifiedInboxListItem = {
          key: unifiedInboxKey("sms", rowId),
          channel: "sms",
          threadId: rowId,
          name: smsConversationDisplayName(resident),
          subtitle: smsConversationSubtitle(resident) || undefined,
          preview: previewLine(lastMessage.body, 80),
          previewPrefix: lastOutbound ? "You: " : undefined,
          time: iosListTimestamp(lastMessage.createdAt),
          unread,
          sortMs: Date.parse(lastMessage.createdAt) || 0,
        };
        return item;
      })
      .filter((x): x is UnifiedInboxListItem => x !== null);
  }, [emailNorm, showArchived, smsOpenedIds, smsResidents, smsUiEnabled]);

  const mergedRows = useMemo(
    () => mergeUnifiedInboxItems([...emailListItems, ...smsListItems]),
    [emailListItems, smsListItems],
  );

  const archivedCount = useMemo(
    () => filteredEmail.filter((t) => t.folder === "trash").length,
    [filteredEmail],
  );

  const selection = useMemo(() => (selectedKey ? parseUnifiedInboxKey(selectedKey) : null), [selectedKey]);

  useEffect(() => {
    setShowArchived(false);
  }, [emailNorm]);

  useEffect(() => {
    if (mergedRows.length === 0) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((cur) => (cur && mergedRows.some((r) => r.key === cur) ? cur : mergedRows[0].key));
  }, [mergedRows, showArchived, emailNorm]);

  const threadPane =
    selection?.channel === "email" ? (
      <ManagerInbox
        ref={inboxRef}
        tabId={showArchived ? "trash" : "unopened"}
        embeddedInCommunication
        externalTitleActions
        suppressCompose
        suppressListPane
        commBase={commBase}
        smsUiEnabled={smsUiEnabled}
        smsRecipients={smsResidents}
        controlledExpandedId={selection.threadId}
        onControlledExpandedIdChange={(id) => {
          if (!id) setSelectedKey(null);
        }}
      />
    ) : selection?.channel === "sms" ? (
      <ManagerSmsPanel
        ref={smsRef}
        filterResidentEmail={residentEmail}
        allowInlineCompose={false}
        suppressListPane
        controlledActiveId={selection.threadId}
        onControlledActiveIdChange={(id) => {
          if (!id) setSelectedKey(null);
        }}
        onConversationOpened={handleSmsConversationOpened}
      />
    ) : (
      <InboxThreadEmpty
        title={showArchived ? "No archived messages" : "No messages yet"}
        hint={showArchived ? "Archived conversations with this resident will appear here." : "Use New message to start a conversation."}
      />
    );

  return (
    <div className="flex flex-col">
      {archivedCount > 0 ? (
        <PortalSectionActionRow className="mb-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              showArchived
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted hover:bg-foreground/5 hover:text-foreground"
            }`}
            data-attr="resident-detail-inbox-archived-toggle"
            aria-pressed={showArchived}
          >
            {showArchived ? "← Back to messages" : `Archived (${archivedCount})`}
          </button>
        </PortalSectionActionRow>
      ) : null}
      <InboxTwoPane
        className="min-h-0 flex-1"
        heightMode="section"
        listHidden
        threadOpen={Boolean(selection)}
        list={null}
        thread={threadPane}
      />
    </div>
  );
}

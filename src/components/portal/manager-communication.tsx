"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalFilterSortSheet } from "@/components/portal/portal-filter-sort-sheet";
import { CommunicationFilterSortFields } from "@/components/portal/communication-filter-sort-fields";
import { PortalActiveFilterChips, type PortalActiveFilterChip } from "@/components/portal/portal-filter-chips";
import { ManagerUnifiedInbox } from "@/components/portal/manager-unified-inbox";
import { type ManagerInboxHandle } from "@/components/portal/manager-inbox";
import { type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import {
  ManagerCommunicationComposeModal,
  type CommunicationComposeChannel,
} from "@/components/portal/manager-communication-compose-modal";
import { ManagerWorkNumberButton } from "@/components/portal/manager-work-number-button";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalPageHeaderMobileActionsRow } from "@/components/portal/portal-section-action-row";
import { PORTAL_HEADER_PRIMARY_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  axisAdminFilterContact,
  EMPTY_COMMUNICATION_THREAD_FILTERS,
  propertyOptionsFromFilterContacts,
  roleLabel,
  type CommunicationFilterRole,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import { buildManagerInboxLiveContacts } from "@/lib/manager-inbox-contacts";
import type { CommunicationListSort } from "@/lib/unified-inbox-merge";
import {
  normalizeManagerSmsConversationsPayload,
  type ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

export type ManagerInboxTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";
/** @deprecated Legacy SMS routes redirect to unified inbox. */
export type ManagerCommunicationChannel = "inbox" | "sms";
/** @deprecated Legacy SMS folder URLs redirect to unified inbox. */
export type ManagerSmsTabId = "all" | "unopened" | "opened" | "schedule" | "sent";

const ROLE_OPTIONS: { value: CommunicationFilterRole; label: string }[] = [
  { value: "resident", label: "Residents & applicants" },
  { value: "management", label: roleLabel("management") },
  { value: "admin", label: roleLabel("admin") },
  { value: "vendor", label: roleLabel("vendor") },
];

function communicationFilterTouches(
  filters: CommunicationThreadFilters,
  listSort: CommunicationListSort,
): number {
  let n = 0;
  if (filters.propertyIds.length > 0) n += 1;
  if (filters.roles.length > 0) n += 1;
  if (filters.contactIds.length > 0) n += 1;
  if (listSort !== "recent") n += 1;
  return n;
}

export function ManagerCommunication({
  listSegment = "active",
  threadId,
  inboxTabId = "unopened",
  smsUiEnabled = false,
}: {
  /** Routed conversation list segment (Active / Unread / Archived). */
  listSegment?: "active" | "unread" | "archived";
  /** Deep-linked thread id from `/communication/{segment}/{threadId}`. */
  threadId?: string;
  /** @deprecated Channel is always unified; kept for route compatibility. */
  channel?: ManagerCommunicationChannel;
  /** @deprecated Folder tabs removed — kept so legacy routes still resolve. */
  inboxTabId?: ManagerInboxTabId;
  /** @deprecated SMS folders merged into unified inbox. */
  smsTabId?: ManagerSmsTabId;
  /**
   * Server-resolved SMS Communication UI flag (`isSmsCommUiEnabled()`). When
   * false, SMS compose channel / rows / panel are hidden — transport, webhooks,
   * and both SMS agents are unaffected. Default false ("hide now").
   */
  smsUiEnabled?: boolean;
}) {
  const portalBase = usePaidPortalBasePath();
  const commBase = `${portalBase}/communication`;
  const { userId } = useManagerUserId();
  const inboxRef = useRef<ManagerInboxHandle>(null);
  const smsRef = useRef<ManagerSmsPanelHandle>(null);
  const [filters, setFilters] = useState<CommunicationThreadFilters>(EMPTY_COMMUNICATION_THREAD_FILTERS);
  const [listSort, setListSort] = useState<CommunicationListSort>("recent");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeChannel, setComposeChannel] = useState<CommunicationComposeChannel>("email");
  const [smsRecipients, setSmsRecipients] = useState<ManagerSmsResidentConversation[]>([]);
  const [threadOpen, setThreadOpen] = useState(Boolean(threadId));

  useEffect(() => {
    setThreadOpen(Boolean(threadId));
  }, [threadId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [folderCounts, setFolderCounts] = useState({ unread: 0, archived: 0 });

  const filterContacts = useMemo(() => {
    const live = buildManagerInboxLiveContacts(userId);
    return [axisAdminFilterContact(), ...live];
  }, [userId]);

  const liveContacts = useMemo(() => buildManagerInboxLiveContacts(userId), [userId]);

  const propertyOptions = useMemo(() => propertyOptionsFromFilterContacts(filterContacts), [filterContacts]);

  const residentOptions = useMemo(() => {
    return filterContacts
      .filter((c) => c.role === "resident")
      .map((c) => {
        const status = c.tenancyStatus === "applicant" ? "Applicant" : "Resident";
        const house = c.propertyLabel?.trim();
        const bits = [c.name, status, house].filter(Boolean);
        return {
          value: c.id,
          label: bits.join(" · "),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [filterContacts]);

  const loadSmsRecipients = useCallback(async () => {
    // SMS UI hidden until A2P clears — never fetch SMS recipients or expose them
    // in compose. Transport/webhooks/agents are unaffected.
    if (!smsUiEnabled) return;
    try {
      const res = await fetch("/api/manager/sms-conversations", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { residents?: ManagerSmsResidentConversation[] };
      const normalized = normalizeManagerSmsConversationsPayload(body);
      setSmsRecipients(normalized.residents);
    } catch {
      /* keep prior list */
    }
  }, [smsUiEnabled]);

  useEffect(() => {
    void loadSmsRecipients();
  }, [loadSmsRecipients]);

  const openCompose = useCallback(
    (preferred: CommunicationComposeChannel) => {
      setComposeChannel(preferred);
      setComposeOpen(true);
      void loadSmsRecipients();
    },
    [loadSmsRecipients],
  );

  const handleComposeSent = useCallback(
    (channels: { email: boolean; sms: boolean }) => {
      // No folder tabs to navigate to anymore — the new message appends to the
      // recipient's conversation in the unified list. Just refresh the data.
      if (channels.email) {
        inboxRef.current?.reloadInbox?.();
      }
      if (channels.sms) {
        smsRef.current?.reload?.();
        void loadSmsRecipients();
      }
    },
    [loadSmsRecipients],
  );

  const filterTouchCount = communicationFilterTouches(filters, listSort);

  const activeFilterChips = useMemo((): PortalActiveFilterChip[] => {
    const chips: PortalActiveFilterChip[] = [];
    for (const propertyId of filters.propertyIds) {
      const label = propertyOptions.find((p) => p.value === propertyId)?.label ?? propertyId;
      chips.push({
        id: `house-${propertyId}`,
        label: `House: ${label}`,
        onRemove: () =>
          setFilters((f) => ({
            ...f,
            propertyIds: f.propertyIds.filter((id) => id !== propertyId),
          })),
      });
    }
    for (const role of filters.roles) {
      const label = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? roleLabel(role);
      chips.push({
        id: `role-${role}`,
        label: `Role: ${label}`,
        onRemove: () =>
          setFilters((f) => ({
            ...f,
            roles: f.roles.filter((r) => r !== role),
            contactIds: [],
          })),
      });
    }
    for (const contactId of filters.contactIds) {
      const label = residentOptions.find((r) => r.value === contactId)?.label ?? contactId;
      chips.push({
        id: `resident-${contactId}`,
        label: `Resident: ${label}`,
        onRemove: () =>
          setFilters((f) => ({
            ...f,
            contactIds: f.contactIds.filter((id) => id !== contactId),
          })),
      });
    }
    if (listSort !== "recent") {
      const sortLabel = listSort === "resident" ? "Resident (A–Z)" : listSort;
      chips.push({
        id: "sort",
        label: `Sort: ${sortLabel}`,
        onRemove: () => setListSort("recent"),
      });
    }
    return chips;
  }, [filters, listSort, propertyOptions, residentOptions]);

  const filterControls = (
    <CommunicationFilterSortFields
      propertyOptions={propertyOptions}
      roleOptions={ROLE_OPTIONS}
      filterContacts={filterContacts}
      filters={filters}
      onFiltersChange={setFilters}
      listSort={listSort}
      onListSortChange={setListSort}
    />
  );

  const communicationFilterSheet = (
    <PortalFilterSortSheet
      activeCount={filterTouchCount}
      compactPanel
      className="min-w-0 shrink-0"
      onReset={() => {
        setFilters(EMPTY_COMMUNICATION_THREAD_FILTERS);
        setListSort("recent");
      }}
      dataAttr="communication-filter-sheet-open"
    >
      {filterControls}
    </PortalFilterSortSheet>
  );

  const communicationNewMessageButton = (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_PRIMARY_ACTION_BTN}`}
      data-attr="communication-new-message"
      onClick={() => openCompose("email")}
    >
      New message
    </Button>
  );

  const communicationHeaderActions = (
    <>
      {smsUiEnabled ? <ManagerWorkNumberButton /> : null}
      {communicationNewMessageButton}
    </>
  );

  const communicationMobileActionsRow = (
    <PortalPageHeaderMobileActionsRow
      filter={communicationFilterSheet}
      actions={communicationHeaderActions}
    />
  );

  const controlStack = (
    <PortalListControlStack
      destinations={[
        { id: "active", label: "Active", href: `${commBase}/active`, dataAttr: "communication-segment-active" },
        {
          id: "unread",
          label: "Unread",
          href: `${commBase}/unread`,
          count: folderCounts.unread,
          dataAttr: "communication-segment-unread",
        },
        {
          id: "archived",
          label: "Archived",
          href: `${commBase}/archived`,
          count: folderCounts.archived,
          dataAttr: "communication-segment-archived",
        },
      ]}
      activeDestinationId={listSegment}
      destinationAriaLabel="Conversation folders"
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search residents or messages",
        dataAttr: "unified-inbox-search",
      }}
      activeFilterChips={<PortalActiveFilterChips chips={activeFilterChips} />}
    />
  );

  return (
    <PortalCommunicationShell
      title="Communication"
      titleInlineFilter={communicationFilterSheet}
      titleAside={communicationHeaderActions}
      hideTitleOnMobileNav
      controlStack={controlStack}
      mobileActionsRow={communicationMobileActionsRow}
      hideMobileFilterRow={threadOpen}
      mobileThreadReading={threadOpen}
    >
      <ManagerCommunicationComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialChannel={composeChannel}
        liveContacts={liveContacts}
        smsRecipients={smsRecipients}
        smsUiEnabled={smsUiEnabled}
        onSent={handleComposeSent}
      />

      <ManagerUnifiedInbox
        tabId={inboxTabId}
        commBase={commBase}
        listSegment={listSegment}
        routeThreadId={threadId}
        threadFilters={filters}
        filterContacts={filterContacts}
        listSort={listSort}
        smsUiEnabled={smsUiEnabled}
        inboxRef={inboxRef}
        smsRef={smsRef}
        onThreadOpenChange={setThreadOpen}
        listChrome="external"
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onFolderCountsChange={setFolderCounts}
      />
    </PortalCommunicationShell>
  );
}

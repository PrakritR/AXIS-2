"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerUnifiedInbox } from "@/components/portal/manager-unified-inbox";
import { type ManagerInboxHandle } from "@/components/portal/manager-inbox";
import { type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import {
  ManagerCommunicationComposeModal,
  type CommunicationComposeChannel,
} from "@/components/portal/manager-communication-compose-modal";
import { ManagerWorkNumberButton } from "@/components/portal/manager-work-number-button";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import {
  axisAdminFilterContact,
  contactsForSelectedRoles,
  EMPTY_COMMUNICATION_THREAD_FILTERS,
  propertyOptionsFromFilterContacts,
  roleLabel,
  type CommunicationFilterRole,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import { buildManagerInboxLiveContacts } from "@/lib/manager-inbox-contacts";
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

export function ManagerCommunication({
  inboxTabId = "unopened",
  smsUiEnabled = false,
}: {
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeChannel, setComposeChannel] = useState<CommunicationComposeChannel>("email");
  const [smsRecipients, setSmsRecipients] = useState<ManagerSmsResidentConversation[]>([]);

  const filterContacts = useMemo(() => {
    const live = buildManagerInboxLiveContacts(userId);
    return [axisAdminFilterContact(), ...live];
  }, [userId]);

  const liveContacts = useMemo(() => buildManagerInboxLiveContacts(userId), [userId]);

  const propertyOptions = useMemo(() => propertyOptionsFromFilterContacts(filterContacts), [filterContacts]);

  const personOptions = useMemo(() => {
    const scoped = contactsForSelectedRoles(filterContacts, filters.roles);
    return scoped
      .map((c) => {
        const status =
          c.role === "resident" ? (c.tenancyStatus === "applicant" ? "Applicant" : "Resident") : null;
        const house = c.propertyLabel?.trim();
        const bits = [c.name, status, house || c.email].filter(Boolean);
        return {
          value: c.id,
          label: bits.join(" · "),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [filterContacts, filters.roles]);

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

  const threadFilters = (
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
      <CheckboxMultiSelect
        variant="pill"
        label="House"
        emptyLabel="All houses"
        options={propertyOptions}
        selected={filters.propertyIds}
        onChange={(propertyIds) => setFilters((f) => ({ ...f, propertyIds }))}
        emptyMenuText="No houses yet"
        dataAttr="communication-filter-property"
      />
      <CheckboxMultiSelect
        variant="pill"
        label="Role"
        emptyLabel="All roles"
        options={ROLE_OPTIONS}
        selected={filters.roles}
        onChange={(roles) =>
          setFilters((f) => ({
            ...f,
            roles: roles as CommunicationFilterRole[],
            contactIds: [],
          }))
        }
        dataAttr="communication-filter-role"
      />
      <CheckboxMultiSelect
        variant="pill"
        label="Which people"
        emptyLabel="All people"
        options={personOptions}
        selected={filters.contactIds}
        onChange={(contactIds) => setFilters((f) => ({ ...f, contactIds }))}
        disabled={filters.roles.length === 0}
        emptyMenuText={filters.roles.length === 0 ? "Pick a role first" : "No people in selected roles"}
        dataAttr="communication-filter-person"
      />
    </div>
  );

  const titleAside = (
    <>
      {smsUiEnabled ? <ManagerWorkNumberButton /> : null}
      <Button
        type="button"
        variant="primary"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        data-attr="communication-new-message"
        onClick={() => openCompose("email")}
      >
        New message
      </Button>
    </>
  );

  return (
    <PortalCommunicationShell title="Communication" titleAside={titleAside} threadFilters={threadFilters}>
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
        threadFilters={filters}
        filterContacts={filterContacts}
        smsUiEnabled={smsUiEnabled}
        inboxRef={inboxRef}
        smsRef={smsRef}
      />
    </PortalCommunicationShell>
  );
}

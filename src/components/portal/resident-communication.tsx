"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResidentInboxPanel, type ResidentInboxPanelHandle, type ResidentInboxTabCounts } from "@/components/portal/resident-inbox-panel";
import { RoleSmsPanel, RESIDENT_SMS_TAB_DEFS } from "@/components/portal/role-sms-panel";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { INBOX_TAB_DEFS } from "@/components/portal/portal-inbox-ui";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import type { ManagerSmsBucketId } from "@/lib/manager-sms-messages";
import { TabNav } from "@/components/ui/tabs";

export type ResidentCommunicationChannel = "email" | "sms";
export type ResidentEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

export function ResidentCommunication({
  channel,
  emailTabId = "unopened",
  smsTabId = "unopened",
}: {
  channel: ResidentCommunicationChannel;
  emailTabId?: ResidentEmailTabId;
  smsTabId?: ManagerSmsBucketId;
}) {
  const navigate = usePortalNavigate();
  const commBase = `${RESIDENT_PORTAL_BASE_PATH}/communication`;
  const inboxRef = useRef<ResidentInboxPanelHandle>(null);
  const [emailTabCounts, setEmailTabCounts] = useState<ResidentInboxTabCounts>({
    unopened: 0,
    opened: 0,
    schedule: 0,
    sent: 0,
    trash: 0,
  });
  const [smsBucketCounts, setSmsBucketCounts] = useState<Record<ManagerSmsBucketId, number>>({
    all: 0,
    unopened: 0,
    opened: 0,
    schedule: 0,
    sent: 0,
  });
  const handleEmailTabCountsChange = useCallback((counts: ResidentInboxTabCounts) => {
    setEmailTabCounts(counts);
  }, []);
  const handleSmsBucketCountsChange = useCallback((counts: Record<ManagerSmsBucketId, number>) => {
    setSmsBucketCounts(counts);
  }, []);

  const statusPills =
    channel === "email" ? (
      <ManagerPortalStatusPills
        activeTone="primary"
        tabs={INBOX_TAB_DEFS.map(({ id, label }) => ({
          id,
          label,
          count: emailTabCounts[id as keyof ResidentInboxTabCounts],
        }))}
        activeId={emailTabId}
        onChange={(id) => navigate(`${commBase}/email/${id}`)}
      />
    ) : (
      <ManagerPortalStatusPills
        activeTone="primary"
        tabs={RESIDENT_SMS_TAB_DEFS.map(({ id, label }) => ({
          id,
          label,
          count: smsBucketCounts[id],
        }))}
        activeId={smsTabId}
        onChange={(id) => navigate(`${commBase}/sms/${id}`)}
      />
    );

  const titleAside =
    channel === "email" ? (
      <>
        {emailTabId === "trash" && emailTabCounts.trash > 0 ? (
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
    ) : (
      <Button
        type="button"
        variant="primary"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        data-attr="resident-sms-new-message"
        onClick={() => inboxRef.current?.openCompose()}
      >
        New message
      </Button>
    );

  return (
    <PortalCommunicationShell
      title="Communication"
      titleAside={titleAside}
      channelNav={
        <TabNav
          activeId={channel}
          items={[
            { id: "email", label: "Email", href: `${commBase}/email/unopened`, dataAttr: "resident-communication-tab-email" },
            { id: "sms", label: "SMS", href: `${commBase}/sms/unopened`, dataAttr: "resident-communication-tab-sms" },
          ]}
        />
      }
      statusPills={statusPills}
    >
      {channel === "email" ? (
        <ResidentInboxPanel
          ref={inboxRef}
          tabId={emailTabId}
          embeddedInCommunication
          externalTitleActions
          onTabCountsChange={handleEmailTabCountsChange}
        />
      ) : (
        <RoleSmsPanel
          apiPath="/api/resident/sms-conversations"
          storageScope="resident"
          tabId={smsTabId}
          onBucketCountsChange={handleSmsBucketCountsChange}
        />
      )}
    </PortalCommunicationShell>
  );
}

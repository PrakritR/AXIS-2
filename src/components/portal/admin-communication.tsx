"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminInboxClient, type AdminInboxClientHandle, type AdminInboxTabCounts } from "@/components/portal/admin-inbox-client";
import { RoleSmsPanel, RESIDENT_SMS_TAB_DEFS } from "@/components/portal/role-sms-panel";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { INBOX_TAB_DEFS } from "@/components/portal/portal-inbox-ui";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import type { ManagerSmsBucketId } from "@/lib/manager-sms-messages";
import { TabNav } from "@/components/ui/tabs";

export type AdminCommunicationChannel = "email" | "sms";
export type AdminEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

const ADMIN_COMM_BASE = "/admin/communication";

export function AdminCommunication({
  channel,
  emailTabId = "unopened",
  smsTabId = "all",
}: {
  channel: AdminCommunicationChannel;
  emailTabId?: AdminEmailTabId;
  smsTabId?: ManagerSmsBucketId;
}) {
  const navigate = usePortalNavigate();
  const inboxRef = useRef<AdminInboxClientHandle>(null);
  const [emailTabCounts, setEmailTabCounts] = useState<AdminInboxTabCounts>({
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
  const handleEmailTabCountsChange = useCallback((counts: AdminInboxTabCounts) => {
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
          count: emailTabCounts[id as keyof AdminInboxTabCounts],
        }))}
        activeId={emailTabId}
        onChange={(id) => navigate(`${ADMIN_COMM_BASE}/email/${id}`)}
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
        onChange={(id) => navigate(`${ADMIN_COMM_BASE}/sms/${id}`)}
      />
    );

  const titleAside =
    channel === "email" ? (
      <Button
        type="button"
        variant="primary"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        onClick={() => inboxRef.current?.openCompose()}
      >
        New message
      </Button>
    ) : null;

  return (
    <PortalCommunicationShell
      title="Communication"
      titleAside={titleAside}
      channelNav={
        <TabNav
          activeId={channel}
          items={[
            { id: "email", label: "Email", href: `${ADMIN_COMM_BASE}/email/unopened`, dataAttr: "admin-communication-tab-email" },
            { id: "sms", label: "SMS", href: `${ADMIN_COMM_BASE}/sms/all`, dataAttr: "admin-communication-tab-sms" },
          ]}
        />
      }
      statusPills={statusPills}
    >
      {channel === "email" ? (
        <AdminInboxClient
          ref={inboxRef}
          tabId={emailTabId}
          commBase={`${ADMIN_COMM_BASE}/email`}
          embeddedInCommunication
          externalTitleActions
          onTabCountsChange={handleEmailTabCountsChange}
        />
      ) : (
        <RoleSmsPanel
          apiPath="/api/admin/sms-conversations"
          storageScope="admin"
          tabId={smsTabId}
          onBucketCountsChange={handleSmsBucketCountsChange}
        />
      )}
    </PortalCommunicationShell>
  );
}

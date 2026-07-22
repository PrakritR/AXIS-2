"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminInboxClient, type AdminInboxClientHandle, type AdminInboxTabCounts } from "@/components/portal/admin-inbox-client";
import { ManagerSmsPanel, type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
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
}: {
  channel: AdminCommunicationChannel;
  emailTabId?: AdminEmailTabId;
  /** Retained for route compatibility (`/admin/communication/sms/:tab`); the
   * threaded SMS panel manages its own view state and ignores it. */
  smsTabId?: ManagerSmsBucketId;
}) {
  const navigate = usePortalNavigate();
  const inboxRef = useRef<AdminInboxClientHandle>(null);
  const smsRef = useRef<ManagerSmsPanelHandle>(null);
  const [emailTabCounts, setEmailTabCounts] = useState<AdminInboxTabCounts>({
    unopened: 0,
    opened: 0,
    schedule: 0,
    sent: 0,
    trash: 0,
  });
  const handleEmailTabCountsChange = useCallback((counts: AdminInboxTabCounts) => {
    setEmailTabCounts(counts);
  }, []);

  // SMS uses the threaded panel's own search / sort / unread controls, so it
  // has no status-pill folders (unlike Email).
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
    ) : undefined;

  const titleAside =
    channel === "email" ? (
      <>
        {emailTabId === "trash" && emailTabCounts.trash > 0 ? (
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
            onClick={() => inboxRef.current?.emptyTrash()}
          >
            Delete all trash
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
        onClick={() => smsRef.current?.openCompose()}
        data-attr="admin-sms-new-message"
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
        <ManagerSmsPanel
          ref={smsRef}
          endpoint="/api/admin/sms-conversations"
          // Admin has no separate shell compose modal — let the panel own its
          // own SMS compose, opened from the header New message button.
          allowInlineCompose
        />
      )}
    </PortalCommunicationShell>
  );
}

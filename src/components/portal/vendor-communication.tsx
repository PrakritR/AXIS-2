"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VendorInboxPanel, type VendorInboxPanelHandle, type VendorInboxTabCounts } from "@/components/portal/vendor-inbox-panel";
import { RoleSmsPanel } from "@/components/portal/role-sms-panel";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { INBOX_TAB_DEFS } from "@/components/portal/portal-inbox-ui";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import type { ManagerSmsBucketId } from "@/lib/manager-sms-messages";

export type VendorEmailTabId = "unopened" | "opened" | "sent" | "trash";

const VENDOR_EMAIL_TAB_DEFS = INBOX_TAB_DEFS.filter((tab) => tab.id !== "schedule");

function mapInboxTabToSms(tabId: VendorEmailTabId): ManagerSmsBucketId {
  if (tabId === "unopened") return "unopened";
  if (tabId === "opened") return "opened";
  if (tabId === "sent") return "sent";
  return "all";
}

export function VendorCommunication({ inboxTabId = "unopened" }: { inboxTabId?: VendorEmailTabId }) {
  const navigate = usePortalNavigate();
  const commBase = "/vendor/communication";
  const inboxRef = useRef<VendorInboxPanelHandle>(null);
  const [emailTabCounts, setEmailTabCounts] = useState<VendorInboxTabCounts>({
    unopened: 0,
    opened: 0,
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

  const statusPills = (
    <ManagerPortalStatusPills
      activeTone="primary"
      tabs={VENDOR_EMAIL_TAB_DEFS.map(({ id, label }) => ({
        id,
        label,
        count:
          emailTabCounts[id as keyof VendorInboxTabCounts] +
          (id === "unopened" ? smsBucketCounts.unopened : id === "opened" ? smsBucketCounts.opened : id === "sent" ? smsBucketCounts.sent : 0),
      }))}
      activeId={inboxTabId}
      onChange={(id) => navigate(`${commBase}/inbox/${id}`)}
    />
  );

  const titleAside = (
    <>
      {inboxTabId === "trash" && emailTabCounts.trash > 0 ? (
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
      <div className="space-y-6">
        <VendorInboxPanel
          ref={inboxRef}
          tabId={inboxTabId}
          embeddedInCommunication
          externalTitleActions
          onTabCountsChange={setEmailTabCounts}
        />
        {inboxTabId !== "trash" ? (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Text messages</h2>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                SMS
              </span>
            </div>
            <RoleSmsPanel
              apiPath="/api/vendor/sms-conversations"
              storageScope="vendor"
              tabId={mapInboxTabToSms(inboxTabId)}
              onBucketCountsChange={setSmsBucketCounts}
            />
          </section>
        ) : null}
      </div>
    </PortalCommunicationShell>
  );
}

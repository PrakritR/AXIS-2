"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminInboxClient, type AdminInboxClientHandle, type AdminInboxTabCounts } from "@/components/portal/admin-inbox-client";
import { ManagerSmsPanel, type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { INBOX_TAB_DEFS } from "@/components/portal/portal-inbox-ui";
import { usePortalNavigate } from "@/lib/portal-nav-client";

export type AdminEmailTabId = "unopened" | "opened" | "schedule" | "sent" | "trash";

const ADMIN_COMM_BASE = "/admin/communication";

export function AdminCommunication({ inboxTabId = "unopened" }: { inboxTabId?: AdminEmailTabId }) {
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

  const statusPills = (
    <ManagerPortalStatusPills
      activeTone="primary"
      tabs={INBOX_TAB_DEFS.map(({ id, label }) => ({
        id,
        label,
        count: emailTabCounts[id as keyof AdminInboxTabCounts],
      }))}
      activeId={inboxTabId}
      onChange={(id) => navigate(`${ADMIN_COMM_BASE}/inbox/${id}`)}
    />
  );

  const titleAside = (
    <>
      {inboxTabId === "trash" && emailTabCounts.trash > 0 ? (
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
  );

  return (
    <PortalCommunicationShell title="Communication" titleAside={titleAside} statusPills={statusPills}>
      <div className="space-y-6">
        <AdminInboxClient
          ref={inboxRef}
          tabId={inboxTabId}
          commBase={`${ADMIN_COMM_BASE}/inbox`}
          embeddedInCommunication
          externalTitleActions
          onTabCountsChange={handleEmailTabCountsChange}
        />
        {inboxTabId !== "trash" ? (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Text messages</h2>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                SMS
              </span>
            </div>
            <ManagerSmsPanel
              ref={smsRef}
              endpoint="/api/admin/sms-conversations"
              allowInlineCompose
              allowDelete={false}
            />
          </section>
        ) : null}
      </div>
    </PortalCommunicationShell>
  );
}

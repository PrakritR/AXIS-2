"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VendorInboxPanel, type VendorInboxPanelHandle, type VendorInboxTabCounts } from "@/components/portal/vendor-inbox-panel";
import { RoleSmsPanel } from "@/components/portal/role-sms-panel";
import { PortalCommunicationShell } from "@/components/portal/portal-communication-shell";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";

/** @deprecated Folder tabs removed — kept so legacy routes still resolve. */
export type VendorEmailTabId = "unopened" | "opened" | "sent" | "trash";

export function VendorCommunication({
  smsUiEnabled = false,
}: {
  /** @deprecated Folder tabs removed; the unified list is always shown. Kept for route compatibility. */
  inboxTabId?: VendorEmailTabId;
  /**
   * Server-resolved SMS Communication UI flag. When false, the SMS "Text
   * messages" section is hidden entirely — transport/webhooks/agents are
   * unaffected. Default false ("hide now").
   */
  smsUiEnabled?: boolean;
}) {
  const inboxRef = useRef<VendorInboxPanelHandle>(null);
  // Archived (trashed) conversations are reachable via a toggle, not a tab.
  const [showArchived, setShowArchived] = useState(false);
  const [emailTabCounts, setEmailTabCounts] = useState<VendorInboxTabCounts>({
    unopened: 0,
    opened: 0,
    sent: 0,
    trash: 0,
  });

  const view: "all" | "trash" = showArchived ? "trash" : "all";

  const titleAside = (
    <>
      <Button
        type="button"
        variant="outline"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        data-attr="vendor-inbox-archived-toggle"
        aria-pressed={showArchived}
        onClick={() => setShowArchived((v) => !v)}
      >
        {showArchived ? "← Conversations" : `Archived${emailTabCounts.trash > 0 ? ` (${emailTabCounts.trash})` : ""}`}
      </Button>
      {showArchived && emailTabCounts.trash > 0 ? (
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
    <PortalCommunicationShell title="Communication" titleAside={titleAside}>
      <div className="space-y-6">
        <VendorInboxPanel
          ref={inboxRef}
          tabId={view}
          embeddedInCommunication
          externalTitleActions
          onTabCountsChange={setEmailTabCounts}
        />
        {smsUiEnabled && view !== "trash" ? (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Text messages</h2>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                SMS
              </span>
            </div>
            <RoleSmsPanel apiPath="/api/vendor/sms-conversations" storageScope="vendor" tabId="all" />
          </section>
        ) : null}
      </div>
    </PortalCommunicationShell>
  );
}

"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseSectionEditor } from "@/components/portal/lease-section-editor";
import { LeasePacketInlineEditor } from "@/components/portal/lease-packet-inline-editor";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { buildLeasePacketEditAssistantContext } from "@/lib/lease-assistant-context";
import { AGENT_PENDING_ACTIONS_EVENT } from "@/lib/axis-assistant/pending-actions-events";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

type EditPane = "form" | "document" | "preview";

/** Desktop: scrollable inline editor (left) + document preview (right); AI assistant pinned at bottom. */
export function ManagerPipelineLeaseEditModal({
  open,
  row,
  onClose,
  onDone,
}: {
  open: boolean;
  row: LeasePipelineRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const config = usePortalAssistantConfig();
  const { userId: managerUserId } = useManagerUserId();
  const [activeRow, setActiveRow] = useState(row);
  const assistantContext = useMemo(() => buildLeasePacketEditAssistantContext(activeRow), [activeRow]);
  const [conversationInstance, setConversationInstance] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<EditPane>("form");

  useEffect(() => {
    if (!open) return;
    setActiveRow(row);
    setConversationInstance((n) => n + 1);
    setChatOpen(true);
    setMobilePane("document");
  }, [open, row.id, row]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      onDone();
    };
    window.addEventListener(AGENT_PENDING_ACTIONS_EVENT, refresh);
    return () => window.removeEventListener(AGENT_PENDING_ACTIONS_EVENT, refresh);
  }, [open, onDone]);

  const finish = () => {
    onDone();
    onClose();
  };

  const handleSaved = (updated: LeasePipelineRow) => {
    setActiveRow(updated);
    onDone();
  };

  const storageScope = modalAssistantStorageScope(`Lease packet edit · ${activeRow.id}`, conversationInstance);

  return (
    <Modal
      open={open}
      title="Edit lease"
      description="Tap Document to edit every lease section (1–26 and addenda A–E). Preview updates as you save."
      onClose={onClose}
      assistantStrip={false}
      fullScreenMobile
      scrollableContent={false}
      dense
      panelClassName="flex w-full max-w-6xl flex-col overflow-hidden md:max-h-[min(92dvh,52rem)]"
      footer={
        <ModalFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" onClick={finish} data-attr="lease-packet-edit-done">
            Done
          </Button>
        </ModalFooter>
      }
    >
      <div
        className={cn(
          "flex flex-col gap-3",
          "h-[calc(100dvh-15rem)] max-md:min-h-0",
          "md:h-[min(calc(92dvh-13rem),44rem)]",
        )}
      >
        <div className="flex shrink-0 gap-1 rounded-full border border-border bg-muted/40 p-1 md:hidden" role="tablist" aria-label="Lease edit view">
          {(
            [
              ["document", "Document"],
              ["form", "Terms"],
              ["preview", "Preview"],
            ] as const
          ).map(([pane, label]) => (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane}
              className={cn(
                "flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition sm:text-sm",
                mobilePane === pane ? "bg-card text-foreground shadow-sm" : "text-muted",
              )}
              onClick={() => setMobilePane(pane)}
              data-attr={`lease-edit-tab-${pane}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-4">
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-hidden md:border-r md:border-border md:pr-4",
              mobilePane === "form" || mobilePane === "document" ? "flex" : "hidden md:flex",
            )}
          >
            {mobilePane === "document" ? (
              <div className="flex min-h-0 flex-1 flex-col md:hidden">
                <LeaseSectionEditor
                  row={activeRow}
                  managerUserId={managerUserId}
                  onSaved={handleSaved}
                  embedded
                  fullHeight
                  className="min-h-0 flex-1"
                />
              </div>
            ) : null}
            <div className={cn("min-h-0 flex-1", mobilePane === "document" ? "hidden md:flex md:flex-col" : "flex flex-col")}>
              <LeasePacketInlineEditor
                row={activeRow}
                managerUserId={managerUserId}
                onSaved={handleSaved}
                layout="panel"
                className="min-h-0 flex-1"
              />
            </div>
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-col overflow-hidden",
              mobilePane === "preview" ? "flex" : "hidden md:flex",
            )}
          >
            <LeaseDocumentPreview row={activeRow} fill className="min-h-0 flex-1" />
          </div>
        </div>

        {config ? (
          <AssistantConversationProvider endpoint={config.endpoint} storageScope={storageScope}>
            <div
              className={cn(
                "flex w-full shrink-0 flex-col",
                chatOpen ? "min-h-[11.5rem] max-h-[min(34vh,16rem)]" : "",
              )}
              data-attr="lease-edit-assistant"
              data-expanded={chatOpen ? "true" : "false"}
            >
              {chatOpen ? (
                <AssistantDockPanel
                  managerName={config.managerName}
                  endpoint={config.endpoint}
                  contextHint={assistantContext}
                  compact
                  pinnedComposer
                  onCollapse={() => setChatOpen(false)}
                  className="min-h-0 flex-1 rounded-xl border border-border shadow-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left text-sm transition hover:bg-foreground/[0.02] md:py-4"
                  data-attr="lease-edit-assistant-expand"
                  aria-expanded={false}
                >
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold text-primary">
                    <AxisAssistantSparkleIcon className="h-4 w-4 shrink-0" />
                    Ask PropLane Assistant
                  </span>
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </button>
              )}
            </div>
          </AssistantConversationProvider>
        ) : null}
      </div>
    </Modal>
  );
}

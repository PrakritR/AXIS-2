"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { buildLeasePacketEditAssistantContext } from "@/lib/lease-assistant-context";
import { AGENT_PENDING_ACTIONS_EVENT } from "@/lib/axis-assistant/pending-actions-events";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

/** Manager-review lease editor — assistant applies changes via update_lease_packet. */
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
  const assistantContext = useMemo(() => buildLeasePacketEditAssistantContext(row), [row]);
  const [conversationInstance, setConversationInstance] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    setConversationInstance((n) => n + 1);
    setChatOpen(true);
  }, [open, row.id]);

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

  const storageScope = modalAssistantStorageScope(`Lease packet edit · ${row.id}`, conversationInstance);

  return (
    <Modal
      open={open}
      title="Edit lease"
      description="Describe the change you want. After you confirm a proposal, the lease preview updates here and on the page behind this dialog."
      onClose={onClose}
      assistantStrip={false}
      fullScreenMobile
      scrollableContent={false}
      dense
      panelClassName="flex w-full max-w-3xl flex-col md:max-h-[min(92dvh,48rem)]"
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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <LeaseDocumentPreview row={row} fill className="min-h-0 flex-1" />

        {config ? (
          <AssistantConversationProvider endpoint={config.endpoint} storageScope={storageScope}>
            <div
              className={cn(
                "flex min-h-0 w-full flex-col",
                chatOpen ? "min-h-[11.5rem] max-h-[min(38vh,17rem)] shrink-0" : "shrink-0",
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

"use client";

import { ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { LeaseSectionEditor } from "@/components/portal/lease-section-editor";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { buildLeasePacketEditAssistantContext } from "@/lib/lease-assistant-context";
import { AGENT_PENDING_ACTIONS_EVENT } from "@/lib/axis-assistant/pending-actions-events";
import { leaseDocumentHtmlForSectionEdit } from "@/lib/lease-section-edit.client";
import { getLeaseDocumentHtml, leaseAllowsManagerDocumentEdits, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

/** Full-width section editor with assistant dock. */
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
  const [savedRow, setSavedRow] = useState<LeasePipelineRow | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const activeRow = savedRow?.id === row.id ? savedRow : row;
  const assistantContext = useMemo(() => buildLeasePacketEditAssistantContext(activeRow), [activeRow]);

  const editableHtml = leaseDocumentHtmlForSectionEdit(activeRow);
  const canEdit = leaseAllowsManagerDocumentEdits(activeRow);

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      onDone();
    };
    window.addEventListener(AGENT_PENDING_ACTIONS_EVENT, refresh);
    return () => window.removeEventListener(AGENT_PENDING_ACTIONS_EVENT, refresh);
  }, [open, onDone]);

  const handleClose = () => {
    onDone();
    onClose();
  };

  const handleSaved = useCallback(
    (updated: LeasePipelineRow) => {
      setSavedRow(updated);
      onDone();
    },
    [onDone],
  );

  const storageScope = modalAssistantStorageScope(`Lease packet edit · ${activeRow.id}`, 0);

  return (
    <Modal
      open={open}
      title="Edit lease"
      onClose={handleClose}
      assistantStrip={false}
      scrollableContent={false}
      dense
      panelClassName="max-w-6xl w-full max-h-[min(92dvh,56rem)]"
    >
      <div className="flex h-[min(82dvh,48rem)] max-h-[min(82dvh,48rem)] flex-col gap-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!canEdit ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border bg-accent/30 px-4 py-6 text-center text-sm text-muted">
              This lease has entered signing and its document body is locked.
            </div>
          ) : editableHtml ? (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
              <LeaseSectionEditor key={`${activeRow.id}:${activeRow.updatedAtIso}`} row={activeRow} managerUserId={managerUserId} onSaved={handleSaved} className="min-h-0" fullHeight />
              <div className="relative min-h-[18rem] overflow-hidden rounded-2xl border border-border bg-card">
                <iframe title="Lease preview" srcDoc={getLeaseDocumentHtml(activeRow) ?? ""} sandbox="" className="absolute inset-0 h-full w-full border-0 bg-card" />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border bg-accent/30 px-4 py-6 text-center text-sm text-muted">
              Generate a PropLane lease before editing. Uploaded PDF templates are preserved as the manager’s original document and cannot be edited here.
            </div>
          )}
        </div>

        {config ? (
          <AssistantConversationProvider endpoint={config.endpoint} storageScope={storageScope}>
            <div
              className={cn(
                "flex w-full shrink-0 flex-col",
                chatOpen ? "max-h-[min(28vh,13rem)]" : "",
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

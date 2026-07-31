"use client";

import { ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { LeaseDocumentDirectEditor } from "@/components/portal/lease-document-direct-editor";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { buildLeasePacketEditAssistantContext } from "@/lib/lease-assistant-context";
import { AGENT_PENDING_ACTIONS_EVENT } from "@/lib/axis-assistant/pending-actions-events";
import { leaseDocumentHtmlForSectionEdit } from "@/lib/lease-section-edit.client";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

/** Full-width visual/HTML lease editor with assistant dock. */
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
  const [draftHtml, setDraftHtml] = useState("");
  const [baselineHtml, setBaselineHtml] = useState("");
  const assistantContext = useMemo(() => buildLeasePacketEditAssistantContext(activeRow), [activeRow]);
  const [conversationInstance, setConversationInstance] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const editableHtml = leaseDocumentHtmlForSectionEdit(activeRow);

  useEffect(() => {
    if (!open) return;
    const html = leaseDocumentHtmlForSectionEdit(row) ?? "";
    setActiveRow(row);
    setDraftHtml(html);
    setBaselineHtml(html);
    setConversationInstance((n) => n + 1);
    setChatOpen(true);
    setActiveSectionId(null);
  }, [open, row.id, row]);

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
      const html = leaseDocumentHtmlForSectionEdit(updated) ?? "";
      setActiveRow(updated);
      setDraftHtml(html);
      setBaselineHtml(html);
      onDone();
    },
    [onDone],
  );

  const storageScope = modalAssistantStorageScope(`Lease packet edit · ${activeRow.id}`, conversationInstance);

  return (
    <Modal
      open={open}
      title="Edit lease"
      onClose={handleClose}
      assistantStrip={false}
      scrollableContent={false}
      dense
      panelClassName="max-w-6xl w-full"
    >
      <div className="flex max-h-[min(72vh,42rem)] min-h-[min(50vh,24rem)] flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {editableHtml && draftHtml ? (
            <LeaseDocumentDirectEditor
              row={activeRow}
              managerUserId={managerUserId}
              html={draftHtml}
              baselineHtml={baselineHtml}
              onChange={setDraftHtml}
              onSaved={handleSaved}
              onSectionFocus={setActiveSectionId}
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border bg-accent/30 px-4 py-6 text-center text-sm text-muted">
              No editable HTML lease document yet. Generate the lease or upload a PDF to preview it here.
            </div>
          )}
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
              data-lease-selected-section={activeSectionId ?? ""}
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

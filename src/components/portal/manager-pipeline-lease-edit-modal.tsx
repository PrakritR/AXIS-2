"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ModalAssistantStrip } from "@/components/portal/modal-assistant-strip";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { buildLeasePacketEditAssistantContext } from "@/lib/lease-assistant-context";
import { AGENT_PENDING_ACTIONS_EVENT } from "@/lib/axis-assistant/pending-actions-events";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

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
  const assistantContext = useMemo(() => buildLeasePacketEditAssistantContext(row), [row]);
  const [conversationInstance, setConversationInstance] = useState(0);

  useEffect(() => {
    if (!open) return;
    setConversationInstance((n) => n + 1);
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

  return (
    <Modal
      open={open}
      title="Edit lease"
      description="Describe the change you want. After you confirm a proposal, the lease preview updates here and on the page behind this dialog."
      onClose={onClose}
      assistantStrip={false}
      panelClassName="flex max-h-[min(92dvh,44rem)] max-w-4xl flex-col"
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <LeaseDocumentPreview
          row={row}
          className="mt-0 shrink-0 [&_iframe]:!h-[min(24vh,220px)] [&_object]:!h-[min(24vh,220px)]"
        />
        <div className="flex min-h-[min(44vh,340px)] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <ModalAssistantStrip
            contextHint={assistantContext}
            storageScopeKey={`Lease packet edit · ${row.id}`}
            conversationInstance={conversationInstance}
            defaultExpanded
            alwaysExpanded
            className="min-h-0 flex-1 border-t-0"
          />
        </div>
      </div>
    </Modal>
  );
}

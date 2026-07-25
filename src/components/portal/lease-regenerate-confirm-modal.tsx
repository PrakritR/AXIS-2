"use client";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter, MODAL_WARNING_BOX_CLASS } from "@/components/ui/modal";
import { LEASE_AI_REVIEW_DISCLAIMER } from "@/lib/lease-templates/types";

export function LeaseRegenerateConfirmModal({
  open,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Regenerate lease"
      onClose={onClose}
      panelClassName="max-w-md"
      footer={
        <ModalFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" onClick={onConfirm} disabled={busy}>
            {busy ? "Generating…" : "Regenerate lease"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        <p className={MODAL_WARNING_BOX_CLASS}>
          <strong>AI-generated draft.</strong> {LEASE_AI_REVIEW_DISCLAIMER}
        </p>
      </div>
    </Modal>
  );
}

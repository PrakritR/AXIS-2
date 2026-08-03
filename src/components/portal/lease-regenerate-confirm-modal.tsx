"use client";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter, MODAL_WARNING_BOX_CLASS } from "@/components/ui/modal";
import { LEASE_AI_REVIEW_DISCLAIMER } from "@/lib/lease-templates/types";

export function LeaseRegenerateConfirmModal({
  open,
  busy = false,
  replacesManagerEdits = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  /** A manual body edit exists and regeneration will replace it. */
  replacesManagerEdits?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Regenerate lease"
      onClose={onClose}
      fullPage={false}
      footer={
        <ModalFooter>
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
        {replacesManagerEdits ? (
          <p className={MODAL_WARNING_BOX_CLASS}>
            <strong>Manager edits will be replaced.</strong> Regeneration rebuilds this lease from the current application and listing terms. Your saved body edits will not be kept.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

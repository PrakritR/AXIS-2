"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal, MODAL_FIELD_LABEL_CLASS, MODAL_INSET_BOX_CLASS } from "@/components/ui/modal";

/** Auto-generated basic template that seeds the request-edits message to admin. */
export const LEASE_EDIT_REQUEST_TEMPLATE_INTRO = "This lease is incorrect and needs revision.";

/**
 * Popup for a property manager to request lease edits from the Axis admin team.
 * Pre-fills the auto-generated template and leaves an editable area for the
 * manager to describe the specific issue. On submit the composed message is
 * delivered to the admin via the portal inbox AND email (see the panel handler).
 */
export function LeaseEditRequestModal({
  open,
  residentName,
  unit,
  recipientLabel,
  busy = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  residentName: string;
  unit: string;
  recipientLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  // Reset the editable notes whenever the popup opens for a different lease.
  useEffect(() => {
    if (open) queueMicrotask(() => setNote(""));
  }, [open, residentName, unit]);

  const leaseLabel = [residentName || "Resident", unit.trim() || "unit"].filter(Boolean).join(" — ");

  return (
    <Modal open={open} title="Request lease edits from admin" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Send this lease back to the Axis admin team for correction. The message below is delivered to the admin
          inbox and by email.
        </p>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>To</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS}`}>{recipientLabel}</p>
        </div>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>Lease</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS}`}>{leaseLabel}</p>
        </div>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>Template</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS}`}>{LEASE_EDIT_REQUEST_TEMPLATE_INTRO}</p>
        </div>
        <div>
          <label htmlFor="lease-edit-request-note" className={MODAL_FIELD_LABEL_CLASS}>
            Describe the specific issue
          </label>
          <Textarea
            id="lease-edit-request-note"
            rows={5}
            autoFocus
            data-attr="lease-edit-request-note"
            placeholder="What needs to change on this lease? e.g. wrong rent amount, incorrect lease dates, missing addendum…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card text-sm"
          />
        </div>
        <div className="flex justify-start gap-2 pt-1">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={busy}
            data-attr="lease-edit-request-send"
            onClick={() => onSubmit(note)}
          >
            {busy ? "Sending…" : "Send to admin"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

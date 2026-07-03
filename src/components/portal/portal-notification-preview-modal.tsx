"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, MODAL_FIELD_LABEL_CLASS, MODAL_INSET_BOX_CLASS, MODAL_INSET_BOX_PRE_CLASS, MODAL_WARNING_BOX_CLASS } from "@/components/ui/modal";

export function PortalNotificationPreviewModal({
  open,
  title,
  onClose,
  recipient,
  subject,
  body,
  intro,
  warning,
  footerNote,
  skipMessageLabel = "Don't message resident",
  confirmLabel,
  confirmLabelWithoutMessage,
  confirmBusy = false,
  confirmBusyLabel = "Working…",
  cancelLabel = "Cancel",
  onConfirm,
  panelClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  recipient: string;
  subject: string;
  body: string;
  intro?: string;
  warning?: string;
  footerNote?: string;
  skipMessageLabel?: string;
  confirmLabel: string;
  confirmLabelWithoutMessage?: string;
  confirmBusy?: boolean;
  confirmBusyLabel?: string;
  cancelLabel?: string;
  onConfirm: (skipMessage: boolean) => void;
  panelClassName?: string;
}) {
  const [skipMessage, setSkipMessage] = useState(false);

  useEffect(() => {
    if (open) queueMicrotask(() => setSkipMessage(false));
  }, [open, recipient, subject, body]);

  const effectiveConfirmLabel = skipMessage
    ? (confirmLabelWithoutMessage ?? confirmLabel)
    : confirmLabel;

  return (
    <Modal open={open} title={title} onClose={onClose} panelClassName={panelClassName}>
      <div className="space-y-3">
        {warning ? (
          <p className={MODAL_WARNING_BOX_CLASS}>
            <strong>AI-generated draft.</strong> {warning}
          </p>
        ) : null}
        {intro ? <p className="text-sm text-muted">{intro}</p> : null}
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>To</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS}`}>{recipient}</p>
        </div>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>Subject</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS} ${skipMessage ? "opacity-50" : ""}`}>{subject}</p>
        </div>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>Message</p>
          <pre className={`${MODAL_INSET_BOX_PRE_CLASS} mt-1 ${skipMessage ? "opacity-50" : ""}`}>{body}</pre>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipMessage}
            onChange={(e) => setSkipMessage(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary"
          />
          <span className="text-muted">{skipMessageLabel}</span>
        </label>
        {footerNote && !skipMessage ? <p className="text-xs text-muted">{footerNote}</p> : null}
        {skipMessage ? (
          <p className="text-xs text-muted">The action will complete without sending this message.</p>
        ) : null}
        <div className="flex justify-start gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={confirmBusy}
            onClick={() => onConfirm(skipMessage)}
          >
            {confirmBusy ? confirmBusyLabel : effectiveConfirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

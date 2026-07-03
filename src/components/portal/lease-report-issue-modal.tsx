"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal, MODAL_FIELD_LABEL_CLASS, MODAL_INSET_BOX_CLASS } from "@/components/ui/modal";

/**
 * Popup to send a message about a lease to the counterparty (manager <-> resident).
 * On submit the composed message is delivered to the recipient's Axis inbox AND
 * email — see the panel handler that calls deliverPortalInboxMessage.
 */
export function LeaseReportIssueModal({
  open,
  recipientLabel,
  leaseLabel,
  busy = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  recipientLabel: string;
  leaseLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (subject: string, message: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Reset the compose fields whenever the popup opens for a different lease.
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setSubject("");
        setMessage("");
      });
    }
  }, [open, leaseLabel]);

  return (
    <Modal open={open} title="Report an issue" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Send a message about this lease. It is delivered to {recipientLabel} in their Axis inbox and by email.
        </p>
        <div>
          <p className={MODAL_FIELD_LABEL_CLASS}>Lease</p>
          <p className={`mt-1 ${MODAL_INSET_BOX_CLASS}`}>{leaseLabel}</p>
        </div>
        <div>
          <label htmlFor="lease-report-issue-subject" className={MODAL_FIELD_LABEL_CLASS}>
            Subject
          </label>
          <Input
            id="lease-report-issue-subject"
            data-attr="lease-report-issue-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
            className="mt-1 w-full rounded-xl border border-border bg-card text-sm"
          />
        </div>
        <div>
          <label htmlFor="lease-report-issue-message" className={MODAL_FIELD_LABEL_CLASS}>
            Message
          </label>
          <Textarea
            id="lease-report-issue-message"
            rows={5}
            autoFocus
            data-attr="lease-report-issue-message"
            placeholder="Describe the issue…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
            disabled={busy || !subject.trim() || !message.trim()}
            data-attr="lease-report-issue-send"
            onClick={() => onSubmit(subject.trim(), message.trim())}
          >
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

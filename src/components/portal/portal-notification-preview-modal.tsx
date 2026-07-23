"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Modal,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INSET_BOX_CLASS,
  MODAL_WARNING_BOX_CLASS,
} from "@/components/ui/modal";
import {
  PORTAL_TOOLBAR_GROUP,
  PORTAL_TOOLBAR_PILL_BUTTON,
  PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
} from "@/components/portal/portal-metrics";
import { cn } from "@/lib/utils";

export type NotificationDeliveryChannels = {
  viaEmail: boolean;
  viaSms: boolean;
};

export type NotificationConfirmDraft = {
  subject: string;
  body: string;
};

/**
 * Shared resident-message popup (payment reminders, service approve, etc.).
 * Matches Communication → New message: autofilled fields, Send via pills,
 * modal fits the viewport — only the message body scrolls.
 */
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
  showSkipMessage = true,
  skipMessageLabel = "Don't message resident",
  /** When true, show Email / SMS pills (New message style). */
  showChannelPicker = false,
  emailAvailable = true,
  smsAvailable = true,
  defaultViaEmail = true,
  defaultViaSms = true,
  /** Allow editing the message body (default on — New message format). */
  editableBody = true,
  /** Allow editing the subject line (default on). */
  editableSubject = true,
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
  showSkipMessage?: boolean;
  skipMessageLabel?: string;
  showChannelPicker?: boolean;
  emailAvailable?: boolean;
  smsAvailable?: boolean;
  defaultViaEmail?: boolean;
  defaultViaSms?: boolean;
  editableBody?: boolean;
  editableSubject?: boolean;
  confirmLabel: string;
  confirmLabelWithoutMessage?: string;
  confirmBusy?: boolean;
  confirmBusyLabel?: string;
  cancelLabel?: string;
  onConfirm: (
    skipMessage: boolean,
    channels?: NotificationDeliveryChannels,
    draft?: NotificationConfirmDraft,
  ) => void;
  panelClassName?: string;
}) {
  const [skipMessage, setSkipMessage] = useState(false);
  const [viaEmail, setViaEmail] = useState(defaultViaEmail);
  const [viaSms, setViaSms] = useState(defaultViaSms);
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftBody, setDraftBody] = useState(body);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSkipMessage(false);
      setViaEmail(emailAvailable ? defaultViaEmail : false);
      setViaSms(smsAvailable ? defaultViaSms : false);
      setDraftSubject(subject);
      setDraftBody(body);
    });
  }, [open, recipient, subject, body, emailAvailable, smsAvailable, defaultViaEmail, defaultViaSms]);

  const effectiveConfirmLabel = skipMessage
    ? (confirmLabelWithoutMessage ?? confirmLabel)
    : confirmLabel;

  const channelsOk =
    !showChannelPicker ||
    skipMessage ||
    (viaEmail && emailAvailable) ||
    (viaSms && smsAvailable);

  const messageReady = skipMessage || (draftSubject.trim().length > 0 && draftBody.trim().length > 0);

  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={confirmBusy}>
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant="primary"
        className="rounded-full"
        data-attr="portal-notification-confirm"
        disabled={confirmBusy || !channelsOk || !messageReady}
        onClick={() =>
          onConfirm(
            skipMessage,
            {
              viaEmail: Boolean(viaEmail && emailAvailable),
              viaSms: Boolean(viaSms && smsAvailable),
            },
            { subject: draftSubject.trim(), body: draftBody.trim() },
          )
        }
      >
        {confirmBusy ? confirmBusyLabel : effectiveConfirmLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      dense
      footer={footer}
      panelClassName={cn(
        // Fit one viewport; only the message block scrolls internally.
        "max-h-[min(92dvh,36rem)]",
        panelClassName,
      )}
    >
      <div className="flex min-h-0 flex-col gap-2.5">
        {warning ? (
          <p className={`${MODAL_WARNING_BOX_CLASS} shrink-0 py-1.5 text-xs`}>
            <strong>AI-generated draft.</strong> {warning}
          </p>
        ) : null}
        {intro ? <p className="shrink-0 text-xs leading-snug text-muted">{intro}</p> : null}

        <div className="shrink-0">
          <p className={MODAL_FIELD_LABEL_CLASS}>To</p>
          <p className={`mt-1 truncate ${MODAL_INSET_BOX_CLASS} py-2`}>{recipient}</p>
        </div>

        <div className="shrink-0">
          <label
            className={MODAL_FIELD_LABEL_CLASS}
            htmlFor={editableSubject ? "portal-notification-subject" : undefined}
          >
            Subject
          </label>
          {editableSubject && !skipMessage ? (
            <Input
              id="portal-notification-subject"
              className="mt-1"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              data-attr="portal-notification-subject"
            />
          ) : (
            <p className={`mt-1 truncate ${MODAL_INSET_BOX_CLASS} py-2 ${skipMessage ? "opacity-50" : ""}`}>
              {draftSubject}
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <label
            className={MODAL_FIELD_LABEL_CLASS}
            htmlFor={editableBody ? "portal-notification-body" : undefined}
          >
            Message
          </label>
          {editableBody && !skipMessage ? (
            <Textarea
              id="portal-notification-body"
              className="mt-1 max-h-[min(28dvh,10.5rem)] min-h-[5.5rem] resize-none overflow-y-auto overscroll-contain"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              data-attr="portal-notification-body"
              placeholder="Write a message to the resident…"
            />
          ) : (
            <pre
              className={cn(
                MODAL_INSET_BOX_CLASS,
                "mt-1 max-h-[min(28dvh,10.5rem)] min-h-[5.5rem] overflow-y-auto overscroll-contain whitespace-pre-wrap py-2 text-sm leading-relaxed",
                skipMessage ? "opacity-50" : "",
              )}
            >
              {draftBody}
            </pre>
          )}
        </div>

        {showChannelPicker && !skipMessage ? (
          <div className="shrink-0 border-t border-border pt-2.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Send via</p>
            <div className={PORTAL_TOOLBAR_GROUP} role="group" aria-label="Send platform">
              <button
                type="button"
                className={`${PORTAL_TOOLBAR_PILL_BUTTON} ${viaEmail && emailAvailable ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : ""} ${!emailAvailable ? "opacity-50" : ""}`}
                aria-pressed={viaEmail && emailAvailable}
                disabled={!emailAvailable}
                data-attr="portal-notification-via-email"
                onClick={() => setViaEmail((v) => !v)}
              >
                Email
              </button>
              <button
                type="button"
                className={`${PORTAL_TOOLBAR_PILL_BUTTON} ${viaSms && smsAvailable ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : ""} ${!smsAvailable ? "opacity-50" : ""}`}
                aria-pressed={viaSms && smsAvailable}
                disabled={!smsAvailable}
                data-attr="portal-notification-via-sms"
                onClick={() => setViaSms((v) => !v)}
              >
                SMS
              </button>
            </div>
            {!channelsOk ? (
              <p className="mt-1.5 text-xs font-medium text-red-600">Choose Email and/or SMS.</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {footerNote?.trim() ||
                  "Pick one or both. Always saved to PropLane inbox. SMS uses your work number."}
              </p>
            )}
          </div>
        ) : null}

        {showSkipMessage ? (
          <label className="flex shrink-0 items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipMessage}
              onChange={(e) => setSkipMessage(e.target.checked)}
              data-attr="portal-notification-skip-message"
              className="mt-0.5 h-4 w-4 rounded border-border text-primary"
            />
            <span className="text-muted">{skipMessageLabel}</span>
          </label>
        ) : null}

        {!showChannelPicker && footerNote && !skipMessage ? (
          <p className="shrink-0 text-xs text-muted">{footerNote}</p>
        ) : null}
        {skipMessage ? (
          <p className="shrink-0 text-xs text-muted">The action will complete without sending this message.</p>
        ) : null}
      </div>
    </Modal>
  );
}

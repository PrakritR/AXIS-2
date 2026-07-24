"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Modal,
  MODAL_INSET_BOX_CLASS,
  MODAL_WARNING_BOX_CLASS,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export type NotificationDeliveryChannels = {
  viaEmail: boolean;
  viaSms: boolean;
};

export type NotificationConfirmDraft = {
  subject: string;
  body: string;
};

function fieldLabel(className?: string) {
  return cn("text-xs font-medium text-muted", className);
}

function ChannelToggle({
  label,
  active,
  disabled,
  onClick,
  dataAttr,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  dataAttr: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
          : "text-muted hover:bg-accent/40 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
      aria-pressed={active}
      disabled={disabled}
      data-attr={dataAttr}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Shared resident-message popup (payment reminders, service approve, etc.).
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
  showChannelPicker = false,
  emailAvailable = true,
  smsAvailable = true,
  defaultViaEmail = true,
  defaultViaSms = true,
  editableBody = true,
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
      panelClassName={cn("max-w-lg", panelClassName)}
    >
      <div className="space-y-4">
        {warning ? (
          <p className={`${MODAL_WARNING_BOX_CLASS} py-1.5 text-xs`}>
            <strong>AI-generated draft.</strong> {warning}
          </p>
        ) : null}
        {intro ? <p className="text-sm leading-snug text-muted">{intro}</p> : null}

        <div>
          <p className={fieldLabel()}>To</p>
          <p className={cn("mt-1 truncate text-sm text-foreground", MODAL_INSET_BOX_CLASS, "py-2")}>
            {recipient}
          </p>
        </div>

        <div>
          <label className={fieldLabel()} htmlFor={editableSubject ? "portal-notification-subject" : undefined}>
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
            <p
              className={cn(
                "mt-1 truncate text-sm",
                MODAL_INSET_BOX_CLASS,
                "py-2",
                skipMessage ? "opacity-50" : "",
              )}
            >
              {draftSubject}
            </p>
          )}
        </div>

        {showChannelPicker && !skipMessage ? (
          <div>
            <p className={fieldLabel("mb-2")}>Send via</p>
            <div
              className="flex gap-1 rounded-lg border border-border bg-accent/20 p-1"
              role="group"
              aria-label="Send platform"
            >
              <ChannelToggle
                label="Email"
                active={viaEmail && emailAvailable}
                disabled={!emailAvailable}
                dataAttr="portal-notification-via-email"
                onClick={() => setViaEmail((v) => !v)}
              />
              <ChannelToggle
                label="SMS"
                active={viaSms && smsAvailable}
                disabled={!smsAvailable}
                dataAttr="portal-notification-via-sms"
                onClick={() => setViaSms((v) => !v)}
              />
            </div>
            {!channelsOk ? (
              <p className="mt-1.5 text-xs font-medium text-red-600">Choose email and/or SMS.</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {footerNote?.trim() ||
                  "Saved to PropLane inbox. SMS uses your work number when enabled."}
              </p>
            )}
          </div>
        ) : null}

        <div>
          <label className={fieldLabel()} htmlFor={editableBody ? "portal-notification-body" : undefined}>
            Message
          </label>
          {editableBody && !skipMessage ? (
            <Textarea
              id="portal-notification-body"
              className="mt-1 min-h-[9rem] resize-y"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              data-attr="portal-notification-body"
              placeholder="Write a message to the resident…"
            />
          ) : (
            <pre
              className={cn(
                MODAL_INSET_BOX_CLASS,
                "mt-1 min-h-[9rem] overflow-y-auto whitespace-pre-wrap py-2 text-sm leading-relaxed",
                skipMessage ? "opacity-50" : "",
              )}
            >
              {draftBody}
            </pre>
          )}
        </div>

        {showSkipMessage ? (
          <label className="flex items-start gap-2 text-sm">
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
          <p className="text-xs text-muted">{footerNote}</p>
        ) : null}
        {skipMessage ? (
          <p className="text-xs text-muted">The action will complete without sending this message.</p>
        ) : null}
      </div>
    </Modal>
  );
}

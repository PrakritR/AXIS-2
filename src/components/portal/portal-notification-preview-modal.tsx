"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxMultiSelect, type CheckboxMultiSelectOption } from "@/components/ui/checkbox-multi-select";
import { Input, Textarea } from "@/components/ui/input";
import {
  Modal,
  ModalFooter,
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

export const NOTIFICATION_SEND_VIA_OPTIONS: CheckboxMultiSelectOption[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

function fieldLabel(className?: string) {
  return cn("text-xs font-medium text-muted", className);
}

function channelsFromSelection(selected: string[]): NotificationDeliveryChannels {
  return {
    viaEmail: selected.includes("email"),
    viaSms: selected.includes("sms"),
  };
}

function defaultChannelSelection(
  emailAvailable: boolean,
  smsAvailable: boolean,
  defaultViaEmail: boolean,
  defaultViaSms: boolean,
): string[] {
  const selected: string[] = [];
  if (emailAvailable && defaultViaEmail) selected.push("email");
  if (smsAvailable && defaultViaSms) selected.push("sms");
  return selected;
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
  showChannelPicker = true,
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
  const [sendVia, setSendVia] = useState<string[]>([]);
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftBody, setDraftBody] = useState(body);

  const sendViaOptions = useMemo(() => {
    return NOTIFICATION_SEND_VIA_OPTIONS.filter((option) => {
      if (option.value === "email") return emailAvailable;
      if (option.value === "sms") return smsAvailable;
      return true;
    });
  }, [emailAvailable, smsAvailable]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSkipMessage(false);
      setSendVia(defaultChannelSelection(emailAvailable, smsAvailable, defaultViaEmail, defaultViaSms));
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
    sendVia.some((value) => sendViaOptions.some((option) => option.value === value));

  const messageReady = skipMessage || (draftSubject.trim().length > 0 && draftBody.trim().length > 0);

  const footer = (
    <ModalFooter>
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
            channelsFromSelection(sendVia),
            { subject: draftSubject.trim(), body: draftBody.trim() },
          )
        }
      >
        {confirmBusy ? confirmBusyLabel : effectiveConfirmLabel}
      </Button>
    </ModalFooter>
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
            <CheckboxMultiSelect
              label="Send via"
              labelClassName={fieldLabel()}
              options={sendViaOptions}
              selected={sendVia}
              onChange={setSendVia}
              emptyLabel="Choose channels…"
              dataAttr="portal-notification-send-via"
            />
            {!channelsOk ? (
              <p className="mt-1.5 text-xs font-medium text-red-600">Choose at least one channel.</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {footerNote?.trim() ||
                  "Always saved to PropLane inbox. SMS uses your work number when enabled."}
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

export type BulkPaymentReminderPreviewItem = {
  id: string;
  recipient: string;
  chargeLabel: string;
  subject: string;
  body: string;
};

/** Scrollable preview before sending payment reminders to multiple charges. */
export function PortalBulkPaymentReminderPreviewModal({
  open,
  onClose,
  items,
  confirmBusy = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  items: BulkPaymentReminderPreviewItem[];
  confirmBusy?: boolean;
  onConfirm: () => void;
}) {
  const count = items.length;
  const title = count === 1 ? "Send payment reminder" : `Send ${count} payment reminders`;
  const confirmLabel = count === 1 ? "Send reminder" : `Send ${count} reminders`;

  const footer = (
    <ModalFooter>
      <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={confirmBusy}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="primary"
        className="rounded-full"
        data-attr="portal-bulk-notification-confirm"
        disabled={confirmBusy || count === 0}
        onClick={onConfirm}
      >
        {confirmBusy ? "Sending…" : confirmLabel}
      </Button>
    </ModalFooter>
  );

  return (
    <Modal open={open} title={title} onClose={onClose} dense footer={footer} panelClassName="max-w-lg">
      <p className="mb-4 text-sm leading-snug text-muted">
        Review each message below. Reminders are saved to PropLane inbox and sent by email when an address is on file.
      </p>
      <div className="max-h-[min(52vh,26rem)] space-y-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {items.map((item, index) => (
          <div key={item.id} className="space-y-2 rounded-xl border border-border bg-accent/10 p-3">
            {count > 1 ? (
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Reminder {index + 1}</p>
            ) : null}
            <p className="text-xs font-semibold text-foreground">{item.chargeLabel}</p>
            <div>
              <p className={fieldLabel()}>To</p>
              <p className={cn("mt-0.5 truncate text-sm text-foreground", MODAL_INSET_BOX_CLASS, "py-1.5")}>{item.recipient}</p>
            </div>
            <div>
              <p className={fieldLabel()}>Subject</p>
              <p className={cn("mt-0.5 truncate text-sm text-foreground", MODAL_INSET_BOX_CLASS, "py-1.5")}>{item.subject}</p>
            </div>
            <div>
              <p className={fieldLabel()}>Message</p>
              <pre
                className={cn(
                  MODAL_INSET_BOX_CLASS,
                  "mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap py-2 text-sm leading-relaxed",
                )}
              >
                {item.body}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}


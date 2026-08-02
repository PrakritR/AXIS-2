"use client";

import type { ReactNode } from "react";
import {
  CheckboxMultiSelect,
  FieldSingleSelect,
  type CheckboxMultiSelectOption,
} from "@/components/ui/checkbox-multi-select";
import { Input, Textarea } from "@/components/ui/input";
import { MODAL_INSET_BOX_CLASS } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** Fixed-height new-message modal — inner body scrolls; panel does not resize with fields. */
export const PORTAL_MESSAGE_COMPOSE_MODAL_PANEL_CLASS = "w-full max-w-lg max-h-[min(92dvh,38rem)]";

export type PortalMessageSendViaMode = "email" | "sms" | "both";

export const PORTAL_MESSAGE_SEND_VIA_OPTIONS: CheckboxMultiSelectOption[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export const PORTAL_MESSAGE_DEFAULT_FOOTER_NOTE =
  "Always saved to PropLane inbox. SMS uses your work number when enabled.";

export function portalMessageFieldLabel(className?: string) {
  return cn("text-xs font-medium text-muted", className);
}

/** Match Subject/Message labels on To / Which people multi-selects. */
export const PORTAL_MESSAGE_COMPOSE_SELECT_LABEL_CLASS = portalMessageFieldLabel();

export function portalMessageSendViaToMode(selected: string[]): PortalMessageSendViaMode {
  const { viaEmail, viaSms } = portalMessageChannelsFromSelection(selected);
  if (viaEmail && viaSms) return "both";
  if (viaSms) return "sms";
  return "email";
}

export function portalMessageSendViaModeToSelection(mode: PortalMessageSendViaMode): string[] {
  if (mode === "both") return ["email", "sms"];
  if (mode === "sms") return ["sms"];
  return ["email"];
}

export function PortalMessageComposeModalBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[min(72dvh,34rem)] min-h-[22rem] flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5">
        {children}
      </div>
    </div>
  );
}

export function defaultPortalMessageScheduleAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function portalMessageChannelsFromSelection(selected: string[]): {
  viaEmail: boolean;
  viaSms: boolean;
} {
  return {
    viaEmail: selected.includes("email"),
    viaSms: selected.includes("sms"),
  };
}

export function defaultPortalMessageChannelSelection(
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

export function PortalMessageRecipientReadonly({ recipient }: { recipient: string }) {
  return (
    <div>
      <p className={portalMessageFieldLabel()}>To</p>
      <p className={cn("mt-1 truncate text-sm text-foreground", MODAL_INSET_BOX_CLASS, "py-2")}>
        {recipient}
      </p>
    </div>
  );
}

export function PortalMessagePhoneReadonly({ phone }: { phone?: string }) {
  if (!phone?.trim()) return null;
  return (
    <div>
      <p className={portalMessageFieldLabel()}>Phone</p>
      <p className={cn("mt-1 truncate text-sm text-foreground", MODAL_INSET_BOX_CLASS, "py-2")}>
        {phone.trim()}
      </p>
    </div>
  );
}

export function PortalMessageSubjectField({
  id = "portal-message-subject",
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = "Subject",
  dataAttr,
}: {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  dataAttr?: string;
}) {
  return (
    <div>
      <label className={portalMessageFieldLabel()} htmlFor={readOnly ? undefined : id}>
        Subject
      </label>
      {readOnly || disabled ? (
        <p
          className={cn(
            "mt-1 truncate text-sm",
            MODAL_INSET_BOX_CLASS,
            "py-2",
            disabled ? "opacity-50" : "",
          )}
        >
          {value}
        </p>
      ) : (
        <Input
          id={id}
          className="mt-1"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          data-attr={dataAttr}
        />
      )}
    </div>
  );
}

export function PortalMessageSendViaField({
  selected,
  onChange,
  emailAvailable = true,
  smsAvailable = true,
  disabled = false,
  footerNote = PORTAL_MESSAGE_DEFAULT_FOOTER_NOTE,
  dataAttr = "portal-message-send-via",
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  emailAvailable?: boolean;
  smsAvailable?: boolean;
  disabled?: boolean;
  footerNote?: string;
  dataAttr?: string;
}) {
  const options = PORTAL_MESSAGE_SEND_VIA_OPTIONS.filter((option) => {
    if (option.value === "email") return emailAvailable;
    if (option.value === "sms") return smsAvailable;
    return true;
  });
  const channelsOk = disabled || selected.some((value) => options.some((option) => option.value === value));

  return (
    <div>
      <CheckboxMultiSelect
        label="Send via"
        labelClassName={portalMessageFieldLabel()}
        options={options}
        selected={selected}
        onChange={onChange}
        disabled={disabled}
        emptyLabel="Choose channels…"
        dataAttr={dataAttr}
      />
      {!channelsOk ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">Choose at least one channel.</p>
      ) : (
        <p className="mt-1.5 text-xs text-muted">{footerNote}</p>
      )}
    </div>
  );
}

/** Single-select Send via — same field width and label style as Subject / Message. */
export function PortalMessageSendViaDropdown({
  selected,
  onChange,
  emailAvailable = true,
  smsAvailable = true,
  disabled = false,
  footerNote = PORTAL_MESSAGE_DEFAULT_FOOTER_NOTE,
  dataAttr = "portal-message-send-via",
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  emailAvailable?: boolean;
  smsAvailable?: boolean;
  disabled?: boolean;
  footerNote?: string;
  dataAttr?: string;
}) {
  const options: CheckboxMultiSelectOption[] = [];
  if (emailAvailable) options.push({ value: "email", label: "Email" });
  if (smsAvailable) options.push({ value: "sms", label: "SMS" });
  if (emailAvailable && smsAvailable) options.push({ value: "both", label: "Email & SMS" });

  const mode = portalMessageSendViaToMode(selected);
  const effectiveMode = options.some((option) => option.value === mode) ? mode : (options[0]?.value ?? "email");

  return (
    <div>
      <FieldSingleSelect
        label="Send via"
        labelClassName={portalMessageFieldLabel()}
        options={options}
        value={effectiveMode}
        onChange={(next) =>
          onChange(portalMessageSendViaModeToSelection(next as PortalMessageSendViaMode))
        }
        disabled={disabled || options.length <= 1}
        dataAttr={dataAttr}
      />
      <p className="mt-1.5 text-xs text-muted">{footerNote}</p>
    </div>
  );
}

export function PortalMessageBodyField({
  id = "portal-message-body",
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = "Write your message…",
  minHeightClass = "min-h-[9rem]",
  maxLength,
  dataAttr,
  showCharCount = false,
}: {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  minHeightClass?: string;
  maxLength?: number;
  dataAttr?: string;
  showCharCount?: boolean;
}) {
  return (
    <div>
      <label className={portalMessageFieldLabel()} htmlFor={readOnly ? undefined : id}>
        Message
      </label>
      {readOnly || disabled ? (
        <pre
          className={cn(
            MODAL_INSET_BOX_CLASS,
            "mt-1 overflow-y-auto whitespace-pre-wrap py-2 text-sm leading-relaxed",
            minHeightClass,
            disabled ? "opacity-50" : "",
          )}
        >
          {value}
        </pre>
      ) : (
        <>
          <Textarea
            id={id}
            className={cn("mt-1 resize-y", minHeightClass)}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            data-attr={dataAttr}
          />
          {showCharCount && maxLength ? (
            <span className="mt-1 block text-xs text-muted">{value.trim().length}/{maxLength}</span>
          ) : null}
        </>
      )}
    </div>
  );
}

export function PortalMessageScheduleFields({
  scheduleLater,
  onScheduleLaterChange,
  sendAt,
  onSendAtChange,
  disabled = false,
  scheduleDataAttr = "portal-message-schedule-later",
  sendAtDataAttr = "portal-message-schedule-at",
}: {
  scheduleLater: boolean;
  onScheduleLaterChange: (next: boolean) => void;
  sendAt: string;
  onSendAtChange: (next: string) => void;
  disabled?: boolean;
  scheduleDataAttr?: string;
  sendAtDataAttr?: string;
}) {
  if (disabled) return null;
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={scheduleLater}
          onChange={(e) => onScheduleLaterChange(e.target.checked)}
          data-attr={scheduleDataAttr}
        />
        <span className="font-medium text-foreground">Schedule for later</span>
      </label>
      {scheduleLater ? (
        <label className="block text-sm">
          <span className={portalMessageFieldLabel()}>Send date & time</span>
          <Input
            type="datetime-local"
            className="mt-1"
            value={sendAt}
            onChange={(e) => onSendAtChange(e.target.value)}
            data-attr={sendAtDataAttr}
          />
        </label>
      ) : null}
    </>
  );
}

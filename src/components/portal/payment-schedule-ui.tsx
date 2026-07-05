"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerAutomationSettings } from "@/lib/payment-automation-settings";
import { PAYMENT_AUTOMATION_SETTINGS_EVENT } from "@/lib/payment-automation-settings";
import { HOUSEHOLD_CHARGES_EVENT, readHouseholdCharges } from "@/lib/household-charges";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import {
  filterScheduledPaymentMessagesForUnpaidCharges,
  filterScheduledPaymentMessagesForVisibility,
  scheduledReminderShortLabel,
} from "@/lib/scheduled-payment-messages";

function formatSendDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** One-line summary for automation settings buttons. */
export function formatAutomationScheduleSummary(settings: ManagerAutomationSettings): string {
  const parts: string[] = [];
  const days = [...settings.preDueReminderDays].sort((a, b) => b - a);
  if (days.length) parts.push(days.map((d) => `${d}d`).join(", "));
  if (settings.sameDayReminderEnabled) parts.push("due date");
  if (settings.overdueDailyEnabled) parts.push("overdue");
  if (settings.setDateReminders.length) {
    parts.push(settings.setDateReminders.length === 1 ? "1 set date" : `${settings.setDateReminders.length} set dates`);
  }
  return parts.length ? parts.join(" · ") : "Off";
}

/** Persist a one-off reminder for a single charge on a specific calendar date. */
export async function addChargeSetDateReminder(chargeId: string, isoDate: string): Promise<void> {
  const res = await fetch("/api/portal/scheduled-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ chargeId, date: isoDate }),
  });
  if (!res.ok) {
    const payload = (await res.json()) as { error?: string };
    throw new Error(payload.error ?? "Could not add reminder.");
  }
}

function formatIsoDateLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year!, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact date picker + button that adds a one-off set-date reminder. */
export function AddSetDateReminderControl({
  onAdd,
  label = "Add date",
  disabled,
}: {
  onAdd: (isoDate: string) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Input
        type="date"
        className="h-8 w-36 text-xs"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={disabled || busy}
        aria-label="Reminder date"
      />
      <Button
        type="button"
        variant="outline"
        className="rounded-full px-2 py-1 text-xs"
        disabled={disabled || busy || !date}
        onClick={async () => {
          if (!date) return;
          setBusy(true);
          try {
            await onAdd(date);
            setDate("");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Adding…" : label}
      </Button>
    </div>
  );
}

export function ChargeReminderList({
  messages,
  onEdit,
  onToggleCancel,
}: {
  messages: ScheduledPaymentMessage[];
  onEdit?: (message: ScheduledPaymentMessage) => void;
  onToggleCancel?: (message: ScheduledPaymentMessage, cancelled: boolean) => void | Promise<void>;
}) {
  if (!messages.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {messages.map((m) => {
        const cancelled = m.status === "cancelled";
        const label = scheduledReminderShortLabel(m.kind, m.daysBeforeDue);
        return (
          <span
            key={m.id}
            className={`inline-flex max-w-full items-stretch overflow-hidden rounded-full border text-[11px] leading-none ${
              cancelled
                ? "border-border bg-accent/20 text-muted"
                : "border-primary/20 bg-primary/5 text-foreground"
            }`}
          >
            <button
              type="button"
              className={`px-2 py-1 text-left hover:bg-accent/40 ${cancelled ? "line-through" : ""}`}
              title={`Edit · sends ${formatSendDate(m.sendAt)}`}
              onClick={() => onEdit?.(m)}
            >
              <span className="font-medium">{label}</span>
              <span className="ml-1 text-muted">· {formatSendDate(m.sendAt)}</span>
            </button>
            {onToggleCancel ? (
              <button
                type="button"
                className="border-l border-border px-1.5 py-1 text-muted hover:bg-accent/50 hover:text-foreground"
                title={cancelled ? "Restore send" : "Cancel send"}
                aria-label={cancelled ? `Restore ${label}` : `Cancel ${label}`}
                onClick={() => void onToggleCancel(m, !cancelled)}
              >
                {cancelled ? "↺" : "×"}
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function ChargeRemindersModal({
  open,
  onClose,
  residentName,
  chargeTitle,
  dueDate,
  messages,
  onMessageSaved,
  onToggleCancel,
  onOpenSettings,
  onAddSetDate,
}: {
  open: boolean;
  onClose: () => void;
  residentName: string;
  chargeTitle: string;
  dueDate: string;
  messages: ScheduledPaymentMessage[];
  onMessageSaved?: () => void;
  onToggleCancel: (message: ScheduledPaymentMessage, cancelled: boolean) => void | Promise<void>;
  onOpenSettings?: () => void;
  onAddSetDate?: (isoDate: string) => void | Promise<void>;
}) {
  const [editingMessage, setEditingMessage] = useState<ScheduledPaymentMessage | null>(null);

  return (
    <Modal open={open} onClose={onClose} title="Automated reminders">
      {editingMessage ? (
        <ScheduledMessageEditForm
          key={editingMessage.id}
          message={editingMessage}
          onClose={() => setEditingMessage(null)}
          onSaved={() => {
            onMessageSaved?.();
            setEditingMessage(null);
          }}
        />
      ) : (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{residentName}</span> · {chargeTitle} · due {dueDate}
        </p>
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No upcoming reminders for this charge.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const cancelled = m.status === "cancelled";
              const label = scheduledReminderShortLabel(m.kind, m.daysBeforeDue);
              return (
                <li
                  key={m.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                    cancelled ? "border-border bg-accent/15 text-muted" : "border-border bg-card"
                  }`}
                >
                  <button
                    type="button"
                    className={`min-w-0 flex-1 text-left text-sm ${cancelled ? "line-through" : ""}`}
                    onClick={() => setEditingMessage(m)}
                  >
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="mt-0.5 block text-xs text-muted">Sends {formatSendDate(m.sendAt)}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => setEditingMessage(m)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-full px-2.5 text-xs"
                      onClick={() => void onToggleCancel(m, !cancelled)}
                    >
                      {cancelled ? "Restore" : "Skip"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {onAddSetDate ? (
          <div>
            <p className="text-xs font-semibold text-muted">Add a reminder on a specific date</p>
            <div className="mt-2">
              <AddSetDateReminderControl onAdd={onAddSetDate} label="Add reminder" />
            </div>
          </div>
        ) : null}
        {onOpenSettings ? (
          <Button type="button" variant="outline" className="w-full rounded-full" onClick={onOpenSettings}>
            Default schedule for all payments
          </Button>
        ) : null}
      </div>
      )}
    </Modal>
  );
}

export function ScheduledMessageEditForm({
  message,
  onClose,
  onSaved,
}: {
  message: ScheduledPaymentMessage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useAppUi();
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [daysBeforeDue, setDaysBeforeDue] = useState(
    message.daysBeforeDue != null ? String(message.daysBeforeDue) : "",
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/scheduled-messages/${encodeURIComponent(message.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customSubject: subject,
          customBody: body,
          ...(message.kind === "pre_due" && daysBeforeDue.trim()
            ? { customDaysBeforeDue: Number(daysBeforeDue) }
            : {}),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save.");
      }
      showToast("Scheduled message updated.");
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCancelled = async (cancelled: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/scheduled-messages/${encodeURIComponent(message.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cancelled }),
      });
      if (!res.ok) throw new Error("Could not update.");
      showToast(cancelled ? "Send cancelled." : "Send restored.");
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
        <p className="text-sm text-muted">
          {message.residentName} · {message.chargeTitle} · {message.typeLabel}
        </p>
        {message.kind === "pre_due" ? (
          <div>
            <label className="text-xs font-semibold text-muted">Days before send date</label>
            <Input className="mt-1" value={daysBeforeDue} onChange={(e) => setDaysBeforeDue(e.target.value)} disabled={busy} />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-muted">Subject</label>
          <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted">Message</label>
          <Textarea className="mt-1 min-h-[160px]" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" className="rounded-full" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
          {message.status === "cancelled" ? (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void toggleCancelled(false)} disabled={busy}>
              Restore send
            </Button>
          ) : message.status === "scheduled" ? (
            <Button type="button" variant="outline" className="rounded-full text-rose-700" onClick={() => void toggleCancelled(true)} disabled={busy}>
              Cancel send
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
    </div>
  );
}

export type ScheduleSettingsVariant = "inbox" | "payments";

const SCHEDULE_SETTINGS_COPY: Record<
  ScheduleSettingsVariant,
  {
    savedToast: string;
    title: string;
    description: string;
    daysBeforeLabel: string;
    sameDayLabel: string;
    followUpLabel: string;
    templateLabel: string;
    saveLabel: string;
  }
> = {
  inbox: {
    savedToast: "Schedule settings saved.",
    title: "Schedule settings",
    description: "",
    daysBeforeLabel: "Days before send date",
    sameDayLabel: "Same-day message",
    followUpLabel: "Daily follow-up messages",
    templateLabel: "Default message template",
    saveLabel: "Save schedule settings",
  },
  payments: {
    savedToast: "Reminder schedule saved.",
    title: "Automated reminders",
    description: "",
    daysBeforeLabel: "Days before due",
    sameDayLabel: "Due date",
    followUpLabel: "Daily when overdue",
    templateLabel: "Default pre-due message template",
    saveLabel: "Save",
  },
};

function PaymentAutomationSettingsForm({
  initialSettings,
  onSaved,
  variant = "payments",
  layout = "card",
}: {
  initialSettings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
  variant?: ScheduleSettingsVariant;
  layout?: "card" | "modal";
}) {
  const { showToast } = useAppUi();
  const copy = SCHEDULE_SETTINGS_COPY[variant];
  const [draft, setDraft] = useState(initialSettings);
  const [customDay, setCustomDay] = useState("");
  const [visibilityDaysInput, setVisibilityDaysInput] = useState(String(initialSettings.scheduleVisibilityDays));
  const [busy, setBusy] = useState(false);

  const parseVisibilityDays = (raw: string) =>
    Math.max(0, Math.min(30, Math.round(Number(raw)) || initialSettings.scheduleVisibilityDays));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...draft,
        scheduleVisibilityDays: parseVisibilityDays(visibilityDaysInput),
      };
      const res = await fetch("/api/portal/automation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save settings.");
      }
      const body = (await res.json()) as { settings: ManagerAutomationSettings };
      setDraft(body.settings);
      setVisibilityDaysInput(String(body.settings.scheduleVisibilityDays));
      onSaved(body.settings);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PAYMENT_AUTOMATION_SETTINGS_EVENT));
      }
      showToast(copy.savedToast);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (day: number) => {
    setDraft((prev) => {
      const has = prev.preDueReminderDays.includes(day);
      const nextDays = has ? prev.preDueReminderDays.filter((d) => d !== day) : [...prev.preDueReminderDays, day].sort((a, b) => b - a);
      return { ...prev, preDueReminderDays: nextDays.length ? nextDays : [3] };
    });
  };

  const addCustomDay = () => {
    const n = Math.round(Number(customDay));
    // A custom offset is "N days before due"; 0 would collide with the "Due
    // date" toggle and is dropped by the projection, so require >= 1.
    if (!customDay.trim() || !Number.isFinite(n) || n < 1 || n > 60) return;
    setDraft((prev) => ({
      ...prev,
      preDueReminderDays: [...new Set([...prev.preDueReminderDays, n])].sort((a, b) => b - a),
    }));
    setCustomDay("");
  };

  const compact = layout === "modal" && variant === "payments";

  return (
    <div className={layout === "card" ? "rounded-2xl border border-border bg-accent/20 p-4 space-y-4" : "space-y-5"}>
      {layout === "card" ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
          {copy.description ? <p className="mt-1 text-xs text-muted">{copy.description}</p> : null}
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold text-muted">{copy.daysBeforeLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...new Set([7, 5, 3, 2, 1, ...draft.preDueReminderDays])]
            .sort((a, b) => b - a)
            .map((day) => (
              <Button
                key={day}
                type="button"
                variant={draft.preDueReminderDays.includes(day) ? "primary" : "outline"}
                className="rounded-full px-3 py-1 text-xs"
                onClick={() => toggleDay(day)}
                disabled={busy}
              >
                {day}d
              </Button>
            ))}
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-16 text-xs"
              inputMode="numeric"
              placeholder="Day"
              value={customDay}
              onChange={(e) => setCustomDay(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomDay();
                }
              }}
              disabled={busy}
            />
            <Button type="button" variant="outline" className="rounded-full px-2 py-1 text-xs" onClick={addCustomDay} disabled={busy}>
              Add day
            </Button>
          </div>
        </div>
      </div>

      {variant === "payments" ? (
        <div>
          <p className="text-xs font-semibold text-muted">Send on specific dates</p>
          <p className="mt-0.5 text-[11px] text-muted">One-off reminders sent to every pending charge on the chosen date.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {draft.setDateReminders.map((iso) => (
              <span
                key={iso}
                className="inline-flex items-center overflow-hidden rounded-full border border-primary/20 bg-primary/5 text-[11px] leading-none text-foreground"
              >
                <span className="px-2 py-1 font-medium">{formatIsoDateLabel(iso)}</span>
                <button
                  type="button"
                  className="border-l border-border px-1.5 py-1 text-muted hover:bg-accent/50 hover:text-foreground"
                  aria-label={`Remove ${formatIsoDateLabel(iso)} reminder`}
                  disabled={busy}
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, setDateReminders: prev.setDateReminders.filter((d) => d !== iso) }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <AddSetDateReminderControl
              disabled={busy}
              onAdd={(iso) =>
                setDraft((prev) => ({
                  ...prev,
                  setDateReminders: [...new Set([...prev.setDateReminders, iso])].sort(),
                }))
              }
            />
          </div>
        </div>
      ) : null}

      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
        <label
          className={`flex items-center gap-2 text-sm ${compact ? "rounded-full border border-border bg-card px-3 py-2" : ""}`}
        >
          <input type="checkbox" checked={draft.sameDayReminderEnabled} onChange={(e) => setDraft({ ...draft, sameDayReminderEnabled: e.target.checked })} disabled={busy} />
          {copy.sameDayLabel}
        </label>
        <label
          className={`flex items-center gap-2 text-sm ${compact ? "rounded-full border border-border bg-card px-3 py-2" : ""}`}
        >
          <input type="checkbox" checked={draft.overdueDailyEnabled} onChange={(e) => setDraft({ ...draft, overdueDailyEnabled: e.target.checked })} disabled={busy} />
          {copy.followUpLabel}
        </label>
        {!compact ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={draft.lateFeeNoticeEnabled} onChange={(e) => setDraft({ ...draft, lateFeeNoticeEnabled: e.target.checked })} disabled={busy} />
            Late fee notices
          </label>
        ) : null}
      </div>

      {!compact && draft.overdueDailyEnabled ? (
        <label className="block text-xs font-semibold text-muted">
          Start daily overdue reminders after
          <div className="mt-1 flex items-center gap-2">
            <Input
              className="h-8 w-16 text-xs"
              inputMode="numeric"
              value={String(draft.overdueDailyStartDays)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  overdueDailyStartDays: Math.max(1, Math.min(30, Math.round(Number(e.target.value)) || 1)),
                })
              }
              disabled={busy}
            />
            <span className="text-sm font-normal text-foreground">day(s) past due</span>
          </div>
        </label>
      ) : null}

      {variant === "inbox" ? (
      <div>
        <p className="text-xs font-semibold text-muted">Inbox schedule visibility</p>
        <p className="mt-0.5 text-[11px] text-muted">
          Controls which automated reminders appear in Inbox → Schedule and the tab count.
        </p>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="schedule-visibility"
              checked={draft.scheduleVisibilityMode === "all"}
              onChange={() => setDraft({ ...draft, scheduleVisibilityMode: "all" })}
              disabled={busy}
            />
            Show all upcoming scheduled messages
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="schedule-visibility"
              checked={draft.scheduleVisibilityMode === "days_before_send"}
              onChange={() => setDraft({ ...draft, scheduleVisibilityMode: "days_before_send" })}
              disabled={busy}
            />
            Show only
          </label>
          <div className="flex flex-wrap items-center gap-1 pl-6 text-sm">
            <Input
              className="h-8 w-14 text-xs"
              inputMode="numeric"
              value={visibilityDaysInput}
              onChange={(e) => setVisibilityDaysInput(e.target.value)}
              disabled={busy || draft.scheduleVisibilityMode !== "days_before_send"}
            />
            <span>days before send date</span>
          </div>
        </div>
      </div>
      ) : null}

      {variant === "inbox" ? (
      <div>
        <p className="text-xs font-semibold text-muted">{copy.templateLabel}</p>
        <Input
          className="mt-1"
          value={draft.templates.preDue.subject}
          onChange={(e) =>
            setDraft({
              ...draft,
              templates: { ...draft.templates, preDue: { ...draft.templates.preDue, subject: e.target.value } },
            })
          }
          disabled={busy}
        />
        <Textarea
          className="mt-2 min-h-[100px]"
          value={draft.templates.preDue.body}
          onChange={(e) =>
            setDraft({
              ...draft,
              templates: { ...draft.templates, preDue: { ...draft.templates.preDue, body: e.target.value } },
            })
          }
          disabled={busy}
        />
        <p className="mt-1 text-[11px] text-muted">
          Placeholders: {"{residentName}"}, {"{chargeTitle}"}, {"{balanceDue}"}, {"{dueDate}"}, {"{daysUntilDue}"}, {"{propertyLine}"}, {"{managerName}"}
        </p>
      </div>
      ) : null}

      <Button type="button" variant="primary" className="rounded-full" onClick={() => void save()} disabled={busy}>
        {copy.saveLabel}
      </Button>
    </div>
  );
}

export function PaymentAutomationSettingsPanel({
  settings,
  onSaved,
  variant = "payments",
  layout = "card",
}: {
  settings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
  variant?: ScheduleSettingsVariant;
  layout?: "card" | "modal";
}) {
  return (
    <PaymentAutomationSettingsForm
      key={`${variant}:${layout}:${JSON.stringify(settings)}`}
      initialSettings={settings}
      onSaved={onSaved}
      variant={variant}
      layout={layout}
    />
  );
}

export async function patchScheduledMessage(
  messageId: string,
  patch: {
    cancelled?: boolean;
    customSubject?: string;
    customBody?: string;
    customDaysBeforeDue?: number;
  },
): Promise<void> {
  const res = await fetch(`/api/portal/scheduled-messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const payload = (await res.json()) as { error?: string };
    throw new Error(payload.error ?? "Could not update reminder.");
  }
}

export function ReminderSettingsModal({
  open,
  onClose,
  settings,
  onSaved,
  variant = "payments",
}: {
  open: boolean;
  onClose: () => void;
  settings: ManagerAutomationSettings | null;
  onSaved: (next: ManagerAutomationSettings) => void;
  variant?: ScheduleSettingsVariant;
}) {
  if (!settings) return null;

  return (
    <Modal open={open} onClose={onClose} title={variant === "inbox" ? "Schedule settings" : "Auto reminders"}>
      {settings ? (
        <PaymentAutomationSettingsPanel
          settings={settings}
          variant={variant}
          layout={variant === "payments" ? "modal" : "card"}
          onSaved={(next) => {
            onSaved(next);
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}

export function useScheduledPaymentMessages(opts?: { includeHidden?: boolean }) {
  const applyVisibilityFilter = !(opts?.includeHidden ?? false);
  const query = "?includeHidden=1";
  const [settings, setSettings] = useState<ManagerAutomationSettings | null>(null);
  const [rawMessages, setRawMessages] = useState<ScheduledPaymentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [chargeRevision, setChargeRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);

  const reload = useCallback(async () => {
    if (isDemoModeActive()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/scheduled-messages${query}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { settings: ManagerAutomationSettings; messages: ScheduledPaymentMessage[] };
      setSettings(body.settings);
      setRawMessages(body.messages);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const onChargesChanged = () => setChargeRevision((n) => n + 1);
    const onSettingsChanged = () => setSettingsRevision((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, onChargesChanged);
    window.addEventListener(PAYMENT_AUTOMATION_SETTINGS_EVENT, onSettingsChanged);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, onChargesChanged);
      window.removeEventListener(PAYMENT_AUTOMATION_SETTINGS_EVENT, onSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (isDemoModeActive()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/portal/scheduled-messages${query}`, { credentials: "include", cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { settings: ManagerAutomationSettings; messages: ScheduledPaymentMessage[] };
        setSettings(body.settings);
        setRawMessages(body.messages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [chargeRevision, settingsRevision, reload]);

  const messages = useMemo(() => {
    void chargeRevision;
    void settingsRevision;
    let list = filterScheduledPaymentMessagesForUnpaidCharges(rawMessages, readHouseholdCharges());
    if (applyVisibilityFilter && settings) {
      list = filterScheduledPaymentMessagesForVisibility(list, settings);
    }
    return list;
  }, [rawMessages, chargeRevision, settingsRevision, settings, applyVisibilityFilter]);

  return { settings, messages, loading, reload, setSettings };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerAutomationSettings } from "@/lib/payment-automation-settings";
import {
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  formatStandardReminderSchedule,
  PAYMENT_AUTOMATION_SETTINGS_EVENT,
} from "@/lib/payment-automation-settings";
import {
  HOUSEHOLD_CHARGES_EVENT,
  isUnpaidHouseholdCharge,
  parseMoneyAmount,
  readHouseholdCharges,
} from "@/lib/household-charges";
import { readPortalApiError } from "@/lib/portal-api-error";
import { encodeScheduledMessagePathId } from "@/lib/scheduled-message-path-id";
import {
  applyReminderPreset,
  buildReminderPreviewLines,
  detectReminderPreset,
  formatFriendlyReminderSchedule,
  PAYMENT_REMINDER_PRESETS,
  type ReminderPresetId,
} from "@/lib/payment-reminder-presets";
import {
  filterScheduledPaymentMessagesForUnpaidCharges,
  filterScheduledPaymentMessagesForVisibility,
  formatScheduledSendAt,
  manageableRemindersForCharge,
  projectScheduledPaymentMessages,
  scheduledReminderShortLabel,
  type ScheduledPaymentMessage,
} from "@/lib/scheduled-payment-messages";

export { formatFriendlyReminderSchedule };

/** Short ledger label for per-charge automated reminders. */
export function summarizeChargeReminders(messages: ScheduledPaymentMessage[]): string {
  if (!messages.length) return "";
  const active = messages.filter((message) => message.status !== "cancelled");
  if (!active.length) return "Reminders paused";
  if (active.length === 1) {
    const next = active[0]!;
    return `Next: ${scheduledReminderShortLabel(next.kind, next.daysBeforeDue)}`;
  }
  return `${active.length} reminders scheduled`;
}

function mergeLocalChargeReminders(
  serverMessages: ScheduledPaymentMessage[],
  settings: ManagerAutomationSettings,
  includeHidden: boolean,
): ScheduledPaymentMessage[] {
  const serverChargeIds = new Set(serverMessages.map((message) => message.chargeId));
  const localOnly = readHouseholdCharges().filter(
    (charge) => isUnpaidHouseholdCharge(charge) && !serverChargeIds.has(charge.id) && charge.managerUserId,
  );
  if (!localOnly.length) return serverMessages;

  const byManager = new Map<string, typeof localOnly>();
  for (const charge of localOnly) {
    const managerUserId = charge.managerUserId!.trim();
    const list = byManager.get(managerUserId) ?? [];
    list.push(charge);
    byManager.set(managerUserId, list);
  }

  const merged = [...serverMessages];
  for (const [managerUserId, charges] of byManager) {
    merged.push(
      ...projectScheduledPaymentMessages({
        managerUserId,
        charges,
        settings,
        includeHidden,
      }),
    );
  }
  return merged.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

function formatSendDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One-line summary for automation settings buttons. */
export function formatAutomationScheduleSummary(settings: ManagerAutomationSettings): string {
  return formatStandardReminderSchedule(settings);
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
    <ul className="mt-1.5 space-y-1">
      {messages.map((m) => {
        const cancelled = m.status === "cancelled";
        const label = scheduledReminderShortLabel(m.kind, m.daysBeforeDue);
        return (
          <li
            key={m.id}
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              cancelled ? "border-border bg-accent/15 text-muted" : "border-border bg-card text-foreground"
            }`}
          >
            <button
              type="button"
              className={`min-w-0 flex-1 text-left ${cancelled ? "line-through" : ""}`}
              title={`Edit · sends ${formatSendDate(m.sendAt)}`}
              onClick={() => onEdit?.(m)}
            >
              <span className="font-medium">{label}</span>
              <span className="ml-1 text-muted">· {formatSendDate(m.sendAt)}</span>
            </button>
            {onToggleCancel ? (
              <button
                type="button"
                className="shrink-0 rounded-full px-2 py-0.5 font-semibold text-muted hover:bg-accent/50 hover:text-foreground"
                onClick={() => void onToggleCancel(m, !cancelled)}
              >
                {cancelled ? "Turn on" : "Turn off"}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ChargeRemindersModal({
  open,
  onClose,
  residentName,
  chargeTitle,
  dueDate,
  messages,
  scheduleSummary,
  onMessageSaved,
  onToggleCancel,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  residentName: string;
  chargeTitle: string;
  dueDate: string;
  messages: ScheduledPaymentMessage[];
  /** Default schedule label shown above the per-charge timeline. */
  scheduleSummary?: string;
  onMessageSaved?: () => void;
  onToggleCancel: (message: ScheduledPaymentMessage, cancelled: boolean) => void | Promise<void>;
  onOpenSettings?: () => void;
  onAddSetDate?: (isoDate: string) => void | Promise<void>;
}) {
  const [editingMessage, setEditingMessage] = useState<ScheduledPaymentMessage | null>(null);
  const manageable = messages.filter((m) => m.status === "scheduled" || m.status === "cancelled");

  return (
    <Modal open={open} onClose={onClose} title="Payment reminders" dense panelClassName="max-w-lg p-3 sm:p-4">
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
        <div className="rounded-xl border border-border bg-accent/20 px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">{chargeTitle}</p>
          <p className="mt-0.5 text-xs text-muted">
            {residentName} · due {dueDate}
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground">Default schedule</p>
          <p className="mt-1 text-sm text-foreground">{scheduleSummary ?? "Standard"}</p>
          <p className="mt-1.5 text-xs text-muted">
            Turn individual sends off below without changing your default. Reminders stop when this charge is marked paid.
          </p>
        </div>
        {manageable.length === 0 ? (
          <p className="text-sm text-muted">No upcoming reminders for this charge.</p>
        ) : (
          <ul className="space-y-2">
            {manageable.map((m) => {
              const cancelled = m.status === "cancelled";
              const label = scheduledReminderShortLabel(m.kind, m.daysBeforeDue);
              return (
                <li
                  key={m.id}
                  className={`rounded-xl border px-3 py-2.5 ${
                    cancelled ? "border-border bg-accent/15" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 text-left ${cancelled ? "line-through opacity-70" : ""}`}
                      onClick={() => setEditingMessage(m)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            cancelled
                              ? "bg-accent/40 text-muted"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {cancelled ? "Off" : "Scheduled"}
                        </span>
                      </div>
                      <span className="mt-1 block text-xs text-muted">Sends {formatSendDate(m.sendAt)}</span>
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 shrink-0 rounded-full px-3 text-xs"
                      onClick={() => void onToggleCancel(m, !cancelled)}
                    >
                      {cancelled ? "Turn on" : "Turn off"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {onOpenSettings ? (
          <Button type="button" variant="outline" className="h-9 w-full rounded-full text-sm" onClick={onOpenSettings}>
            Change default schedule for all payments
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
  onSendNow,
}: {
  message: ScheduledPaymentMessage;
  onClose: () => void;
  onSaved: () => void;
  onSendNow?: () => void | Promise<void>;
}) {
  const { showToast } = useAppUi();
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [sendAtLocal, setSendAtLocal] = useState(toLocalInputValue(message.sendAt));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const sendAt = new Date(sendAtLocal);
    if (Number.isNaN(sendAt.getTime())) {
      showToast("Choose a valid send date and time.");
      return;
    }
    setBusy(true);
    try {
      const pathId = encodeScheduledMessagePathId(message.id);
      const res = await fetch(`/api/portal/scheduled-messages/${pathId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customSubject: subject,
          customBody: body,
          customSendAt: sendAt.toISOString(),
        }),
      });
      if (!res.ok) {
        throw new Error(await readPortalApiError(res, "Could not save."));
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
      const pathId = encodeScheduledMessagePathId(message.id);
      const res = await fetch(`/api/portal/scheduled-messages/${pathId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cancelled }),
      });
      if (!res.ok) throw new Error(await readPortalApiError(res, "Could not update."));
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
          {message.residentName} · {message.chargeTitle} · sends {formatScheduledSendAt(message.sendAt)}
        </p>
        <div>
          <label className="text-xs font-semibold text-muted">Send date &amp; time</label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={sendAtLocal}
            onChange={(e) => setSendAtLocal(e.target.value)}
            disabled={busy}
          />
        </div>
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
          {message.status === "scheduled" && onSendNow ? (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void onSendNow()} disabled={busy}>
              Send now
            </Button>
          ) : null}
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
    followUpLabel: "Every day late",
    templateLabel: "Default pre-due message template",
    saveLabel: "Save",
  },
};

const REMINDER_DAY_PILL =
  "inline-flex shrink-0 items-center rounded-full min-h-8 px-3 py-1 text-xs font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50";
const REMINDER_DAY_PILL_ACTIVE = "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]";
const REMINDER_DAY_PILL_INACTIVE =
  "border border-border bg-card/80 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-primary/30 hover:bg-card [html[data-theme=dark]_&]:portal-outline-control";

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
  const [selectedPreset, setSelectedPreset] = useState<ReminderPresetId>(() => detectReminderPreset(initialSettings));
  const [customDay, setCustomDay] = useState("");
  const [visibilityDaysInput, setVisibilityDaysInput] = useState(String(initialSettings.scheduleVisibilityDays));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(initialSettings);
    setSelectedPreset(detectReminderPreset(initialSettings));
  }, [initialSettings]);

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
      setSelectedPreset(detectReminderPreset(body.settings));
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
    setSelectedPreset("custom");
    setDraft((prev) => {
      const has = prev.preDueReminderDays.includes(day);
      const nextDays = has ? prev.preDueReminderDays.filter((d) => d !== day) : [...prev.preDueReminderDays, day].sort((a, b) => b - a);
      return { ...prev, preDueReminderDays: nextDays };
    });
  };

  const addCustomDay = () => {
    const n = Math.round(Number(customDay));
    // A custom offset is "N days before due"; 0 would collide with the "Due
    // date" toggle and is dropped by the projection, so require >= 1.
    if (!customDay.trim() || !Number.isFinite(n) || n < 1 || n > 60) return;
    setSelectedPreset("custom");
    setDraft((prev) => ({
      ...prev,
      preDueReminderDays: [...new Set([...prev.preDueReminderDays, n])].sort((a, b) => b - a),
    }));
    setCustomDay("");
  };

  const compact = layout === "modal" && variant === "payments";
  const activePreset = selectedPreset;
  const previewLines = buildReminderPreviewLines(draft);

  const selectPreset = (presetId: ReminderPresetId) => {
    // #region agent log
    fetch("http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "81cbea" },
      body: JSON.stringify({
        sessionId: "81cbea",
        location: "payment-schedule-ui.tsx:selectPreset",
        message: "reminder preset selected",
        data: { presetId },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion
    setSelectedPreset(presetId);
    if (presetId !== "custom") {
      setDraft((prev) => applyReminderPreset(prev, presetId));
    }
  };

  const presetCardClass = (selected: boolean) =>
    `rounded-xl border px-3 py-2.5 text-left transition-colors ${
      selected
        ? "border-primary bg-primary/5 shadow-[var(--shadow-sm)]"
        : "border-border bg-card hover:border-primary/30"
    }`;

  return (
    <div className={layout === "card" ? "rounded-2xl border border-border bg-accent/20 p-4 space-y-4" : "space-y-4"}>
      {layout === "card" ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
          {copy.description ? <p className="mt-1 text-xs text-muted">{copy.description}</p> : null}
        </div>
      ) : compact ? (
        <p className="text-sm text-muted">
          Choose how residents are reminded about unpaid charges. You can still turn off individual sends per payment.
        </p>
      ) : null}

      {compact ? (
        <>
          <div>
            <p className="text-xs font-semibold text-muted">Reminder schedule</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PAYMENT_REMINDER_PRESETS.map((preset) => {
                const selected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={presetCardClass(selected)}
                    onClick={() => selectPreset(preset.id)}
                    disabled={busy}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                      {preset.recommended ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{preset.description}</p>
                  </button>
                );
              })}
              <button
                type="button"
                className={presetCardClass(activePreset === "custom")}
                onClick={() => selectPreset("custom")}
                disabled={busy}
              >
                <span className="text-sm font-semibold text-foreground">Custom</span>
                <p className="mt-1 text-xs leading-relaxed text-muted">Pick your own days and follow-up rules below.</p>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">What residents will receive</p>
            <ul className="mt-2 space-y-1">
              {previewLines.map((line) => (
                <li key={line} className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {activePreset === "custom" ? (
            <div className="space-y-3 rounded-xl border border-border bg-accent/15 p-3">
              <p className="text-xs font-semibold text-foreground">Customize timing</p>
              <div>
                <p className="text-xs font-semibold text-muted">{copy.daysBeforeLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[7, 5, 3, 2, 1, ...draft.preDueReminderDays]
                    .filter((d, i, arr) => arr.indexOf(d) === i)
                    .sort((a, b) => b - a)
                    .map((day) => {
                      const active = draft.preDueReminderDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`${REMINDER_DAY_PILL} ${active ? REMINDER_DAY_PILL_ACTIVE : REMINDER_DAY_PILL_INACTIVE}`}
                          onClick={() => toggleDay(day)}
                          disabled={busy}
                        >
                          {day} day{day === 1 ? "" : "s"} before
                        </button>
                      );
                    })}
                  <div className="flex flex-wrap items-center gap-1">
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
                    <button
                      type="button"
                      className={`${REMINDER_DAY_PILL} ${REMINDER_DAY_PILL_INACTIVE} px-2`}
                      onClick={addCustomDay}
                      disabled={busy}
                    >
                      Add day
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.sameDayReminderEnabled}
                    onChange={(e) => {
                      setSelectedPreset("custom");
                      setDraft({ ...draft, sameDayReminderEnabled: e.target.checked });
                    }}
                    disabled={busy}
                  />
                  {copy.sameDayLabel}
                </label>
                <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.overdueDailyEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setSelectedPreset("custom");
                      setDraft((prev) => ({
                        ...prev,
                        overdueDailyEnabled: enabled,
                        ...(enabled ? { overdueDailyStartDays: Math.min(prev.overdueDailyStartDays, 1) || 1 } : null),
                        postDueReminderDays: prev.postDueReminderDays.filter((d) => d !== 1),
                      }));
                    }}
                    disabled={busy}
                  />
                  Every day late
                </label>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
      <div>
        <p className="text-xs font-semibold text-muted">{copy.daysBeforeLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[3, 2, 1, ...draft.preDueReminderDays]
            .filter((d, i, arr) => arr.indexOf(d) === i)
            .sort((a, b) => b - a)
            .map((day) => {
              const active = draft.preDueReminderDays.includes(day);
              return (
              <button
                key={day}
                type="button"
                className={`${REMINDER_DAY_PILL} ${active ? REMINDER_DAY_PILL_ACTIVE : REMINDER_DAY_PILL_INACTIVE}`}
                onClick={() => toggleDay(day)}
                disabled={busy}
              >
                {day} day{day === 1 ? "" : "s"} before
              </button>
              );
            })}
          <div className="flex flex-wrap items-center gap-1">
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
            <button
              type="button"
              className={`${REMINDER_DAY_PILL} ${REMINDER_DAY_PILL_INACTIVE} px-2`}
              onClick={addCustomDay}
              disabled={busy}
            >
              Add day
            </button>
          </div>
        </div>
      </div>

      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
        <label
          className={`flex items-center gap-2 text-sm ${compact ? "rounded-full border border-border bg-card px-3 py-2" : ""}`}
        >
          <input type="checkbox" checked={draft.sameDayReminderEnabled} onChange={(e) => setDraft({ ...draft, sameDayReminderEnabled: e.target.checked })} disabled={busy} />
          {copy.sameDayLabel}
        </label>
        {compact ? (
          <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={draft.overdueDailyEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setDraft((prev) => ({
                  ...prev,
                  overdueDailyEnabled: enabled,
                  ...(enabled ? { overdueDailyStartDays: Math.min(prev.overdueDailyStartDays, 1) || 1 } : null),
                  postDueReminderDays: prev.postDueReminderDays.filter((d) => d !== 1),
                }));
              }}
              disabled={busy}
            />
            Every day late
          </label>
        ) : null}
        {!compact ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.overdueDailyEnabled} onChange={(e) => setDraft({ ...draft, overdueDailyEnabled: e.target.checked })} disabled={busy} />
          {copy.followUpLabel}
        </label>
        ) : null}
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

      </>
      )}

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
    cancelledBecausePaid?: boolean;
    customSubject?: string;
    customBody?: string;
    customDaysBeforeDue?: number;
    customSendAt?: string;
  },
): Promise<void> {
  const pathId = encodeScheduledMessagePathId(messageId);
  const res = await fetch(`/api/portal/scheduled-messages/${pathId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(await readPortalApiError(res, "Could not update reminder."));
  }
}

/** Cancel upcoming auto reminders when a charge is marked paid (demo + immediate UI). */
export async function cancelFutureRemindersForPaidCharge(
  chargeId: string,
  messages: ScheduledPaymentMessage[],
): Promise<void> {
  const reminders = manageableRemindersForCharge(messages, chargeId, 50).filter((message) => message.status === "scheduled");
  await Promise.all(
    reminders.map((message) =>
      patchScheduledMessage(message.id, { cancelled: true, cancelledBecausePaid: true }),
    ),
  );
}

/** Restore auto reminders cancelled on paid when a charge moves back to pending. */
export async function restoreFutureRemindersForPendingCharge(chargeId: string): Promise<void> {
  const res = await fetch("/api/portal/scheduled-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "restoreForPending", chargeId }),
  });
  if (!res.ok) {
    throw new Error(await readPortalApiError(res, "Could not restore reminders."));
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
    <Modal open={open} onClose={onClose} title={variant === "inbox" ? "Schedule settings" : "Payment reminders"} dense={variant === "payments"} panelClassName={variant === "payments" ? "max-w-lg p-3 sm:p-4" : undefined}>
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
      const settings = DEFAULT_MANAGER_AUTOMATION_SETTINGS;
      const charges = readHouseholdCharges().filter((c) => c.status !== "paid");
      const messages = projectScheduledPaymentMessages({
        managerUserId: "demo",
        charges,
        settings,
        includeHidden: opts?.includeHidden ?? false,
      });
      setSettings(settings);
      setRawMessages(messages);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/scheduled-messages${query}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { settings: ManagerAutomationSettings; messages: ScheduledPaymentMessage[] };
      setSettings(body.settings);
      setRawMessages(mergeLocalChargeReminders(body.messages, body.settings, opts?.includeHidden ?? false));
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

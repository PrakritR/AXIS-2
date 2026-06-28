"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/lib/scheduled-payment-messages";

function ScheduledMessageEditForm({
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

export function ScheduledMessageEditModal({
  open,
  message,
  onClose,
  onSaved,
}: {
  open: boolean;
  message: ScheduledPaymentMessage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!message) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit scheduled message">
      <ScheduledMessageEditForm key={message.id} message={message} onClose={onClose} onSaved={onSaved} />
    </Modal>
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
    savedToast: "Payment reminder settings saved.",
    title: "Automated payment reminders",
    description: "Choose when reminders are sent for unpaid charges. Residents receive these automatically; you can edit individual messages from the ledger or Inbox → Schedule.",
    daysBeforeLabel: "Remind before due date",
    sameDayLabel: "Due-date reminder (day payment is due)",
    followUpLabel: "Overdue reminder every day",
    templateLabel: "Default pre-due message template",
    saveLabel: "Save reminder schedule",
  },
};

function PaymentAutomationSettingsForm({
  initialSettings,
  onSaved,
  variant = "payments",
}: {
  initialSettings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
  variant?: ScheduleSettingsVariant;
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
    if (!Number.isFinite(n) || n < 0 || n > 60) return;
    setDraft((prev) => ({
      ...prev,
      preDueReminderDays: [...new Set([...prev.preDueReminderDays, n])].sort((a, b) => b - a),
    }));
    setCustomDay("");
  };

  return (
    <div className="rounded-2xl border border-border bg-accent/20 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
        {copy.description ? <p className="mt-1 text-xs text-muted">{copy.description}</p> : null}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">{copy.daysBeforeLabel}</p>
        {variant === "payments" ? (
          <p className="mt-0.5 text-[11px] text-muted">Tap to turn each reminder on or off. Add a custom number of days if needed.</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {[7, 5, 3, 2, 1].map((day) => (
            <Button
              key={day}
              type="button"
              variant={draft.preDueReminderDays.includes(day) ? "primary" : "outline"}
              className="rounded-full px-3 py-1 text-xs"
              onClick={() => toggleDay(day)}
              disabled={busy}
            >
              {day} day{day === 1 ? "" : "s"} before
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input className="h-8 w-16 text-xs" placeholder="N" value={customDay} onChange={(e) => setCustomDay(e.target.value)} disabled={busy} />
            <Button type="button" variant="outline" className="rounded-full px-2 py-1 text-xs" onClick={addCustomDay} disabled={busy}>
              Add day
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.sameDayReminderEnabled} onChange={(e) => setDraft({ ...draft, sameDayReminderEnabled: e.target.checked })} disabled={busy} />
          {copy.sameDayLabel}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.overdueDailyEnabled} onChange={(e) => setDraft({ ...draft, overdueDailyEnabled: e.target.checked })} disabled={busy} />
          {copy.followUpLabel}
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.lateFeeNoticeEnabled} onChange={(e) => setDraft({ ...draft, lateFeeNoticeEnabled: e.target.checked })} disabled={busy} />
          Late fee notices
        </label>
      </div>

      {draft.overdueDailyEnabled ? (
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

      {variant === "payments" ? (
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
}: {
  settings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
  variant?: ScheduleSettingsVariant;
}) {
  return (
    <PaymentAutomationSettingsForm
      key={`${variant}:${JSON.stringify(settings)}`}
      initialSettings={settings}
      onSaved={onSaved}
      variant={variant}
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

  const copy = SCHEDULE_SETTINGS_COPY[variant];

  return (
    <Modal open={open} onClose={onClose} title={variant === "inbox" ? "Schedule settings" : "Payment reminder settings"}>
      {copy.description ? <p className="mb-4 text-sm text-muted">{copy.description}</p> : null}
      <PaymentAutomationSettingsPanel
        settings={settings}
        variant={variant}
        onSaved={(next) => {
          onSaved(next);
          onClose();
        }}
      />
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

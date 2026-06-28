"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerAutomationSettings } from "@/lib/payment-automation-settings";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";

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
      showToast(cancelled ? "Reminder cancelled." : "Reminder restored.");
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
            <label className="text-xs font-semibold text-muted">Days before due</label>
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
    <Modal open={open} onClose={onClose} title="Edit scheduled reminder">
      <ScheduledMessageEditForm key={message.id} message={message} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function PaymentAutomationSettingsForm({
  initialSettings,
  onSaved,
}: {
  initialSettings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
}) {
  const { showToast } = useAppUi();
  const [draft, setDraft] = useState(initialSettings);
  const [customDay, setCustomDay] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/automation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save settings.");
      }
      const body = (await res.json()) as { settings: ManagerAutomationSettings };
      onSaved(body.settings);
      showToast("Reminder settings saved.");
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
        <h3 className="text-sm font-semibold text-foreground">Automation settings</h3>
        <p className="mt-1 text-xs text-muted">Configure when rent and overdue reminders are scheduled and shown in this tab.</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">Remind before due date</p>
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
              {day} day{day === 1 ? "" : "s"}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input className="h-8 w-16 text-xs" placeholder="N" value={customDay} onChange={(e) => setCustomDay(e.target.value)} disabled={busy} />
            <Button type="button" variant="outline" className="rounded-full px-2 py-1 text-xs" onClick={addCustomDay} disabled={busy}>
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.sameDayReminderEnabled} onChange={(e) => setDraft({ ...draft, sameDayReminderEnabled: e.target.checked })} disabled={busy} />
          Same-day reminder
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.overdueDailyEnabled} onChange={(e) => setDraft({ ...draft, overdueDailyEnabled: e.target.checked })} disabled={busy} />
          Daily overdue reminders
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.lateFeeNoticeEnabled} onChange={(e) => setDraft({ ...draft, lateFeeNoticeEnabled: e.target.checked })} disabled={busy} />
          Late fee notices
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">Schedule tab visibility</p>
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
            <Input
              className="mx-1 h-8 w-14 text-xs"
              value={String(draft.scheduleVisibilityDays)}
              onChange={(e) => setDraft({ ...draft, scheduleVisibilityDays: Number(e.target.value) || 2 })}
              disabled={busy || draft.scheduleVisibilityMode !== "days_before_send"}
            />
            days before send
          </label>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">Default pre-due template</p>
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

      <Button type="button" variant="primary" className="rounded-full" onClick={() => void save()} disabled={busy}>
        Save settings
      </Button>
    </div>
  );
}

export function PaymentAutomationSettingsPanel({
  settings,
  onSaved,
}: {
  settings: ManagerAutomationSettings;
  onSaved: (next: ManagerAutomationSettings) => void;
}) {
  return (
    <PaymentAutomationSettingsForm
      key={JSON.stringify(settings)}
      initialSettings={settings}
      onSaved={onSaved}
    />
  );
}

export function useScheduledPaymentMessages() {
  const [settings, setSettings] = useState<ManagerAutomationSettings | null>(null);
  const [messages, setMessages] = useState<ScheduledPaymentMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/scheduled-messages", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { settings: ManagerAutomationSettings; messages: ScheduledPaymentMessage[] };
      setSettings(body.settings);
      setMessages(body.messages);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/scheduled-messages", { credentials: "include", cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { settings: ManagerAutomationSettings; messages: ScheduledPaymentMessage[] };
        setSettings(body.settings);
        setMessages(body.messages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, messages, loading, reload, setSettings };
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  PAYMENT_AUTOMATION_SETTINGS_EVENT,
  type ManagerAutomationSettings,
} from "@/lib/payment-automation-settings";
import { isDemoModeActive } from "@/lib/demo/demo-session";

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

export function TourReminderSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useAppUi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ManagerAutomationSettings>(DEFAULT_MANAGER_AUTOMATION_SETTINGS);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isDemoModeActive()) {
          if (!cancelled) setDraft(DEFAULT_MANAGER_AUTOMATION_SETTINGS);
          return;
        }
        const res = await fetch("/api/portal/automation-settings", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Could not load reminder settings.");
        const body = (await res.json()) as { settings: ManagerAutomationSettings };
        if (!cancelled) setDraft(body.settings);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load reminder settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, showToast]);

  const save = async () => {
    setSaving(true);
    try {
      if (isDemoModeActive()) {
        showToast("Tour reminder defaults saved (demo).");
        onClose();
        return;
      }
      const res = await fetch("/api/portal/automation-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourReminderEnabled: draft.tourReminderEnabled,
          tourReminderMinutesBefore: draft.tourReminderMinutesBefore,
          tourReminderDeliverViaEmail: draft.tourReminderDeliverViaEmail,
          tourReminderDeliverViaSms: draft.tourReminderDeliverViaSms,
          templates: { tourReminder: draft.templates.tourReminder },
        }),
      });
      if (!res.ok) throw new Error("Could not save tour reminder settings.");
      const body = (await res.json()) as { settings: ManagerAutomationSettings };
      setDraft(body.settings);
      window.dispatchEvent(new Event(PAYMENT_AUTOMATION_SETTINGS_EVENT));
      showToast("Tour reminder settings saved.");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save tour reminder settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tour reminders" dense panelClassName="max-w-md p-3 sm:p-4">
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={draft.tourReminderEnabled !== false}
              onChange={(e) => setDraft((prev) => ({ ...prev, tourReminderEnabled: e.target.checked }))}
              data-attr="tour-reminder-enabled"
            />
            Send reminders for confirmed tours
          </label>

          <label className={fieldLabel}>
            Minutes before tour
            <Input
              type="number"
              min={5}
              max={1440}
              className="mt-1.5"
              value={draft.tourReminderMinutesBefore}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  tourReminderMinutesBefore: Math.max(5, Math.min(1440, Number(e.target.value) || 30)),
                }))
              }
              data-attr="tour-reminder-minutes-before"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className={fieldLabel.replace("mb-1.5 ", "")}>Send via</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.tourReminderDeliverViaEmail !== false}
                onChange={(e) => setDraft((prev) => ({ ...prev, tourReminderDeliverViaEmail: e.target.checked }))}
                data-attr="tour-reminder-via-email"
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.tourReminderDeliverViaSms === true}
                onChange={(e) => setDraft((prev) => ({ ...prev, tourReminderDeliverViaSms: e.target.checked }))}
                data-attr="tour-reminder-via-sms"
              />
              SMS (when guest opted in)
            </label>
          </fieldset>

          <label className={fieldLabel}>
            Default subject
            <Input
              className="mt-1.5"
              value={draft.templates.tourReminder.subject}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  templates: { ...prev.templates, tourReminder: { ...prev.templates.tourReminder, subject: e.target.value } },
                }))
              }
              data-attr="tour-reminder-template-subject"
            />
          </label>

          <label className={fieldLabel}>
            Default message
            <Textarea
              className="mt-1.5 min-h-[10rem] font-mono text-xs"
              value={draft.templates.tourReminder.body}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  templates: { ...prev.templates, tourReminder: { ...prev.templates.tourReminder, body: e.target.value } },
                }))
              }
              data-attr="tour-reminder-template-body"
            />
          </label>
          <p className="text-xs text-muted">
            Placeholders: {"{guestName}"}, {"{propertyTitle}"}, {"{tourTime}"}, {"{managerName}"}, {"{instructions}"}
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" disabled={saving} onClick={() => void save()} data-attr="tour-reminder-settings-save">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

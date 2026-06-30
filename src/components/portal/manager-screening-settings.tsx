"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import type { ManagerScreeningSettings, ScreeningMode } from "@/lib/screening/types";

const MODE_OPTIONS: { value: ScreeningMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "manual", label: "Manual per applicant" },
  { value: "auto_on_submit", label: "Auto on submit" },
];

function screeningModeLabel(mode: ScreeningMode): string {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function ManagerScreeningSettingsForm({
  settings,
  onSettingsChange,
}: {
  settings: ManagerScreeningSettings;
  onSettingsChange: (next: ManagerScreeningSettings) => void;
}) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);

  const saveMode = async (mode: ScreeningMode) => {
    setBusy(true);
    try {
      const res = await fetch("/api/screening/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as { error?: string; settings?: ManagerScreeningSettings };
      if (!res.ok) {
        const message = body.error ?? "Could not save screening settings.";
        showToast(
          message.includes("screening_settings")
            ? "Could not save — run the screening database migration (screening_settings on profiles)."
            : message,
        );
        return;
      }
      if (body.settings) onSettingsChange(body.settings);
      showToast("Screening settings saved.");
    } catch {
      showToast("Network error saving screening settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Choose when background checks run for new applications.</p>
      <Select
        value={settings.mode}
        disabled={busy}
        onChange={(event) => void saveMode(event.target.value as ScreeningMode)}
        aria-label="Screening mode"
        className="w-full"
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ManagerScreeningSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<ManagerScreeningSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    // Fetch then set settings asynchronously (after awaits) when the modal opens.
    void (async () => {
      const res = await fetch("/api/screening/settings", { credentials: "include" });
      if (!res.ok) return;
      const body = (await res.json()) as { settings?: ManagerScreeningSettings };
      if (body.settings) setSettings(body.settings);
    })();
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Applicant screening">
      {settings ? (
        <ManagerScreeningSettingsForm settings={settings} onSettingsChange={setSettings} />
      ) : (
        <p className="text-sm text-muted">Loading screening settings…</p>
      )}
    </Modal>
  );
}

/** Compact toolbar trigger — opens screening modal. */
export function ManagerScreeningSettingsButton({ onClick }: { onClick: () => void }) {
  const [mode, setMode] = useState<ScreeningMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/screening/settings", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { settings?: ManagerScreeningSettings };
        if (body.settings) setMode(body.settings.mode);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const shortLabel =
    mode === "auto_on_submit" ? "Screening: Auto" : mode === "manual" ? "Screening: Manual" : mode === "off" ? "Screening: Off" : "Screening";

  return (
    <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={onClick}>
      {shortLabel}
    </Button>
  );
}

/** @deprecated Use ManagerScreeningSettingsButton + ManagerScreeningSettingsModal */
export function ManagerScreeningSettingsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ManagerScreeningSettingsButton onClick={() => setOpen(true)} />
      <ManagerScreeningSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export { screeningModeLabel };

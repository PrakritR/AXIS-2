"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerScreeningSettings, ScreeningMode } from "@/lib/screening/types";

const MODE_OPTIONS: { value: ScreeningMode; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "Screening is off." },
  { value: "manual", label: "Manual per applicant", description: "You run screening when you open an application." },
  { value: "auto_on_submit", label: "Auto on submit", description: "Screen each new application automatically (billed per report)." },
];

export function ManagerScreeningSettingsPanel() {
  const { showToast } = useAppUi();
  const [settings, setSettings] = useState<ManagerScreeningSettings | null>(null);
  const [configured, setConfigured] = useState(false);
  const [costCents, setCostCents] = useState(3999);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/screening/settings", { credentials: "include" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      settings?: ManagerScreeningSettings;
      configured?: boolean;
      costCents?: number;
    };
    if (body.settings) setSettings(body.settings);
    setConfigured(Boolean(body.configured));
    if (typeof body.costCents === "number") setCostCents(body.costCents);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => void load());
  }, [load]);

  const saveMode = async (mode: ScreeningMode) => {
    setBusy(true);
    try {
      const res = await fetch("/api/screening/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as { error?: string; settings?: ManagerScreeningSettings; configured?: boolean };
      if (!res.ok) {
        const message = body.error ?? "Could not save screening settings.";
        showToast(
          message.includes("screening_settings")
            ? "Could not save — run the screening database migration (screening_settings on profiles)."
            : message,
        );
        return;
      }
      if (body.settings) setSettings(body.settings);
      const certnReady = Boolean(body.configured ?? configured);
      setConfigured(certnReady);
      showToast("Screening settings saved.");
    } catch {
      showToast("Network error saving screening settings.");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return null;

  const active = MODE_OPTIONS.find((option) => option.value === settings.mode) ?? MODE_OPTIONS[1]!;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Applicant screening</p>
          <p className="mt-1 text-sm text-muted">{active.description}</p>
        </div>
        <div className="min-w-[14rem]">
          <Select
            value={settings.mode}
            disabled={busy}
            onChange={(event) => void saveMode(event.target.value as ScreeningMode)}
            aria-label="Screening mode"
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {configured ? (
        <p className="mt-3 text-xs text-muted">
          {`Pay-as-you-go via Certn — about $${(costCents / 100).toFixed(2)} per applicant report, charged to your plan card.`}
        </p>
      ) : null}
    </div>
  );
}

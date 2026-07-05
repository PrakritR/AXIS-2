"use client";

import { Input, Select } from "@/components/ui/input";
import {
  PREFERRED_ARRIVAL_CUSTOM,
  PREFERRED_ARRIVAL_PRESETS,
} from "@/lib/preferred-arrival";

export function PreferredArrivalField({
  preset,
  custom,
  onPresetChange,
  onCustomChange,
}: {
  preset: string;
  custom: string;
  onPresetChange: (value: string) => void;
  onCustomChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="mb-1 text-[11px] font-medium text-muted">Preferred arrival time</p>
      <Select value={preset} onChange={(e) => onPresetChange(e.target.value)} className="bg-card">
        {PREFERRED_ARRIVAL_PRESETS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={PREFERRED_ARRIVAL_CUSTOM}>{PREFERRED_ARRIVAL_CUSTOM}</option>
      </Select>
      {preset === PREFERRED_ARRIVAL_CUSTOM ? (
        <Input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Enter your preferred time"
          className="bg-card"
        />
      ) : null}
    </div>
  );
}

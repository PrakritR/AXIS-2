export const PREFERRED_ARRIVAL_PRESETS = [
  "Anytime",
  "Weekday mornings",
  "Weekday afternoons",
  "After 5pm weekdays",
  "Weekends only",
] as const;

export const PREFERRED_ARRIVAL_CUSTOM = "Custom";

export type PreferredArrivalPreset = (typeof PREFERRED_ARRIVAL_PRESETS)[number] | typeof PREFERRED_ARRIVAL_CUSTOM;

const PRESET_SET = new Set<string>(PREFERRED_ARRIVAL_PRESETS);

export function parsePreferredArrival(stored?: string | null): { preset: PreferredArrivalPreset; custom: string } {
  const value = stored?.trim() || "Anytime";
  if (PRESET_SET.has(value)) {
    return { preset: value as PreferredArrivalPreset, custom: "" };
  }
  return { preset: PREFERRED_ARRIVAL_CUSTOM, custom: value };
}

export function formatPreferredArrival(preset: string, custom: string): string {
  if (preset === PREFERRED_ARRIVAL_CUSTOM) {
    return custom.trim() || "Anytime";
  }
  return preset.trim() || "Anytime";
}

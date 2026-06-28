import type { ManagerScreeningSettings, ScreeningMode } from "@/lib/screening/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SETTINGS: ManagerScreeningSettings = { mode: "manual" };

function normalizeMode(value: unknown): ScreeningMode {
  if (value === "off" || value === "auto_on_submit" || value === "manual") return value;
  return "manual";
}

export function parseManagerScreeningSettings(raw: unknown): ManagerScreeningSettings {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { mode: normalizeMode(row.mode) };
}

export async function getManagerScreeningSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerScreeningSettings> {
  const { data, error } = await db
    .from("profiles")
    .select("screening_settings")
    .eq("id", managerUserId)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return parseManagerScreeningSettings(data.screening_settings);
}

export async function updateManagerScreeningSettings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerScreeningSettings,
): Promise<ManagerScreeningSettings> {
  const next = { mode: normalizeMode(settings.mode) };
  const { error } = await db.from("profiles").update({ screening_settings: next }).eq("id", managerUserId);
  if (error) throw new Error(error.message);
  return next;
}

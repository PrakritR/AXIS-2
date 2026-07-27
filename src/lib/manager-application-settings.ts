import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Manager-global application settings — currently just the application fee the
 * manager charges applicants, set ONCE for the whole account instead of per
 * listing (captain decision, 2026-07: "manager sets cost of application in
 * application rather than in the property listing").
 *
 * Source-of-truth model (see `docs/agents/resident-payments.md`):
 * - `applicationFeeCents` is the authoritative fee for EVERY one of the
 *   manager's listings once the manager has saved it (non-null).
 * - Until the manager saves a value it is `null`, and the fee resolver falls
 *   back to each listing's stored `applicationFee` (grandfathered) so nothing a
 *   live listing already charges changes silently on deploy.
 * - New listings no longer carry their own fee field, so they always resolve to
 *   this manager-level value (or the $50 legacy default when still unset).
 *
 * `0` is a MEANINGFUL saved value ("applications are free for my properties"),
 * distinct from `null` ("not configured — use the listing/legacy fallback").
 *
 * Stored on `manager_automation_settings.row_data.applicationSettings` — the
 * `row_data` JSON column that table always has — so this needs NO schema
 * migration and cannot break on a production project whose columns lag dev.
 */
export type ManagerApplicationSettings = {
  /** Whole-account application fee in cents. `null` = not configured. */
  applicationFeeCents: number | null;
};

export const DEFAULT_MANAGER_APPLICATION_SETTINGS: ManagerApplicationSettings = {
  applicationFeeCents: null,
};

/** Legacy per-listing fallback used when no manager-level value and no listing value exists. */
export const LEGACY_DEFAULT_APPLICATION_FEE_CENTS = 5000;

export const MANAGER_APPLICATION_SETTINGS_EVENT = "axis:manager-application-settings";

const ROW_DATA_KEY = "applicationSettings";

export function normalizeManagerApplicationSettings(raw: unknown): ManagerApplicationSettings {
  const row = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const rawFee = row.applicationFeeCents;
  if (typeof rawFee !== "number" || !Number.isFinite(rawFee)) {
    return { applicationFeeCents: null };
  }
  // Clamp to a sane range: a non-negative whole number of cents, capped at
  // $1,000 so a fat-fingered value can never propose an absurd charge.
  const cents = Math.round(rawFee);
  if (cents < 0) return { applicationFeeCents: 0 };
  if (cents > 100_000) return { applicationFeeCents: 100_000 };
  return { applicationFeeCents: cents };
}

/**
 * The effective application fee (cents) for one listing, applying the
 * source-of-truth priority: a configured manager-level value wins for every
 * listing; otherwise the listing's own grandfathered value; otherwise the
 * legacy $50 default. Pure — safe to use on client and server.
 */
export function effectiveApplicationFeeCents(input: {
  managerFeeCents: number | null;
  listingFeeCents: number;
}): number {
  if (input.managerFeeCents !== null) return input.managerFeeCents;
  if (input.listingFeeCents > 0) return input.listingFeeCents;
  return LEGACY_DEFAULT_APPLICATION_FEE_CENTS;
}

export async function loadManagerApplicationSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerApplicationSettings> {
  const { data, error } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  if (error) throw error;
  return normalizeManagerApplicationSettings(
    (data?.row_data as Record<string, unknown> | null)?.[ROW_DATA_KEY],
  );
}

export async function saveManagerApplicationSettings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerApplicationSettings,
): Promise<ManagerApplicationSettings> {
  const normalized = normalizeManagerApplicationSettings(settings);
  const { data: existing } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  const rowData =
    existing?.row_data && typeof existing.row_data === "object" && !Array.isArray(existing.row_data)
      ? { ...(existing.row_data as Record<string, unknown>) }
      : {};
  rowData[ROW_DATA_KEY] = normalized;
  const { error } = await db.from("manager_automation_settings").upsert(
    {
      manager_user_id: managerUserId,
      row_data: rowData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "manager_user_id" },
  );
  if (error) throw error;
  return normalized;
}

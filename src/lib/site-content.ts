import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition } from "@/data/manager-plan-tiers";
import {
  BATHROOM_EXTRA_AMENITY_PRESETS,
  DISALLOWED_BATHROOM_AMENITY_LABELS,
  DISALLOWED_ROOM_AMENITY_LABELS,
  HOUSE_WIDE_AMENITY_PRESETS,
  ROOM_AMENITY_PRESETS,
  ROOM_AVAILABILITY_OPTIONS,
  ROOM_FURNISHING_OPTIONS,
  SHARED_SPACE_AMENITY_PRESETS,
} from "@/data/manager-listing-presets";

type SiteConfigRecord = {
  config_key: string;
  row_data: unknown;
};

type SiteContentResponse = {
  config?: SiteConfigRecord[];
};

export type ListingPresetConfig = {
  houseWide: { id: string; label: string }[];
  sharedSpace: { id: string; label: string }[];
  bathroom: { id: string; label: string }[];
  room: { id: string; label: string }[];
  availability: readonly string[];
  furnishing: readonly { value: string; label: string }[];
};

function isPlanTierDefinition(row: unknown): row is ManagerPlanTierDefinition {
  if (!row || typeof row !== "object") return false;
  const r = row as Partial<ManagerPlanTierDefinition>;
  return (
    (r.id === "free" || r.id === "pro" || r.id === "business") &&
    typeof r.label === "string" &&
    !!r.monthly &&
    !!r.annual &&
    Array.isArray(r.features)
  );
}

function optionRows(value: unknown): { id: string; label: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((row) => {
      if (typeof row === "string") {
        return { id: row.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label: row };
      }
      if (
        row &&
        typeof row === "object" &&
        typeof (row as { label?: unknown }).label === "string" &&
        typeof ((row as { id?: unknown }).id ?? (row as { value?: unknown }).value) === "string"
      ) {
        return {
          id: String((row as { id?: unknown; value?: unknown }).id ?? (row as { value?: unknown }).value),
          label: String((row as { label?: unknown }).label),
        };
      }
      return null;
    })
    .filter((row): row is { id: string; label: string } => Boolean(row));
}

function selectRows(value: unknown): { value: string; label: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((row) => {
      if (typeof row === "string") return { value: row, label: row };
      if (
        row &&
        typeof row === "object" &&
        typeof (row as { label?: unknown }).label === "string" &&
        typeof ((row as { value?: unknown }).value ?? (row as { id?: unknown }).id) === "string"
      ) {
        return {
          value: String((row as { value?: unknown; id?: unknown }).value ?? (row as { id?: unknown }).id),
          label: String((row as { label?: unknown }).label),
        };
      }
      return null;
    })
    .filter((row): row is { value: string; label: string } => Boolean(row));
}

async function loadSiteContent(): Promise<SiteContentResponse> {
  const res = await fetch("/api/site-content", { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load site content.");
  return (await res.json()) as SiteContentResponse;
}

function configByKey(body: SiteContentResponse, key: string): unknown {
  return body.config?.find((record) => record.config_key === key)?.row_data;
}

export async function loadManagerPlanTiers(): Promise<ManagerPlanTierDefinition[]> {
  const body = await loadSiteContent();
  const raw = configByKey(body, "manager.plan.tiers");
  const tiers = raw && typeof raw === "object" ? (raw as { tiers?: unknown }).tiers : null;
  return Array.isArray(tiers) && tiers.every(isPlanTierDefinition) ? tiers : MANAGER_PLAN_TIERS;
}

export async function loadListingPresetConfig(): Promise<ListingPresetConfig> {
  const body = await loadSiteContent();
  const raw = configByKey(body, "listing.form.presets");
  const groups = raw && typeof raw === "object" ? (raw as { amenityGroups?: Record<string, unknown> }).amenityGroups : null;
  const roomRows = optionRows(groups?.room)?.filter((row) => !DISALLOWED_ROOM_AMENITY_LABELS.has(row.label));
  const bathroomRows = optionRows(groups?.bathroom)?.filter((row) => !DISALLOWED_BATHROOM_AMENITY_LABELS.has(row.label));
  return {
    houseWide: optionRows(groups?.houseWide) ?? [...HOUSE_WIDE_AMENITY_PRESETS],
    sharedSpace: optionRows(groups?.sharedSpace) ?? [...SHARED_SPACE_AMENITY_PRESETS],
    bathroom: bathroomRows ?? [...BATHROOM_EXTRA_AMENITY_PRESETS],
    room: roomRows ?? [...ROOM_AMENITY_PRESETS],
    availability: Array.isArray((raw as { roomAvailability?: unknown } | null)?.roomAvailability)
      ? ((raw as { roomAvailability: string[] }).roomAvailability.filter((v) => typeof v === "string") as string[])
      : ROOM_AVAILABILITY_OPTIONS,
    furnishing: selectRows((raw as { roomFurnishing?: unknown } | null)?.roomFurnishing) ?? [...ROOM_FURNISHING_OPTIONS],
  };
}

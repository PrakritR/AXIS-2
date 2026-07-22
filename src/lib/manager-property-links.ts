import type { AdminPropertyRow } from "@/lib/demo-admin-property-inventory";
import type { MockProperty } from "@/data/types";
import { resolveManagerScopeUserId } from "@/lib/demo/demo-session";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { readScopedExtraListings } from "@/lib/demo-property-pipeline";
import { readLinkedListingsForUser, safePropertyOptionLabel, type ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";

export type ManagerApplyLinkParams = {
  propertyId: string;
  listingRoomId?: string;
  roomName?: string;
  bundleId?: string;
  /** Prospect phone for SMS apply-link prefill. */
  phone?: string;
};

export function buildManagerApplyUrl(origin: string, params: ManagerApplyLinkParams): string {
  const base = origin.replace(/\/$/, "");
  const path = buildRentalApplyHref({
    propertyId: params.propertyId.trim(),
    listingRoomId: params.listingRoomId?.trim() || undefined,
    listingRoomName: params.roomName?.trim() || undefined,
    bundleId: params.bundleId?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
  });
  return `${base}${path}`;
}

export function buildTourContactHref(
  propertyId: string,
  opts?: { next?: string },
): string {
  const id = propertyId.trim();
  const q = new URLSearchParams({ propertyId: id });
  const next = opts?.next?.trim();
  if (next?.startsWith("/")) q.set("next", next);
  return `/rent/tours-contact?${q.toString()}`;
}

export function buildPropertyMessageHref(propertyId: string): string {
  const id = propertyId.trim();
  const q = new URLSearchParams({ propertyId: id, tab: "message" });
  return `/rent/tours-contact?${q.toString()}`;
}

export function buildManagerTourUrl(origin: string, propertyId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildTourContactHref(propertyId)}`;
}

export function buildManagerListingUrl(origin: string, propertyId: string): string {
  const base = origin.replace(/\/$/, "");
  const id = propertyId.trim();
  return `${base}/rent/listings/${encodeURIComponent(id)}`;
}

/** Query param on `/rent/browse` that pre-filters the grid to a set of listings. */
export const BROWSE_IDS_PARAM = "ids";

/** Normalize a comma-separated `?ids=` value into a clean, deduped id list. */
export function parseBrowseIdsParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Public browse link pre-filtered to a specific set of listings. Prefer
 * {@link buildManagerListingUrl} for a single property (it links straight to
 * that listing's detail page); use this when sharing several/all listings so
 * the prospect lands on the browse grid showing exactly those homes.
 */
export function buildManagerBrowseUrl(origin: string, propertyIds: string[]): string {
  const base = origin.replace(/\/$/, "");
  const ids = parseBrowseIdsParam(propertyIds.join(","));
  if (ids.length === 0) return `${base}/rent/browse`;
  const q = new URLSearchParams({ [BROWSE_IDS_PARAM]: ids.join(",") });
  return `${base}/rent/browse?${q.toString()}`;
}

export function managerPropertyIdForLinks(row: Pick<AdminPropertyRow, "listingId">): string | null {
  const id = row.listingId?.trim();
  if (!id || id.startsWith("preview-") || id.startsWith("demo-")) return null;
  return id;
}

/** Matches a raw demo seed key, e.g. "seed-1782590281847". */
const RAW_SEED_KEY = /seed-[a-z0-9]{6,}/i;

/**
 * Clean, human display name for a property option — never the raw seed key.
 * Prefers a real name (title / building name), falls back to the address, and
 * only as a last resort strips the seed key out of whatever text exists.
 */
export function cleanPropertyDisplayName(p: Pick<MockProperty, "title" | "buildingName" | "unitLabel" | "address">): string {
  const title = p.title?.trim() ?? "";
  const building = p.buildingName?.trim() ?? "";
  const unit = p.unitLabel?.trim() ?? "";
  const address = p.address?.trim() ?? "";
  if (title && !RAW_SEED_KEY.test(title)) return title;
  if (building && !RAW_SEED_KEY.test(building)) return unit ? `${building} · ${unit}` : building;
  if (address) return address;
  const stripped = (title || building).replace(RAW_SEED_KEY, "").trim();
  return stripped || "Property";
}

export type ManagerPromotionPropertyOption = { id: string; label: string; property: MockProperty };

/**
 * Owner-scoped property options for the Promotion flyer form. Mirrors
 * {@link buildManagerShareablePropertyOptions} scoping (the manager's OWN live
 * listings plus properties assigned via an accepted co-manager link) but returns
 * the full property so the form can prefill facts, and uses a clean display name
 * instead of the raw seed key.
 */
export function buildManagerPromotionPropertyOptions(userId: string | null): ManagerPromotionPropertyOption[] {
  const scopeUserId = resolveManagerScopeUserId(userId);
  if (!scopeUserId) return [];
  const byId = new Map<string, MockProperty>();
  for (const p of readScopedExtraListings(scopeUserId)) {
    if (p.adminPublishLive !== true) continue;
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  for (const { listing } of readLinkedListingsForUser(scopeUserId)) {
    if (listing.adminPublishLive !== true) continue;
    if (!byId.has(listing.id)) byId.set(listing.id, listing);
  }
  return [...byId.values()]
    .map((property) => ({ id: property.id, label: cleanPropertyDisplayName(property), property }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Active listed properties managers can share apply/tour links for. */
export function buildManagerShareablePropertyOptions(userId: string | null): ManagerPropertyFilterOption[] {
  const scopeUserId = resolveManagerScopeUserId(userId);
  if (!scopeUserId) return [];
  const labelById = new Map<string, string>();
  for (const p of readScopedExtraListings(scopeUserId)) {
    if (p.adminPublishLive !== true) continue;
    labelById.set(p.id, safePropertyOptionLabel([p.title, p.buildingName, p.address], p.id));
  }
  for (const { listing } of readLinkedListingsForUser(scopeUserId)) {
    if (listing.adminPublishLive !== true) continue;
    if (labelById.has(listing.id)) continue;
    labelById.set(listing.id, safePropertyOptionLabel([listing.title, listing.buildingName, listing.address], listing.id));
  }
  return [...labelById.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback below */
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

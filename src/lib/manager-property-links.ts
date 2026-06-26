import type { AdminPropertyRow } from "@/lib/demo-admin-property-inventory";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { readExtraListingsForUser } from "@/lib/demo-property-pipeline";
import { collectAccessiblePropertyIds, type ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";

export type ManagerApplyLinkParams = {
  propertyId: string;
  listingRoomId?: string;
  roomName?: string;
};

export function buildManagerApplyUrl(origin: string, params: ManagerApplyLinkParams): string {
  const base = origin.replace(/\/$/, "");
  const path = buildRentalApplyHref({
    propertyId: params.propertyId.trim(),
    listingRoomId: params.listingRoomId?.trim() || undefined,
    listingRoomName: params.roomName?.trim() || undefined,
  });
  return `${base}${path}`;
}

export function buildManagerTourUrl(origin: string, propertyId: string): string {
  const base = origin.replace(/\/$/, "");
  const id = propertyId.trim();
  return `${base}/rent/tours-contact?propertyId=${encodeURIComponent(id)}`;
}

export function buildManagerListingUrl(origin: string, propertyId: string): string {
  const base = origin.replace(/\/$/, "");
  const id = propertyId.trim();
  return `${base}/rent/listings/${encodeURIComponent(id)}`;
}

export function managerPropertyIdForLinks(row: Pick<AdminPropertyRow, "listingId">): string | null {
  const id = row.listingId?.trim();
  if (!id || id.startsWith("preview-") || id.startsWith("demo-")) return null;
  return id;
}

/** Active listed properties managers can share apply/tour links for. */
export function buildManagerShareablePropertyOptions(userId: string | null): ManagerPropertyFilterOption[] {
  if (!userId) return [];
  return readExtraListingsForUser(userId)
    .filter((p) => p.adminPublishLive === true)
    .map((p) => ({
      id: p.id,
      label: (p.title || p.buildingName || p.address).trim() || p.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function managerCanSharePropertyForUser(userId: string | null, propertyId: string): boolean {
  if (!userId) return false;
  const id = propertyId.trim();
  if (!id || !collectAccessiblePropertyIds(userId).has(id)) return false;
  const listing = readExtraListingsForUser(userId).find((p) => p.id === id);
  if (!listing) return false;
  return listing.adminPublishLive === true;
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

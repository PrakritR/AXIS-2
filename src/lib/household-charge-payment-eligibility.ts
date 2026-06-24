import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { axisPaymentsEnabledOnListing } from "@/lib/payment-policy";
import { getPropertyById } from "@/lib/rental-application/data";

export function displayPropertyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.split(" · ")[0]!.trim();
}

export function listingFromPropertyData(propertyData: unknown): ManagerListingSubmissionV1 | null {
  if (!propertyData || typeof propertyData !== "object") return null;
  const submission = (propertyData as { listingSubmission?: unknown }).listingSubmission;
  if (!submission || typeof submission !== "object") return null;
  if ((submission as { v?: unknown }).v !== 1) return null;
  return normalizeManagerListingSubmissionV1(submission as ManagerListingSubmissionV1);
}

function listingBuildingName(propertyData: unknown): string {
  if (!propertyData || typeof propertyData !== "object") return "";
  const row = propertyData as { buildingName?: string; listingSubmission?: { buildingName?: string } };
  return displayPropertyLabel(row.listingSubmission?.buildingName ?? row.buildingName ?? "");
}

export function paymentSnapshotsFromListing(
  listing: ManagerListingSubmissionV1 | null,
): Pick<HouseholdCharge, "axisPaymentsEnabledSnapshot" | "zelleContactSnapshot" | "venmoContactSnapshot"> {
  if (!listing) {
    return {};
  }
  const sub = normalizeManagerListingSubmissionV1(listing);
  return {
    axisPaymentsEnabledSnapshot: axisPaymentsEnabledOnListing(sub),
    zelleContactSnapshot:
      sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined,
    venmoContactSnapshot:
      sub.venmoPaymentsEnabled && sub.venmoContact?.trim() ? sub.venmoContact.trim() : undefined,
  };
}

export function enrichHouseholdChargePaymentFlags(
  charge: HouseholdCharge,
  listing: ManagerListingSubmissionV1 | null,
): HouseholdCharge {
  const snapshots = paymentSnapshotsFromListing(listing);
  return {
    ...charge,
    axisPaymentsEnabledSnapshot:
      charge.axisPaymentsEnabledSnapshot ?? snapshots.axisPaymentsEnabledSnapshot,
    zelleContactSnapshot: charge.zelleContactSnapshot ?? snapshots.zelleContactSnapshot,
    venmoContactSnapshot: charge.venmoContactSnapshot ?? snapshots.venmoContactSnapshot,
  };
}

export function canPayHouseholdChargeWithAxisAch(charge: HouseholdCharge): boolean {
  if (charge.status === "paid") return false;
  if (charge.axisPaymentsEnabledSnapshot === true) return true;
  if (charge.axisPaymentsEnabledSnapshot === false) return false;

  const prop = getPropertyById(charge.propertyId);
  const sub =
    prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  return Boolean(sub && axisPaymentsEnabledOnListing(sub));
}

export async function resolveListingForHouseholdCharge(
  db: SupabaseClient,
  charge: HouseholdCharge,
  managerUserId: string,
): Promise<ManagerListingSubmissionV1 | null> {
  const propertyId = charge.propertyId?.trim();
  if (propertyId) {
    const { data } = await db
      .from("manager_property_records")
      .select("property_data")
      .eq("id", propertyId)
      .maybeSingle();
    const listing = listingFromPropertyData(data?.property_data);
    if (listing) return listing;
  }

  const managerId = managerUserId.trim();
  const label = displayPropertyLabel(charge.propertyLabel ?? "");
  if (!managerId || !label) return null;

  const { data: rows } = await db
    .from("manager_property_records")
    .select("property_data")
    .eq("manager_user_id", managerId)
    .limit(200);

  for (const row of rows ?? []) {
    if (listingBuildingName(row.property_data).toLowerCase() !== label.toLowerCase()) continue;
    const listing = listingFromPropertyData(row.property_data);
    if (listing) return listing;
  }

  return null;
}

export async function enrichHouseholdChargesFromPropertyRecords(
  db: SupabaseClient,
  charges: HouseholdCharge[],
): Promise<HouseholdCharge[]> {
  if (charges.length === 0) return charges;

  const propertyIds = [...new Set(charges.map((c) => c.propertyId?.trim()).filter(Boolean))] as string[];
  const listingByPropertyId = new Map<string, ManagerListingSubmissionV1 | null>();

  if (propertyIds.length > 0) {
    const { data } = await db
      .from("manager_property_records")
      .select("id, property_data")
      .in("id", propertyIds);
    for (const row of data ?? []) {
      listingByPropertyId.set(String(row.id), listingFromPropertyData(row.property_data));
    }
  }

  const managerIds = [...new Set(charges.map((c) => c.managerUserId?.trim()).filter(Boolean))] as string[];
  const listingsByManager = new Map<string, Array<{ buildingName: string; listing: ManagerListingSubmissionV1 | null }>>();

  if (managerIds.length > 0) {
    const { data } = await db
      .from("manager_property_records")
      .select("manager_user_id, property_data")
      .in("manager_user_id", managerIds)
      .limit(500);
    for (const row of data ?? []) {
      const managerId = String(row.manager_user_id ?? "").trim();
      if (!managerId) continue;
      const bucket = listingsByManager.get(managerId) ?? [];
      bucket.push({
        buildingName: listingBuildingName(row.property_data),
        listing: listingFromPropertyData(row.property_data),
      });
      listingsByManager.set(managerId, bucket);
    }
  }

  return charges.map((charge) => {
    let listing = listingByPropertyId.get(charge.propertyId?.trim() ?? "") ?? null;
    if (!listing) {
      const label = displayPropertyLabel(charge.propertyLabel ?? "").toLowerCase();
      const managerId = charge.managerUserId?.trim() ?? "";
      if (label && managerId) {
        listing =
          listingsByManager.get(managerId)?.find((row) => row.buildingName.toLowerCase() === label)?.listing ??
          null;
      }
    }
    return enrichHouseholdChargePaymentFlags(charge, listing);
  });
}

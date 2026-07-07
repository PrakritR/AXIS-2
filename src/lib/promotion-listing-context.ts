/**
 * Listing facts for promotion copy — enriches sparse flyer inputs from the
 * property record so text generation stays grounded in real listing data.
 */

import type { MockProperty } from "@/data/types";
import { isEntireHomeListing } from "@/lib/manager-listing-submission";
import type { PromotionInputs } from "@/lib/promotion-flyer";

export type PromotionListingFacts = {
  propertyName: string;
  buildingName: string;
  address: string;
  neighborhood: string;
  unitLabel: string;
  bedsBaths: string;
  rent: string;
  availability: string;
  petFriendly: string;
  tagline: string;
  overview: string;
  amenities: string[];
  listingType: string;
  roomHighlights: string[];
  leaseNotes: string;
};

function splitLineList(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractPromotionListingFacts(property: MockProperty): PromotionListingFacts {
  const sub = property.listingSubmission;
  const rooms = (sub?.rooms ?? []).filter((r) => r.name.trim());
  const roomHighlights = rooms.slice(0, 8).map((r) => {
    const rent = r.monthlyRent > 0 ? `$${r.monthlyRent}/mo` : "";
    const avail = r.availability?.trim();
    return [r.name.trim(), rent, avail].filter(Boolean).join(" — ");
  });

  const amenities = splitLineList(sub?.amenitiesText ?? "");
  const listingType = sub
    ? isEntireHomeListing(sub)
      ? "Entire home"
      : rooms.length > 1
        ? "Rooms for rent"
        : "Rental listing"
    : property.beds > 0
      ? "Rental listing"
      : "";

  const propertyName = property.buildingName.trim() || property.title.trim();
  const overview = sub?.houseOverview?.trim() || "";

  return {
    propertyName,
    buildingName: property.buildingName.trim(),
    address: property.address.trim(),
    neighborhood: property.neighborhood.trim(),
    unitLabel: property.unitLabel.trim(),
    bedsBaths: property.beds > 0 ? `${property.beds} bed · ${property.baths} bath` : "",
    rent: property.rentLabel.trim(),
    availability: property.available.trim(),
    petFriendly: property.petFriendly ? "Pet friendly" : "",
    tagline: property.tagline.trim() || overview.split(/\n/)[0]?.trim() || "",
    overview,
    amenities,
    listingType,
    roomHighlights,
    leaseNotes: sub?.leaseTermsBody?.trim().slice(0, 400) || "",
  };
}

/** Multi-line block for AI prompts — only facts from the listing record. */
export function formatPromotionListingContext(property: MockProperty): string {
  const f = extractPromotionListingFacts(property);
  return [
    `Property name: ${f.propertyName || "(none)"}`,
    f.buildingName && f.buildingName !== f.propertyName ? `Building: ${f.buildingName}` : "",
    f.address ? `Address: ${f.address}` : "",
    f.neighborhood ? `Neighborhood: ${f.neighborhood}` : "",
    f.unitLabel ? `Unit: ${f.unitLabel}` : "",
    f.listingType ? `Listing type: ${f.listingType}` : "",
    f.bedsBaths ? `Size: ${f.bedsBaths}` : "",
    f.rent ? `Rent: ${f.rent}` : "",
    f.availability ? `Availability: ${f.availability}` : "",
    f.petFriendly ? `Pet policy: ${f.petFriendly}` : "",
    f.tagline ? `Tagline: ${f.tagline}` : "",
    f.overview ? `House overview: ${f.overview}` : "",
    f.amenities.length ? `Amenities: ${f.amenities.join("; ")}` : "",
    f.roomHighlights.length ? `Rooms: ${f.roomHighlights.join(" | ")}` : "",
    f.leaseNotes ? `Lease notes: ${f.leaseNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Fill empty promotion inputs from listing data (never overwrites manager edits). */
export function enrichPromotionInputsFromListing(
  inputs: PromotionInputs,
  property: MockProperty | null | undefined,
): PromotionInputs {
  if (!property) return inputs;

  const facts = extractPromotionListingFacts(property);
  const sellingLines = [
    facts.bedsBaths,
    facts.petFriendly,
    facts.tagline,
    ...facts.amenities.slice(0, 5),
    ...facts.roomHighlights.slice(0, 4),
  ].filter(Boolean);

  const detailParts = [
    facts.overview,
    facts.neighborhood ? `Neighborhood: ${facts.neighborhood}` : "",
    facts.listingType ? `Listing type: ${facts.listingType}` : "",
    facts.roomHighlights.length ? `Rooms: ${facts.roomHighlights.join("; ")}` : "",
    facts.leaseNotes ? `Lease: ${facts.leaseNotes}` : "",
  ].filter(Boolean);

  return {
    ...inputs,
    address: inputs.address?.trim() || facts.address || inputs.address,
    headline: inputs.headline.trim() || facts.tagline || facts.propertyName || inputs.headline,
    price: inputs.price.trim() || facts.rent || inputs.price,
    sellingPoints: inputs.sellingPoints.trim() || sellingLines.join("\n") || inputs.sellingPoints,
    customDetails: inputs.customDetails.trim() || detailParts.join("\n\n") || inputs.customDetails,
  };
}

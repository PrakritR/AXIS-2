import type { MockProperty } from "@/data/types";
import type {
  ManagerBathroomSubmission,
  ManagerBundleRow,
  ManagerListingSubmissionV1,
  ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMonthlyRent } from "@/lib/listings-search";
import {
  paymentAtSigningDetailBody,
  paymentAtSigningPriceLabel,
  utilitiesListingEstimateDetail,
  utilitiesListingEstimateLabel,
} from "@/lib/rental-application/listing-fees-display";
import type {
  AmenityItem,
  BundleCard,
  LeaseBasicRow,
  ListingBathroomRow,
  ListingFloorCard,
  ListingRichContent,
  ListingRoomRow,
  ListingSharedRow,
} from "@/data/listing-rich-content";

function splitAmenities(text: string): AmenityItem[] {
  const parts = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((label, i) => ({
    id: `amen-${i}`,
    icon: "✓",
    label,
  }));
}

function splitRoomAmenityLines(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function roomHasPrivateBath(roomId: string, sub: ManagerListingSubmissionV1): boolean {
  return sub.bathrooms.some((b) => b.assignedRoomIds?.length === 1 && b.assignedRoomIds[0] === roomId);
}

function roomSetupLine(room: ManagerRoomSubmission, sub: ManagerListingSubmissionV1): string {
  const baths = sub.bathrooms.filter((b) => b.assignedRoomIds?.includes(room.id));
  if (baths.length === 0) return "Bathroom not linked — assign rooms in Bathrooms step.";
  const b = baths[0]!;
  if (b.assignedRoomIds.length === 1) return "Private bathroom";
  const otherNames = b.assignedRoomIds
    .filter((id) => id !== room.id)
    .map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim())
    .filter(Boolean);
  return otherNames.length ? `Shared bathroom · with ${otherNames.join(", ")}` : "Shared bathroom";
}

function roomTags(room: ManagerRoomSubmission, sub: ManagerListingSubmissionV1): string[] {
  const base = ["Bed", "Desk", "Heating"];
  if (roomHasPrivateBath(room.id, sub)) base.push("Private bath");
  else if (sub.bathrooms.some((b) => b.assignedRoomIds?.includes(room.id))) base.push("Shared bath");
  const extra = room.detail
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);
  return [...new Set([...base, ...extra])].slice(0, 12);
}

function bathroomUsedByLabel(b: ManagerBathroomSubmission, sub: ManagerListingSubmissionV1): string {
  const names = (b.assignedRoomIds ?? [])
    .map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim())
    .filter(Boolean);
  return names.length ? names.join(", ") : "";
}

function sharedSpaceAccessLine(ids: string[], sub: ManagerListingSubmissionV1): string {
  const names = (ids ?? []).map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim()).filter(Boolean);
  return names.length ? names.join(", ") : "";
}

function bundleRowHasContent(b: ManagerBundleRow): boolean {
  return Boolean(b.label.trim() || b.price.trim() || b.roomsLine.trim() || b.promo.trim() || b.strikethrough.trim());
}

function perRoomBundleSummaryLine(r: ManagerRoomSubmission): string {
  const u = r.utilitiesEstimate?.trim();
  const f = r.furnishing?.trim();
  let s = `${r.name.trim()}: rent $${r.monthlyRent}/mo`;
  if (u) s += ` · utilities ~ ${u}`;
  if (f) s += ` · ${f}`;
  return s;
}

function deriveQuickFacts(
  sub: ManagerListingSubmissionV1,
  rooms: ManagerRoomSubmission[],
  property: MockProperty,
): { label: string; value: string }[] {
  return [
    { label: "Neighborhood", value: property.neighborhood || "—" },
    { label: "Rooms listed", value: String(rooms.length || property.beds) },
    { label: "Bathrooms", value: String(sub.bathrooms.filter((b) => b.name.trim()).length || property.baths) },
    { label: "Pets", value: sub.petFriendly ? "Pet-friendly (subject to approval)" : "No pets (per submission)" },
    { label: "Building", value: property.buildingName || "—" },
    {
      label: "Overview",
      value:
        sub.houseOverview.trim().slice(0, 80) + (sub.houseOverview.length > 80 ? "…" : "") || "—",
    },
  ];
}

function buildBundleCards(sub: ManagerListingSubmissionV1, rooms: ManagerRoomSubmission[], property: MockProperty): BundleCard[] {
  const custom = (sub.bundles ?? []).filter(bundleRowHasContent);
  if (custom.length > 0) {
    return custom.map((b) => ({
      id: b.id,
      label: b.label.trim() || "Package",
      price: b.price.trim() || "—",
      strikethrough: b.strikethrough.trim() || undefined,
      promo: b.promo.trim() || undefined,
      roomsLine:
        b.roomsLine.trim() ||
        rooms.map(perRoomBundleSummaryLine).join(" | ") ||
        "—",
    }));
  }

  const mids = rooms.map((r) => r.monthlyRent).filter((n) => n > 0);
  if (!mids.length) {
    return [
      {
        id: "bundle-fallback",
        label: property.unitLabel?.trim() || "Rooms",
        price: property.rentLabel || "—",
        roomsLine: "Add rooms with monthly rent in the manager form.",
      },
    ];
  }

  const lo = Math.min(...mids);
  const hi = Math.max(...mids);
  const priceSummary = lo === hi ? `$${lo}/mo` : `$${lo}–$${hi}/mo`;

  return [
    {
      id: "bundle-listed-rooms",
      label: "Listed rooms",
      price: `from ${priceSummary}`,
      roomsLine: rooms.map(perRoomBundleSummaryLine).join(" | "),
    },
  ];
}

export function listingRichFromManagerSubmission(
  property: MockProperty,
  incoming: ManagerListingSubmissionV1,
): ListingRichContent {
  const sub = normalizeManagerListingSubmissionV1(incoming);
  const rooms = sub.rooms.filter((r) => r.name.trim());
  const floorsMap = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const fl = r.floor.trim() || "Floor plan";
    if (!floorsMap.has(fl)) floorsMap.set(fl, []);
    floorsMap.get(fl)!.push(r);
  }

  const floorPlans: ListingFloorCard[] = [...floorsMap.entries()].map(([floorLabel, rs]) => {
    const rents = rs.map((r) => r.monthlyRent).filter((n) => n > 0);
    const from = rents.length ? Math.min(...rents) : parseMonthlyRent(property.rentLabel) ?? 800;
    const roomRows: ListingRoomRow[] = rs.map((r) => {
      const setup = roomSetupLine(r, sub);
      const furnish = r.furnishing?.trim();
      const amenityLabels = splitRoomAmenityLines(r.roomAmenitiesText ?? "");
      const utilNote = r.utilitiesEstimate?.trim() ? ` · Utilities ~ ${r.utilitiesEstimate.trim()}` : "";
      const baseTags = roomTags(r, sub);
      return {
        id: r.id,
        name: r.name.trim(),
        detail: `${r.floor.trim() || "—"} · ${r.detail.trim() || "See room details below."}${utilNote}`,
        price: `$${r.monthlyRent}/month`,
        availability: r.availability.trim() || "Available now",
        modal: {
          setupLine: setup,
          tourEyebrow: "Room tour",
          tourTitle: r.videoDataUrl ? "Uploaded video" : "Video tour",
          tourSubtitle: r.videoDataUrl
            ? "Video submitted with property application."
            : "Add a video in the manager form to replace this placeholder.",
          includedTags: baseTags,
          furnishingDetail: furnish || undefined,
          roomAmenityLabels: amenityLabels.length ? amenityLabels : undefined,
          photoUrls: r.photoDataUrls.length ? r.photoDataUrls : undefined,
          videoSrc: r.videoDataUrl,
        },
      };
    });
    return {
      floorLabel,
      fromPrice: `$${from}/month`,
      roomCount: rs.length,
      remainingNote: `${rs.length} room${rs.length === 1 ? "" : "s"} on this floor`,
      rooms: roomRows,
    };
  });

  let bathrooms: ListingBathroomRow[] = sub.bathrooms
    .filter((b) => b.name.trim())
    .map((b) => {
      const tags: string[] = [];
      if (b.shower) tags.push("Shower");
      if (b.toilet) tags.push("Toilet");
      if (b.bathtub) tags.push("Bathtub");
      return {
        id: b.id,
        name: b.name.trim(),
        detail: b.location.trim() || "—",
        shower: b.shower,
        toilet: b.toilet,
        bathtub: b.bathtub,
        availability: b.assignedRoomIds?.length ? "Assigned" : "—",
        modal: {
          eyebrow: "Bathroom",
          setupCard: bathroomUsedByLabel(b, sub)
            ? `Used by: ${bathroomUsedByLabel(b, sub)}`
            : "Select which rooms use this bathroom in the manager form.",
          includedTags: tags.length ? tags : ["Restroom"],
          photoCaptions: ["Photo 1", "Photo 2", "Photo 3"],
        },
      };
    });

  if (bathrooms.length === 0) {
    bathrooms = [
      {
        id: "b-fallback",
        name: "Bathrooms",
        detail: "No bathrooms listed yet — add them in the listing editor.",
        shower: true,
        toilet: true,
        bathtub: false,
        availability: "—",
        modal: {
          eyebrow: "Bathroom",
          setupCard: "Add fixture and room assignments in the listing editor.",
          includedTags: ["Shower", "Toilet"],
          photoCaptions: ["Placeholder"],
        },
      },
    ];
  }

  const sharedFromForm = (sub.sharedSpaces ?? []).filter((s) => s.name.trim());
  const sharedSpaces: ListingSharedRow[] =
    sharedFromForm.length > 0
      ? sharedFromForm.map((s) => {
          const access = sharedSpaceAccessLine(s.roomAccessIds ?? [], sub);
          return {
            id: s.id,
            name: s.name.trim(),
            detail: access ? `Room access: ${access}` : "Select room access in manager form",
            useNote: s.detail.trim() || "Details from manager submission.",
            availability: (s.roomAccessIds?.length ?? 0) > 0 ? "Shared" : "—",
            modal: {
              eyebrow: "Shared space",
              tourEyebrow: "Space tour",
              tourTitle: s.name.trim(),
              tourSubtitle: s.detail.trim() || "Shared area for residents.",
              includedTags: ["Common area"],
              photoCaptions: ["Common area"],
            },
          };
        })
      : [
          {
            id: "shared-placeholder",
            name: "Shared spaces",
            detail: "Add kitchens, laundry, yard, etc. in the manager form",
            useNote: "No shared spaces were added yet.",
            availability: "—",
            modal: {
              eyebrow: "Shared space",
              tourEyebrow: "Space tour",
              tourTitle: "Tour coming soon",
              tourSubtitle: "Add shared spaces when editing the listing.",
              includedTags: ["Common areas"],
              photoCaptions: ["Placeholder"],
            },
          },
        ];

  const leaseBasics: LeaseBasicRow[] = [
    {
      id: "lease-terms",
      icon: "📋",
      title: "Lease terms",
      detail: "As submitted",
      price: "—",
      status: "See details",
      body: sub.leaseTermsBody.trim() || "Lease terms will be confirmed with applicants.",
    },
    {
      id: "lease-application",
      icon: "📄",
      title: "Application",
      detail: "Processing",
      price: sub.applicationFee.trim() || "—",
      status: "Due with app",
      body: `Application fee: ${sub.applicationFee.trim() || "—"} (from submission).`,
    },
    {
      id: "lease-deposit",
      icon: "🔒",
      title: "Security deposit",
      detail: "As submitted",
      price: sub.securityDeposit.trim() || "—",
      status: "At signing",
      body: `Security deposit: ${sub.securityDeposit.trim() || "—"}.`,
    },
    {
      id: "lease-movein",
      icon: "🧾",
      title: "Move-in fee",
      detail: "Administrative",
      price: sub.moveInFee.trim() || "—",
      status: "At signing",
      body: `Move-in fee: ${sub.moveInFee.trim() || "—"}.`,
    },
    {
      id: "lease-signing",
      icon: "✍️",
      title: "Payment due at signing",
      detail: sub.paymentAtSigningIncludes?.length ? "Selected charges" : "None selected",
      price: paymentAtSigningPriceLabel(sub),
      status: "At signing",
      body: paymentAtSigningDetailBody(sub),
    },
    {
      id: "lease-utilities",
      icon: "📊",
      title: "Utilities",
      detail: "Per room",
      price: utilitiesListingEstimateLabel(sub),
      status: "Estimated",
      body: utilitiesListingEstimateDetail(sub),
    },
  ];

  const houseCostRows: LeaseBasicRow[] = [];
  if (sub.houseCostsDetail.trim()) {
    houseCostRows.push({
      id: "house-costs-overview",
      icon: "🏠",
      title: "House costs overview",
      detail: "All-in summary",
      price: "—",
      status: "Info",
      body: sub.houseCostsDetail.trim(),
    });
  }
  if (sub.parkingMonthly.trim()) {
    houseCostRows.push({
      id: "parking",
      icon: "🅿️",
      title: "Parking",
      detail: "If applicable",
      price: sub.parkingMonthly.trim(),
      status: "Monthly",
      body: `Parking: ${sub.parkingMonthly.trim()} per month.`,
    });
  }
  if (sub.hoaMonthly.trim()) {
    houseCostRows.push({
      id: "hoa",
      icon: "🏛️",
      title: "HOA / community",
      detail: "If applicable",
      price: sub.hoaMonthly.trim(),
      status: "Monthly",
      body: `HOA or community fee: ${sub.hoaMonthly.trim()}.`,
    });
  }
  if (sub.otherMonthlyFees.trim()) {
    houseCostRows.push({
      id: "other-fees",
      icon: "➕",
      title: "Other fees",
      detail: "As submitted",
      price: sub.otherMonthlyFees.trim(),
      status: "See notes",
      body: sub.otherMonthlyFees.trim(),
    });
  }

  const amenities = splitAmenities(sub.amenitiesText);

  const mids = rooms.map((r) => r.monthlyRent).filter((n) => n > 0);
  const mid = mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : parseMonthlyRent(property.rentLabel) ?? 875;
  const low = Math.max(400, Math.floor(mid - 75));
  const high = Math.ceil(mid + 100);

  const bundleCards = buildBundleCards(sub, rooms, property);

  const qfCustom = (sub.quickFacts ?? []).filter((q) => q.label.trim() || q.value.trim());
  const quickFacts =
    qfCustom.length > 0
      ? qfCustom.map((q) => ({
          label: q.label.trim() || "—",
          value: q.value.trim() || "—",
        }))
      : deriveQuickFacts(sub, rooms, property);

  const overview = sub.houseOverview.trim();
  const rules = sub.houseRulesText.trim();
  return {
    heroTagline: sub.tagline.trim() || property.tagline || "New listing",
    heroOverview: overview || undefined,
    houseRulesBody: rules || undefined,
    priceRangeLabel: mids.length ? `from $${low}–$${high}/mo` : "—",
    floorPlans:
      floorPlans.length > 0
        ? floorPlans
        : [
            {
              floorLabel: "Listing",
              fromPrice: property.rentLabel,
              roomCount: 1,
              rooms: [
                {
                  id: "r-fallback",
                  name: property.unitLabel || "Room",
                  detail: sub.houseOverview.trim().slice(0, 160) || "No room details yet — add rooms in the listing editor.",
                  price: property.rentLabel,
                  availability: "See manager",
                  modal: {
                    setupLine: "Add room details in the listing editor",
                    tourEyebrow: "Room tour",
                    tourTitle: "Video placeholder",
                    tourSubtitle: "Upload a room video in the manager form.",
                    includedTags: ["See listing"],
                  },
                },
              ],
            },
          ],
    bathrooms: bathrooms.length ? bathrooms : [],
    sharedSpaces,
    leaseBasics: [...leaseBasics, ...houseCostRows],
    amenities,
    bundlesText:
      sub.leaseTermsBody.trim() ||
      "Lease terms and lengths have not been added to this listing yet.",
    bundleCards,
    quickFacts,
  };
}

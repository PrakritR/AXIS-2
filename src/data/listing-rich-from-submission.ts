import type { MockProperty } from "@/data/types";
import type {
  ManagerBathroomRoomAccessKind,
  ManagerBathroomSubmission,
  ManagerBundleRow,
  ManagerListingSubmissionV1,
  ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMonthlyRent } from "@/lib/listings-search";
import { parseMoneyAmount } from "@/lib/parse-money";
import {
  paymentAtSigningDetailBody,
  paymentAtSigningPriceLabel,
  utilitiesListingEstimateDetail,
  utilitiesListingEstimateLabel,
} from "@/lib/rental-application/listing-fees-display";

function filterLeaseBasicsRows(
  rows: LeaseBasicRow[],
  sub: ManagerListingSubmissionV1,
  rooms: ManagerRoomSubmission[],
): LeaseBasicRow[] {
  return rows.filter((row) => {
    switch (row.id) {
      case "lease-terms":
        return Boolean(sub.leaseTermsBody.trim());
      case "lease-application":
        return feeMeaningfulForListing(sub.applicationFee);
      case "lease-deposit":
        return feeMeaningfulForListing(sub.securityDeposit);
      case "lease-movein":
        return feeMeaningfulForListing(sub.moveInFee);
      case "lease-signing":
        return (sub.paymentAtSigningIncludes?.length ?? 0) > 0;
      case "lease-utilities":
        if (utilitiesListingEstimateLabel(sub) !== "—") return true;
        return rooms.some((r) => r.name.trim() && Boolean((r.utilitiesEstimate ?? "").trim()));
      default:
        return true;
    }
  });
}
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

function accessKindClause(kind: ManagerBathroomRoomAccessKind | undefined): string {
  if (kind === "ensuite") return " — noted en suite for this bathroom";
  if (kind === "shared") return " — noted shared with other rooms on this bathroom";
  if (kind === "hall") return " — noted hall / common access";
  return "";
}

function roomHasPrivateBath(roomId: string, sub: ManagerListingSubmissionV1): boolean {
  return sub.bathrooms.some((b) => {
    if (b.allResidents) return false;
    const ids = b.assignedRoomIds ?? [];
    return ids.length === 1 && ids[0] === roomId;
  });
}

function roomSetupLine(room: ManagerRoomSubmission, sub: ManagerListingSubmissionV1): string {
  const wholeHouse = sub.bathrooms.filter((b) => b.name.trim() && b.allResidents);
  const direct = sub.bathrooms.filter((b) => b.name.trim() && !b.allResidents && (b.assignedRoomIds ?? []).includes(room.id));

  if (direct.length > 0) {
    const b = direct[0]!;
    const ids = b.assignedRoomIds ?? [];
    const kind = b.accessKindByRoomId?.[room.id];
    let line: string;
    if (ids.length === 1) line = "Private bathroom (en suite to this room)";
    else {
      const otherNames = ids
        .filter((id) => id !== room.id)
        .map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim())
        .filter(Boolean);
      line = otherNames.length ? `Shared bathroom · with ${otherNames.join(", ")}` : "Shared bathroom";
    }
    line += accessKindClause(kind);
    if (wholeHouse.length > 0) {
      line += ` · Whole-house bath: ${wholeHouse.map((x) => x.name.trim()).join(", ")}`;
    }
    return line;
  }

  if (wholeHouse.length > 0) {
    return `Whole-house / hall bath: ${wholeHouse.map((b) => b.name.trim()).join(", ")}`;
  }
  return "Bathroom not linked — assign rooms in Bathrooms step.";
}

function roomTags(room: ManagerRoomSubmission, sub: ManagerListingSubmissionV1): string[] {
  const base = ["Bed", "Desk", "Heating"];
  if (roomHasPrivateBath(room.id, sub)) base.push("Private bath");
  else if (sub.bathrooms.some((b) => !b.allResidents && (b.assignedRoomIds ?? []).includes(room.id))) base.push("Shared bath");
  if (sub.bathrooms.some((b) => b.name.trim() && b.allResidents)) base.push("House hall bath");
  const extra = room.detail
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);
  return [...new Set([...base, ...extra])].slice(0, 12);
}

function bathroomUsedByLabel(b: ManagerBathroomSubmission, sub: ManagerListingSubmissionV1): string {
  if (b.allResidents) {
    const named = sub.rooms.filter((r) => r.name.trim()).map((r) => r.name.trim());
    return named.length ? `All listed bedrooms (${named.join(", ")})` : "All listed bedrooms";
  }
  const names = (b.assignedRoomIds ?? [])
    .map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim())
    .filter(Boolean);
  return names.length ? names.join(", ") : "";
}

function buildListingFloorCard(
  cardKey: string,
  floorLabel: string,
  rs: ManagerRoomSubmission[],
  sub: ManagerListingSubmissionV1,
  property: MockProperty,
): ListingFloorCard {
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
    cardKey,
    floorLabel,
    fromPrice: `$${from}/month`,
    roomCount: rs.length,
    remainingNote: `${rs.length} room${rs.length === 1 ? "" : "s"} in this group`,
    rooms: roomRows,
  };
}

function sharedSpaceAccessLine(ids: string[], sub: ManagerListingSubmissionV1): string {
  const names = (ids ?? []).map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim()).filter(Boolean);
  return names.length ? names.join(", ") : "";
}

function bundleRowHasContent(b: ManagerBundleRow): boolean {
  return Boolean(
    b.label.trim() ||
      b.price.trim() ||
      b.roomsLine.trim() ||
      b.promo.trim() ||
      b.strikethrough.trim() ||
      (b.includedRoomIds?.length ?? 0) > 0,
  );
}

/** Hide fee rows when blank or dollar amount parses to zero (e.g. HOA $0). Text like “Waived” still shows. */
function feeMeaningfulForListing(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const n = parseMoneyAmount(t);
  if (n > 0) return true;
  if (n === 0 && /^[\s$0.,\-–—]*$/i.test(t)) return false;
  return true;
}

function bundleScopeLineFromRow(b: ManagerBundleRow, rooms: ManagerRoomSubmission[]): string {
  const ids = b.includedRoomIds ?? [];
  if (ids.length > 0) {
    const names = ids.map((id) => rooms.find((r) => r.id === id)?.name?.trim()).filter(Boolean);
    if (names.length) return names.join(" · ");
  }
  return b.roomsLine.trim();
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
    return custom.map((b) => {
      const scope = bundleScopeLineFromRow(b, rooms);
      return {
        id: b.id,
        label: b.label.trim() || "Package",
        price: b.price.trim() || "—",
        strikethrough: b.strikethrough.trim() || undefined,
        promo: b.promo.trim() || undefined,
        roomsLine: scope || rooms.map(perRoomBundleSummaryLine).join(" | ") || "—",
      };
    });
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
  const namedBaths = sub.bathrooms.filter((b) => b.name.trim());
  const specificBaths = namedBaths.filter((b) => !b.allResidents);
  const hasSpecificAssignments = specificBaths.some((b) => (b.assignedRoomIds ?? []).length > 0);

  let floorPlansSectionTitle: string | undefined;
  let floorPlans: ListingFloorCard[];

  if (hasSpecificAssignments) {
    floorPlansSectionTitle = "Rooms by bathroom";
    const used = new Set<string>();
    const groups: ListingFloorCard[] = [];
    for (const b of specificBaths) {
      const ids = b.assignedRoomIds ?? [];
      const rs = rooms.filter((r) => ids.includes(r.id));
      for (const r of rs) used.add(r.id);
      if (rs.length === 0) continue;
      const loc = b.location.trim();
      const label = loc ? `${b.name.trim()} · ${loc}` : b.name.trim();
      groups.push(buildListingFloorCard(b.id, label, rs, sub, property));
    }
    const orphans = rooms.filter((r) => !used.has(r.id));
    if (orphans.length > 0) {
      groups.push(buildListingFloorCard("rooms-other", "Other bedrooms (bathroom not specified)", orphans, sub, property));
    }
    floorPlans = groups;
  } else {
    const floorsMap = new Map<string, typeof rooms>();
    for (const r of rooms) {
      const fl = r.floor.trim() || "Floor plan";
      if (!floorsMap.has(fl)) floorsMap.set(fl, []);
      floorsMap.get(fl)!.push(r);
    }
    let idx = 0;
    floorPlans = [...floorsMap.entries()].map(([floorLabel, rs]) => {
      idx += 1;
      const card = buildListingFloorCard(`floor-${idx}-${floorLabel}`, floorLabel, rs, sub, property);
      return {
        ...card,
        remainingNote: `${rs.length} room${rs.length === 1 ? "" : "s"} on this floor`,
      };
    });
  }

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
        availability: b.allResidents ? "All rooms" : b.assignedRoomIds?.length ? "Assigned" : "—",
        modal: {
          eyebrow: "Bathroom",
          setupCard: bathroomUsedByLabel(b, sub)
            ? `Used by: ${bathroomUsedByLabel(b, sub)}`
            : b.allResidents
              ? "Marked as a whole-house / hall bathroom for all listed bedrooms."
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
      title: "Move-in charges",
      detail: "At move-in",
      price: sub.moveInFee.trim() || "—",
      status: "At signing",
      body: `Move-in charges: ${sub.moveInFee.trim() || "—"}.`,
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
  if (feeMeaningfulForListing(sub.parkingMonthly)) {
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
  if (feeMeaningfulForListing(sub.hoaMonthly)) {
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
  if (feeMeaningfulForListing(sub.otherMonthlyFees)) {
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
  const heroHouse = (sub.housePhotoDataUrls ?? []).filter(Boolean);
  return {
    heroTagline: sub.tagline.trim() || property.tagline || "New listing",
    heroHousePhotoUrls: heroHouse.length ? heroHouse : undefined,
    heroOverview: overview || undefined,
    houseRulesBody: rules || undefined,
    priceRangeLabel: mids.length ? `from $${low}–$${high}/mo` : "—",
    floorPlansSectionTitle: floorPlansSectionTitle ?? undefined,
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
    leaseBasics: [...filterLeaseBasicsRows(leaseBasics, sub, rooms), ...houseCostRows],
    amenities,
    bundlesText:
      sub.leaseTermsBody.trim() ||
      "Lease terms and lengths have not been added to this listing yet.",
    bundleCards,
    quickFacts,
  };
}

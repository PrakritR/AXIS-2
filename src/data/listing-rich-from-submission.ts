import type { MockProperty } from "@/data/types";
import type {
  ManagerBathroomRoomAccessKind,
  ManagerBathroomSubmission,
  ManagerBundleRow,
  ManagerListingSubmissionV1,
  ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { LEGACY_HOUSE_AMENITY_LABELS_IN_SHARED_PRESETS, splitLineList } from "@/data/manager-listing-presets";
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

/** House grid: drop lines that belong in shared-space / kitchen presets (including legacy single “Amenities” list). */
function houseWideAmenityItems(amenitiesText: string): AmenityItem[] {
  const items = splitAmenities(amenitiesText);
  return items.filter((a) => !LEGACY_HOUSE_AMENITY_LABELS_IN_SHARED_PRESETS.has(a.label));
}

/** If the main amenities field still lists kitchen-style lines, show them on the matching shared space for backwards compatibility. */
function legacySharedLabelsFromHouseAmenities(sub: ManagerListingSubmissionV1, spaceName: string): string[] {
  const n = spaceName.toLowerCase();
  if (!/kitchen|dining|galley|pantry|eat\b|cook/.test(n)) return [];
  return splitLineList(sub.amenitiesText).filter((l) => LEGACY_HOUSE_AMENITY_LABELS_IN_SHARED_PRESETS.has(l));
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

/** One-line hint under the room name on listing cards — avoid repeating floor + detail. */
function roomListingTableSubtitle(r: ManagerRoomSubmission): string {
  const util = r.utilitiesEstimate?.trim();
  if (util) return `Utilities ~ ${util}`;
  return "Open Details for layout, notes & photos";
}

/** Modal “What’s included” pills — bathroom situation + detail snippets only (no Bed/Desk/Heating; those live under amenities / furnishing). */
function roomModalIncludedTags(room: ManagerRoomSubmission, sub: ManagerListingSubmissionV1, amenityLabels: string[]): string[] {
  const amenityLc = new Set(amenityLabels.map((a) => a.toLowerCase()));
  const floorNorm = room.floor.trim().toLowerCase();
  const tags: string[] = [];

  if (roomHasPrivateBath(room.id, sub)) tags.push("Private bath");
  else if (sub.bathrooms.some((b) => !b.allResidents && (b.assignedRoomIds ?? []).includes(room.id))) tags.push("Shared bath");
  if (sub.bathrooms.some((b) => b.name.trim() && b.allResidents)) tags.push("House hall bath");

  const genericOnly = (segment: string): boolean => {
    const meaningful = segment
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && w !== "and");
    if (meaningful.length === 0) return true;
    const generic = new Set(["bed", "desk", "heating", "ac", "wifi"]);
    return meaningful.every((w) => generic.has(w));
  };

  const roomNameNorm = room.name.trim().toLowerCase();
  const floorRoomLabel =
    room.floor.trim() && room.name.trim() ? `${room.floor.trim()} - ${room.name.trim()}`.toLowerCase() : "";

  const extras = room.detail
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);

  for (const e of extras) {
    const el = e.toLowerCase();
    if (amenityLc.has(el)) continue;
    if (floorNorm && el === floorNorm) continue;
    if (floorRoomLabel && el.replace(/\s+/g, " ") === floorRoomLabel) continue;
    if (roomNameNorm && el === roomNameNorm) continue;
    if (genericOnly(e)) continue;
    if ((el.includes("private") && el.includes("bath")) && tags.includes("Private bath")) continue;
    tags.push(e);
  }

  return [...new Set(tags)].slice(0, 12);
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
    const utilRaw = r.utilitiesEstimate?.trim();
    const baseTags = roomModalIncludedTags(r, sub, amenityLabels);
    return {
      id: r.id,
      name: r.name.trim(),
      detail: roomListingTableSubtitle(r),
      utilitiesEstimate: utilRaw || undefined,
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
        floorLine: r.floor.trim() || undefined,
        roomNotes: r.detail.trim() || undefined,
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
    if (names.length) return names.join(", ");
  }
  return b.roomsLine.trim();
}

function roomNamesForBundle(b: ManagerBundleRow, rooms: ManagerRoomSubmission[]): string[] {
  const ids = b.includedRoomIds ?? [];
  if (ids.length === 0) return [];
  return ids.map((id) => rooms.find((r) => r.id === id)?.name?.trim()).filter(Boolean) as string[];
}

function perRoomBundleSummaryLine(r: ManagerRoomSubmission): string {
  const u = r.utilitiesEstimate?.trim();
  const f = r.furnishing?.trim();
  let s = `${r.name.trim()}: $${r.monthlyRent}/mo`;
  if (u) s += ` · utilities ~ ${u}`;
  if (f) s += ` · ${f}`;
  return s;
}

function bundleSummaryItems(
  rooms: ManagerRoomSubmission[],
  sub: ManagerListingSubmissionV1,
): { label: string; value: string }[] {
  const rents = rooms.map((r) => r.monthlyRent).filter((n) => n > 0);
  const utilities = rooms.map((r) => r.utilitiesEstimate?.trim()).filter(Boolean);
  return [
    { label: "Rooms", value: String(rooms.length) },
    rents.length
      ? { label: "Rent range", value: `$${Math.min(...rents)} - $${Math.max(...rents)}/mo` }
      : { label: "Rent", value: "Ask manager" },
    { label: "Utilities", value: utilities.length ? [...new Set(utilities)].join(", ") : utilitiesListingEstimateLabel(sub) },
    { label: "Signing", value: paymentAtSigningPriceLabel(sub) },
  ];
}

function moneyLabel(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function monthlyRangeLabel(values: number[], prefix = ""): string {
  const clean = values.filter((n) => Number.isFinite(n) && n > 0);
  if (!clean.length) return "—";
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  return lo === hi ? `${prefix}${moneyLabel(lo)}/mo` : `${prefix}${moneyLabel(lo)}–${moneyLabel(hi)}/mo`;
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
      const customRoomNames = roomNamesForBundle(b, rooms);
      const scopedRooms = customRoomNames.length
        ? rooms.filter((room) => customRoomNames.includes(room.name.trim()))
        : rooms;
      return {
        id: b.id,
        label: b.label.trim() || "Package",
        price: b.price.trim() || "—",
        strikethrough: b.strikethrough.trim() || undefined,
        promo: b.promo.trim() || undefined,
        roomsLine: scope || `${scopedRooms.length} room${scopedRooms.length === 1 ? "" : "s"} included`,
        roomLines: scopedRooms.map(perRoomBundleSummaryLine),
        summaryItems: bundleSummaryItems(scopedRooms, sub),
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
      roomsLine: `${rooms.length} room${rooms.length === 1 ? "" : "s"} available`,
      roomLines: rooms.map(perRoomBundleSummaryLine),
      summaryItems: bundleSummaryItems(rooms, sub),
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
      const extra = splitRoomAmenityLines(b.amenitiesText ?? "");
      const mergedTags = [...tags, ...extra];
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
          includedTags: mergedTags.length ? mergedTags : ["Restroom"],
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
          const spaceAmenities = splitRoomAmenityLines(s.amenitiesText ?? "");
          const legacyFromHouse = legacySharedLabelsFromHouseAmenities(sub, s.name);
          const merged = [...new Set([...spaceAmenities, ...legacyFromHouse])];
          const includedTags = merged.length > 0 ? ["Common area", ...merged] : ["Common area"];
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
              includedTags,
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

  const amenities = houseWideAmenityItems(sub.amenitiesText);

  const mids = rooms.map((r) => r.monthlyRent).filter((n) => n > 0);
  const monthlyTotals = rooms
    .filter((r) => r.monthlyRent > 0)
    .map((r) => {
      const utilities = parseMoneyAmount(r.utilitiesEstimate ?? "");
      return utilities > 0 ? r.monthlyRent + utilities : null;
    })
    .filter((n): n is number => n !== null);

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
    priceRangeLabel: mids.length ? `base rent ${monthlyRangeLabel(mids)}` : "—",
    startingRentLabel: mids.length
      ? monthlyRangeLabel([Math.min(...mids)])
      : property.rentLabel.trim().replace(/\s*\/\s*/g, "/") || "—",
    estimatedMonthlyTotalLabel: monthlyTotals.length ? monthlyRangeLabel([Math.min(...monthlyTotals)]) : undefined,
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
                  detail: "Open Details for listing description & next steps",
                  price: property.rentLabel,
                  availability: "See manager",
                  modal: {
                    setupLine: "Add room details in the listing editor",
                    tourEyebrow: "Room tour",
                    tourTitle: "Video placeholder",
                    tourSubtitle: "Upload a room video in the manager form.",
                    includedTags: ["See listing"],
                    roomNotes: sub.houseOverview.trim() || undefined,
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

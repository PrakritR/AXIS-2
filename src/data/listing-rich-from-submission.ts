import type { MockProperty } from "@/data/types";
import type {
  ManagerBathroomSubmission,
  ManagerBundleRow,
  ManagerListingSubmissionV1,
  ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1, formatListingBasicsSummary, isEntireHomeListing, entireHomeMonthlyRentAmount, resolveAllowedLeaseTerms } from "@/lib/manager-listing-submission";
import {
  LEGACY_HOUSE_AMENITY_LABELS_IN_SHARED_PRESETS,
  LISTING_TOTAL_BATH_OPTIONS,
  sanitizeRoomAmenityText,
  splitLineList,
} from "@/data/manager-listing-presets";
import { parseMonthlyRent } from "@/lib/listings-search";
import {
  bathroomShareCountForRoom,
  describeRoomBathroomSituation,
  listingHasWholeHouseBath,
  roomBathroomModalLabel,
  roomBathroomSetupLine,
  roomHasPrivateBath,
} from "@/lib/listing-bathroom-layout";
import { compareFloorLabels, compareRoomsByFloorThenName } from "@/lib/listing-floor-order";
import { parseMoneyAmount } from "@/lib/parse-money";
import {
  formatUtilitiesListingLine,
  resolveRoomUtilitiesPaymentModel,
  utilitiesListingSummaryLabel,
} from "@/lib/listing-utilities-payment";
import {
  formatListingFeeDisplay,
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
      case "lease-multi-room":
        return !isEntireHomeListing(sub) && twoOrMoreRoomPriceLabel(rooms) !== null;
      case "lease-terms":
        return resolveAllowedLeaseTerms(sub).length > 0 || Boolean(sub.leaseTermsBody.trim());
      case "lease-application":
        return feeMeaningfulForListing(sub.applicationFee);
      case "lease-deposit":
        return feeMeaningfulForListing(sub.securityDeposit);
      case "lease-movein":
        return feeMeaningfulForListing(sub.moveInFee);
      case "lease-signing":
        return (sub.paymentAtSigningIncludes?.length ?? 0) > 0;
      case "lease-utilities":
        if (utilitiesListingSummaryLabel(sub) !== "—") return true;
        return rooms.some(
          (r) =>
            r.name.trim() &&
            (Boolean((r.utilitiesEstimate ?? "").trim()) ||
              resolveRoomUtilitiesPaymentModel(r) !== "manager_billed"),
        );
      default:
        return true;
    }
  });
}

function shortTermStayPriceLabel(sub: ManagerListingSubmissionV1): string {
  const daily = sub.shortTermDailyCost?.trim();
  if (!daily) return "Allowed";
  return `${formatListingFeeDisplay(daily)}/day`;
}

function shortTermStayDetailBody(sub: ManagerListingSubmissionV1): string {
  const daily = sub.shortTermDailyCost?.trim() ? formatListingFeeDisplay(sub.shortTermDailyCost) : "Set by host";
  const deposit = sub.shortTermDeposit?.trim() ? formatListingFeeDisplay(sub.shortTermDeposit) : "Set by host";
  const requirements =
    sub.shortTermRequirements?.trim() ||
    "Guest must follow house rules, may not receive mail or claim residency, and must vacate by the agreed check-out time.";
  return `This listing allows short-term room stays. Daily cost: ${daily}. Short-term deposit: ${deposit}. Requirements: ${requirements}`;
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
import {
  roomHeadlineAmount,
  roomHeadlinePriceLabel,
  roomIsDailyPriced,
  roomMonthlyEquivalent,
} from "@/lib/room-pricing";

/**
 * Rent value for AGGREGATE labels (rent ranges, "starting at", estimated totals):
 * daily-priced rooms contribute their monthly-equivalent so mixed listings stay
 * coherent as "/mo". Each room's own row still shows its true "$X/day" price.
 */
function aggregateRoomRentValue(r: ManagerRoomSubmission): number {
  return roomMonthlyEquivalent(r);
}

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
  return sanitizeRoomAmenityText(text)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function resolveFloorPlanImageUrl(
  cardFloorLabel: string,
  rs: ManagerRoomSubmission[],
  sub: ManagerListingSubmissionV1,
): string | undefined {
  const byLabel = sub.floorPlanByLabel ?? {};
  const direct = byLabel[cardFloorLabel]?.trim();
  if (direct) return direct;
  for (const r of rs) {
    const fl = r.floor.trim();
    if (fl && byLabel[fl]?.trim()) return byLabel[fl]!.trim();
  }
  const propertyWide = sub.propertyFloorPlanDataUrl?.trim();
  return propertyWide || undefined;
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
  else if (bathroomShareCountForRoom(room.id, sub) !== null) tags.push("Shared bath");
  if (listingHasWholeHouseBath(sub)) tags.push("House hall bath");

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

  const isSensitiveAccessInfo = (s: string): boolean => {
    const sl = s.toLowerCase();
    return (
      sl.includes("lockerbox") ||
      sl.includes("lockbox") ||
      sl.includes("lock box") ||
      /\bcode\s*:/.test(sl) ||
      /\bpasscode\b/.test(sl) ||
      /\bpin\s*:/.test(sl) ||
      /\baccess\s+code\b/.test(sl)
    );
  };

  for (const e of extras) {
    const el = e.toLowerCase();
    if (amenityLc.has(el)) continue;
    if (floorNorm && el === floorNorm) continue;
    if (floorRoomLabel && el.replace(/\s+/g, " ") === floorRoomLabel) continue;
    if (roomNameNorm && el === roomNameNorm) continue;
    if (genericOnly(e)) continue;
    if ((el.includes("private") && el.includes("bath")) && tags.includes("Private bath")) continue;
    if (isSensitiveAccessInfo(e)) continue;
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
  floorPlanImageUrl?: string,
): ListingFloorCard {
  const entireHome = isEntireHomeListing(sub);
  const entireRent = entireHomeMonthlyRentAmount(sub);
  const rents = entireHome && entireRent > 0 ? [entireRent] : rs.map(aggregateRoomRentValue).filter((n) => n > 0);
  const from = rents.length ? Math.min(...rents) : parseMonthlyRent(property.rentLabel) ?? 800;
  const roomRows: ListingRoomRow[] = rs.map((r) => {
    const setup = describeRoomBathroomSituation(r.id, sub);
    const bathroomShort = roomBathroomModalLabel(r, sub);
    const bathroomDetail = roomBathroomSetupLine(r, sub);
    const furnish = formatFurnishingForListing(r.furnishing);
    const amenityLabels = splitRoomAmenityLines(r.roomAmenitiesText ?? "");
    const utilRaw = formatUtilitiesListingLine(
      resolveRoomUtilitiesPaymentModel(r),
      r.utilitiesEstimate,
    );
    const utilDisplay = utilRaw === "—" ? undefined : utilRaw;
    const baseTags = roomModalIncludedTags(r, sub, amenityLabels);
    return {
      id: r.id,
      name: r.name.trim(),
      detail: roomListingTableSubtitle(r),
      utilitiesEstimate: utilDisplay,
      price: roomIsDailyPriced(r)
        ? roomHeadlinePriceLabel(r)
        : entireHome
          ? (r.monthlyRent > 0 ? `$${r.monthlyRent}` : "Included")
          : `$${r.monthlyRent}`,
      pricePeriod: roomIsDailyPriced(r) ? "day" : "month",
      priceMonthlyEquivalent: roomIsDailyPriced(r) ? roomMonthlyEquivalent(r) : undefined,
      priceHeadlineAmount: roomHeadlineAmount(r) ?? undefined,
      availability: "Available now",
      bathroomShareCount: bathroomShareCountForRoom(r.id, sub),
      modal: {
        setupLine: setup,
        bathroomShortLabel: bathroomShort,
        bathroomDetailLine: bathroomDetail || undefined,
        tourEyebrow: "Room tour",
        tourTitle: r.videoDataUrl ? "Uploaded video" : "Video tour",
        tourSubtitle: r.videoDataUrl
          ? "Video submitted with property application."
          : "Add a video in the manager form to replace this placeholder.",
        includedTags: baseTags,
        furnishingDetail: furnish,
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
    fromPrice: `$${from}`,
    roomCount: rs.length,
    remainingNote: `${rs.length} room${rs.length === 1 ? "" : "s"} in this group`,
    floorPlanImageUrl: floorPlanImageUrl ?? resolveFloorPlanImageUrl(floorLabel, rs, sub),
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

/** Normalise utilities to "$X" — strips legacy "/mo" or "/month" suffixes and ensures $ prefix. */
function formatUtilitiesEstimate(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const cleaned = t.replace(/\/mo(nth)?\.?$/i, "").trim();
  const num = parseFloat(cleaned.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num) && num > 0 && /^\$?[\d.,]+$/.test(cleaned)) return `$${num}`;
  return cleaned || undefined;
}

/** Renter-facing furnishing line (preset values expanded; amenities stay separate). */
function formatFurnishingForListing(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (lower === "fully furnished") return "Includes bed, desk, and other important stuff";
  if (lower === "bed only") return "Includes bed";
  if (lower === "bed and desk") return "Includes bed and desk";
  if (lower === "bed, desk, and chair") return "Includes bed, desk, and chair";
  if (lower === "partially furnished") return "Partially furnished — confirm items with leasing";
  return formatFurnishing(raw);
}

/** Normalise furnishing: comma-stored items → human sentence. */
function formatFurnishing(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const items = t
    .replace(/\b(and|&)\b/gi, ",")
    .split(/[,\n]+/)
    .map((s) => s.trim().replace(/^(and|&)\s+/i, ""))
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const cleanItems = deduped.filter((item) => item.toLowerCase() !== "unfurnished");
  if (cleanItems.length === 0 && deduped.some((item) => item.toLowerCase() === "unfurnished")) return "Unfurnished";
  if (cleanItems.length === 0) return undefined;
  if (cleanItems.length === 1) return cleanItems[0];
  return cleanItems.slice(0, -1).join(", ") + " & " + cleanItems[cleanItems.length - 1];
}

function perRoomBundleSummaryLine(r: ManagerRoomSubmission, sub: ManagerListingSubmissionV1): string {
  const utilLine = formatUtilitiesListingLine(resolveRoomUtilitiesPaymentModel(r), r.utilitiesEstimate);
  const f = r.furnishing?.trim();
  const rentLabel =
    isEntireHomeListing(sub) && r.monthlyRent <= 0
      ? "Included in lease"
      : `$${r.monthlyRent}`;
  let s = `${r.name.trim()}: ${rentLabel}`;
  if (utilLine !== "—") s += ` · utilities ${utilLine}`;
  if (f) s += ` · ${f}`;
  return s;
}

function bundleSummaryItems(
  rooms: ManagerRoomSubmission[],
  sub: ManagerListingSubmissionV1,
): { label: string; value: string }[] {
  const entireRent = isEntireHomeListing(sub) ? entireHomeMonthlyRentAmount(sub) : 0;
  const rents =
    entireRent > 0 ? [entireRent] : rooms.map(aggregateRoomRentValue).filter((n) => n > 0);
  const utilities = rooms.map((r) => r.utilitiesEstimate?.trim()).filter(Boolean);
  return [
    { label: "Rooms", value: String(rooms.length) },
    rents.length
      ? {
          label: isEntireHomeListing(sub) ? "Monthly rent" : "Rent range",
          value: isEntireHomeListing(sub) ? `$${rents[0]}/mo` : `$${Math.min(...rents)} - $${Math.max(...rents)}/mo`,
        }
      : { label: "Rent", value: "Ask manager" },
    { label: "Utilities", value: utilitiesListingSummaryLabel(sub) },
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

function twoOrMoreRoomRents(rooms: ManagerRoomSubmission[]): number[] {
  return rooms.map(aggregateRoomRentValue).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
}

function twoOrMoreRoomPriceLabel(rooms: ManagerRoomSubmission[]): string | null {
  const rents = twoOrMoreRoomRents(rooms);
  if (rents.length < 2) return null;
  const start = rents[0]! + rents[1]!;
  return rents.length === 2 ? `$${start}/mo` : `from $${start}/mo`;
}

function twoOrMoreRoomDetailBody(rooms: ManagerRoomSubmission[]): string {
  const rents = twoOrMoreRoomRents(rooms);
  const start = rents[0]! + rents[1]!;
  const cheapestRooms = [...rooms]
    .filter((r) => r.monthlyRent > 0)
    .sort((a, b) => a.monthlyRent - b.monthlyRent)
    .slice(0, 2);
  const example =
    cheapestRooms.length === 2
      ? `${cheapestRooms[0]!.name.trim()} + ${cheapestRooms[1]!.name.trim()}`
      : "";
  return [
    `Rent two or more rooms on one lease. Starting at $${start}/mo (${moneyLabel(rents[0]!)} + ${moneyLabel(rents[1]!)} for the two lowest-priced rooms).`,
    example ? `Example pairing: ${example}.` : "",
    "Each additional room adds its listed monthly rent. Utilities payment varies by room — see room details.",
  ]
    .filter(Boolean)
    .join(" ");
}

function preferredMultiRoomBundle(
  sub: ManagerListingSubmissionV1,
): ManagerBundleRow | undefined {
  const bundles = (sub.bundles ?? []).filter(bundleRowHasContent);
  return (
    bundles.find((b) => (b.includedRoomIds?.length ?? 0) >= 2) ??
    bundles.find((b) => /two or more|group lease|multi/i.test(b.label))
  );
}

function multiRoomLeaseBasicRow(
  rooms: ManagerRoomSubmission[],
  sub: ManagerListingSubmissionV1,
): LeaseBasicRow | null {
  if (isEntireHomeListing(sub)) return null;
  const autoPrice = twoOrMoreRoomPriceLabel(rooms);
  if (!autoPrice) return null;
  const bundle = preferredMultiRoomBundle(sub);
  return {
    id: "lease-multi-room",
    icon: "🏘️",
    title: bundle?.label.trim() || "Two or more rooms",
    detail: bundle?.promo.trim() || "Combine bedrooms on one lease",
    price: bundle?.price.trim() || autoPrice,
    status: "Monthly rent",
    body: bundle?.roomsLine.trim()
      ? `${bundle.promo.trim() || "Group lease available."} ${bundle.roomsLine.trim()}.`
      : twoOrMoreRoomDetailBody(rooms),
  };
}

function buildDefaultMultiRoomBundleCard(
  sub: ManagerListingSubmissionV1,
  rooms: ManagerRoomSubmission[],
): BundleCard | null {
  const price = twoOrMoreRoomPriceLabel(rooms);
  if (!price || isEntireHomeListing(sub)) return null;
  const rents = twoOrMoreRoomRents(rooms);
  const start = rents[0]! + rents[1]!;
  return {
    id: "bundle-multi-room",
    label: "Two or more rooms",
    price,
    promo: "Combine any bedrooms on one lease",
    roomsLine: `${rooms.length} room${rooms.length === 1 ? "" : "s"} available — rent 2 or more together`,
    roomLines: rooms.map((room) => perRoomBundleSummaryLine(room, sub)),
    summaryItems: [
      { label: "Rooms", value: String(rooms.length) },
      { label: "2-room start", value: `$${start}/mo` },
      {
        label: "Rent range",
        value: monthlyRangeLabel(rents).replace(/^from /, ""),
      },
      { label: "Utilities", value: utilitiesListingEstimateLabel(sub) },
    ],
  };
}

function deriveQuickFacts(
  sub: ManagerListingSubmissionV1,
  rooms: ManagerRoomSubmission[],
  property: MockProperty,
): { label: string; value: string }[] {
  const building = property.buildingName?.trim();
  const title = property.title?.trim();
  const facts: { label: string; value: string }[] = [
    { label: "Rooms listed", value: String(rooms.length || property.beds) },
    {
      label: "Bathrooms",
      value: (() => {
        const fromBasics = LISTING_TOTAL_BATH_OPTIONS.find((o) => o.id === sub.listingTotalBathroomsId)?.label;
        if (fromBasics) return fromBasics;
        const n = sub.bathrooms.filter((b) => b.name.trim()).length;
        return n ? String(n) : String(property.baths);
      })(),
    },
    ...(sub.homeStructureNote?.trim() || formatListingBasicsSummary(sub).trim()
      ? [{ label: "Property & layout", value: sub.homeStructureNote.trim() || formatListingBasicsSummary(sub).trim() }]
      : []),
    { label: "Pets", value: sub.petFriendly ? "Pet-friendly (subject to approval)" : "No pets (per submission)" },
  ];
  if (building && building !== title) {
    facts.push({ label: "Building", value: building });
  }
  return facts;
}

function buildBundleCards(sub: ManagerListingSubmissionV1, rooms: ManagerRoomSubmission[], property: MockProperty): BundleCard[] {
  const custom = (sub.bundles ?? []).filter(bundleRowHasContent);
  if (custom.length > 0) {
    return custom.map((b) => {
      const scope = bundleScopeLineFromRow(b, rooms);
      const scopedRooms = (b.includedRoomIds?.length ?? 0) > 0
        ? rooms.filter((room) => b.includedRoomIds?.includes(room.id))
        : rooms;
      return {
        id: b.id,
        label: b.label.trim() || "Package",
        price: b.price.trim() || "—",
        strikethrough: b.strikethrough.trim() || undefined,
        promo: b.promo.trim() || undefined,
        roomsLine: scope || `${scopedRooms.length} room${scopedRooms.length === 1 ? "" : "s"} included`,
        roomLines: scopedRooms.map((room) => perRoomBundleSummaryLine(room, sub)),
        summaryItems: bundleSummaryItems(scopedRooms, sub),
      };
    });
  }

  const entireRent = isEntireHomeListing(sub) ? entireHomeMonthlyRentAmount(sub) : 0;
  if (entireRent > 0) {
    const named = rooms.filter((r) => r.name.trim());
    return [
      {
        id: "bundle-entire-home",
        label: "Entire home",
        price: `$${entireRent}/mo`,
        promo: "One lease for the full unit",
        roomsLine: named.length
          ? `${named.length} bedroom${named.length === 1 ? "" : "s"} · entire home`
          : "Full unit lease",
        roomLines: named.map((room) => perRoomBundleSummaryLine(room, sub)),
        summaryItems: bundleSummaryItems(named.length ? named : rooms, sub),
      },
    ];
  }

  const mids = rooms.map(aggregateRoomRentValue).filter((n) => n > 0);
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
  const multiRoom = buildDefaultMultiRoomBundleCard(sub, rooms);
  if (multiRoom) return [multiRoom];

  const priceSummary = lo === hi ? `$${lo}/mo` : `$${lo}–$${hi}/mo`;

  return [
    {
      id: "bundle-listed-rooms",
      label: "Listed rooms",
      price: `from ${priceSummary}`,
      roomsLine: `${rooms.length} room${rooms.length === 1 ? "" : "s"} available`,
      roomLines: rooms.map((room) => perRoomBundleSummaryLine(room, sub)),
      summaryItems: bundleSummaryItems(rooms, sub),
    },
  ];
}

export function listingRichFromManagerSubmission(
  property: MockProperty,
  incoming: ManagerListingSubmissionV1,
): ListingRichContent {
  const sub = normalizeManagerListingSubmissionV1(incoming);
  const rooms = sub.rooms
    .filter((r) => r.name.trim() || r.monthlyRent > 0)
    .map((r, index) => ({
      ...r,
      name: r.name.trim() || `Room ${index + 1}`,
    }));
  const floorsMap = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const fl = r.floor.trim() || "Floor plan";
    if (!floorsMap.has(fl)) floorsMap.set(fl, []);
    floorsMap.get(fl)!.push(r);
  }
  let idx = 0;
  const floorPlans: ListingFloorCard[] = [...floorsMap.entries()]
    .sort(([a], [b]) => compareFloorLabels(a, b))
    .map(([floorLabel, rs]) => {
      const sortedRooms = [...rs].sort(compareRoomsByFloorThenName);
      idx += 1;
      const card = buildListingFloorCard(
        `floor-${idx}-${floorLabel}`,
        floorLabel,
        sortedRooms,
        sub,
        property,
        resolveFloorPlanImageUrl(floorLabel, sortedRooms, sub),
      );
      return {
        ...card,
        remainingNote: `${sortedRooms.length} room${sortedRooms.length === 1 ? "" : "s"} on this floor`,
      };
    });

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
          photoUrls: b.photoDataUrls.length ? b.photoDataUrls : undefined,
          videoSrc: b.videoDataUrl ?? null,
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
          videoSrc: null,
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
          const location = s.location?.trim() || "";
          return {
            id: s.id,
            name: s.name.trim(),
            detail: location || (access ? `Room access: ${access}` : "Select room access in manager form"),
            useNote: s.detail.trim() || "Details from manager submission.",
            availability: (s.roomAccessIds?.length ?? 0) > 0 ? "Shared" : "—",
            modal: {
              eyebrow: "Shared space",
              tourEyebrow: "Space tour",
              tourTitle: s.name.trim(),
              tourSubtitle: s.detail.trim() || "Shared area for residents.",
              includedTags,
              photoCaptions: ["Common area"],
              photoUrls: s.photoDataUrls.length ? s.photoDataUrls : undefined,
              videoSrc: s.videoDataUrl ?? null,
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
              videoSrc: null,
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
      body: (() => {
        const terms = resolveAllowedLeaseTerms(sub);
        if (terms.length > 0) return `Available lease lengths: ${terms.join(", ")}.`;
        return sub.leaseTermsBody.trim() || "Lease terms will be confirmed with applicants.";
      })(),
    },
    ...(multiRoomLeaseBasicRow(rooms, sub) ? [multiRoomLeaseBasicRow(rooms, sub)!] : []),
    ...(sub.shortTermRentalsAllowed
      ? [
          {
            id: "lease-short-term",
            icon: "🛏️",
            title: "Short-term stay",
            detail: sub.shortTermDeposit?.trim()
              ? `Deposit ${formatListingFeeDisplay(sub.shortTermDeposit)}`
              : "Temporary room stay",
            price: shortTermStayPriceLabel(sub),
            status: "Optional",
            body: shortTermStayDetailBody(sub),
          },
        ]
      : []),
    {
      id: "lease-application",
      icon: "📄",
      title: "Application",
      detail: "Processing",
      price: formatListingFeeDisplay(sub.applicationFee),
      status: "Due with app",
      body: `Application fee: ${formatListingFeeDisplay(sub.applicationFee)} (from submission).`,
    },
    {
      id: "lease-deposit",
      icon: "🔒",
      title: "Security deposit",
      detail: "As submitted",
      price: formatListingFeeDisplay(sub.securityDeposit),
      status: "At signing",
      body: `Security deposit: ${formatListingFeeDisplay(sub.securityDeposit)}.`,
    },
    {
      id: "lease-movein",
      icon: "🧾",
      title: "Move-in charges",
      detail: "At signing",
      price: formatListingFeeDisplay(sub.moveInFee),
      status: "At signing",
      body: `Move-in charges due at signing: ${formatListingFeeDisplay(sub.moveInFee)}.`,
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
  for (const fee of sub.customFees ?? []) {
    if (!fee.label.trim() || !feeMeaningfulForListing(fee.amount)) continue;
    const price = formatListingFeeDisplay(fee.amount);
    const monthly = fee.frequency !== "one-time";
    houseCostRows.push({
      id: `custom-fee-${fee.id}`,
      icon: "💵",
      title: fee.label.trim(),
      detail: monthly ? "Additional monthly charge" : "One-time charge",
      price,
      status: monthly ? "Monthly" : "One-time",
      body: monthly
        ? `${fee.label.trim()}: ${price} per month.`
        : `${fee.label.trim()}: ${price} (one-time).`,
    });
  }

  const amenities = houseWideAmenityItems(sub.amenitiesText);

  const entireRent = isEntireHomeListing(sub) ? entireHomeMonthlyRentAmount(sub) : 0;
  const mids = entireRent > 0 ? [entireRent] : rooms.map(aggregateRoomRentValue).filter((n) => n > 0);
  const monthlyTotals =
    entireRent > 0
      ? rooms
          .filter((r) => r.monthlyRent > 0)
          .map((r) => {
            const utilities = parseMoneyAmount(r.utilitiesEstimate ?? "");
            return utilities > 0 ? entireRent + utilities : entireRent;
          })
          .slice(0, 1)
      : rooms
          .filter((r) => aggregateRoomRentValue(r) > 0)
          .map((r) => {
            // Only a room with an actual utilities estimate contributes: this figure is
            // rendered as "Estimated monthly (rent + utilities estimate)", so a room
            // without one must stay out rather than pass its bare rent off as a total.
            const utilities = parseMoneyAmount(r.utilitiesEstimate ?? "");
            return utilities > 0 ? aggregateRoomRentValue(r) + utilities : null;
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
    floorPlansSectionTitle: undefined,
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

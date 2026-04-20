import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMonthlyRent } from "@/lib/listings-search";
import { paymentAtSigningDetailBody, paymentAtSigningPriceLabel } from "@/lib/rental-application/listing-fees-display";
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

function roomTags(room: ManagerListingSubmissionV1["rooms"][0]): string[] {
  const base = ["Bed", "Desk", "Heating"];
  if (room.bathroomSetup === "private") base.push("Private bath");
  else base.push("Shared bath");
  const extra = room.detail
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);
  return [...new Set([...base, ...extra])].slice(0, 12);
}

export function listingRichFromManagerSubmission(
  property: MockProperty,
  sub: ManagerListingSubmissionV1,
): ListingRichContent {
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
      const setup =
        r.bathroomSetup === "private"
          ? "Private bathroom"
          : `Shared bathroom${r.sharesBathWith.trim() ? ` · ${r.sharesBathWith.trim()}` : ""}`;
      return {
        id: r.id,
        name: r.name.trim(),
        detail: `${r.floor.trim() || "—"} · ${r.detail.trim() || "See room details below."}`,
        price: `$${r.monthlyRent}/month`,
        availability: r.availability.trim() || "Available now",
        modal: {
          setupLine: setup,
          tourEyebrow: "Room tour",
          tourTitle: r.videoDataUrl ? "Uploaded video" : "Video tour",
          tourSubtitle: r.videoDataUrl
            ? "Video submitted with property application."
            : "Add a video in the manager form to replace this placeholder.",
          includedTags: roomTags(r),
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
        availability: b.sharedByRooms.trim() ? "Shared" : "Available now",
        modal: {
          eyebrow: "Bathroom",
          setupCard: b.sharedByRooms.trim()
            ? `Shared by: ${b.sharedByRooms.trim()}`
            : "See building layout for access.",
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
        detail: "Add bathroom details in the manager property form",
        shower: true,
        toilet: true,
        bathtub: false,
        availability: "—",
        modal: {
          eyebrow: "Bathroom",
          setupCard: "Submit fixture and sharing details when adding a property.",
          includedTags: ["Shower", "Toilet"],
          photoCaptions: ["Placeholder"],
        },
      },
    ];
  }

  const sharedSpaces: ListingSharedRow[] = sub.sharedSpacesDescription.trim()
    ? [
        {
          id: "shared-house",
          name: "Shared spaces & amenities",
          detail: "From your submission",
          useNote: sub.sharedSpacesDescription.trim(),
          availability: "Shared",
          modal: {
            eyebrow: "Shared space",
            tourEyebrow: "Space tour",
            tourTitle: "Walkthrough",
            tourSubtitle: "Details from manager submission.",
            includedTags: ["Kitchen", "Laundry", "Common areas"],
            photoCaptions: ["Common area"],
          },
        },
      ]
    : [
        {
          id: "shared-placeholder",
          name: "Shared spaces",
          detail: "Describe kitchens, laundry, and common areas in the form",
          useNote: "No shared-space description was submitted.",
          availability: "—",
          modal: {
            eyebrow: "Shared space",
            tourEyebrow: "Space tour",
            tourTitle: "Tour coming soon",
            tourSubtitle: "Add details when editing the listing.",
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
      detail: sub.paymentAtSigning.trim() ? "Per listing" : "Deposit + move-in (calculated)",
      price: paymentAtSigningPriceLabel(sub),
      status: "At signing",
      body: paymentAtSigningDetailBody(sub),
    },
    {
      id: "lease-utilities",
      icon: "📊",
      title: "Utilities",
      detail: "Estimate",
      price: sub.utilitiesMonthly.trim() || "—",
      status: "Estimated",
      body: sub.utilitiesMonthly.trim() || "Utilities TBD.",
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

  const roomNames = rooms.map((r) => r.name.trim()).join(" · ");
  const bundleCards: BundleCard[] = [
    {
      id: "bundle-all",
      label: "Submitted rooms",
      price: mids.length ? `from $${Math.min(...mids)}/mo` : property.rentLabel,
      roomsLine: roomNames || property.unitLabel,
    },
  ];

  const overview = sub.houseOverview.trim();
  return {
    heroTagline: sub.tagline.trim() || property.tagline,
    heroOverview: overview || undefined,
    priceRangeLabel: `from $${low}–$${high}/mo`,
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
                  detail: sub.houseOverview.trim().slice(0, 160) || "Add rooms in the manager form.",
                  price: property.rentLabel,
                  availability: "See manager",
                  modal: {
                    setupLine: "Submit room details in the property form",
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
    amenities: amenities.length ? amenities : [{ id: "a1", icon: "🏠", label: "See house overview" }],
    bundlesText:
      sub.leaseTermsBody.trim() ||
      "**Four lease options** may be available — confirm with the manager after you apply.",
    bundleCards,
    quickFacts: [
      { label: "Neighborhood", value: property.neighborhood },
      { label: "Rooms listed", value: String(rooms.length || property.beds) },
      { label: "Bathrooms", value: String(sub.bathrooms.filter((b) => b.name.trim()).length || property.baths) },
      { label: "Pets", value: sub.petFriendly ? "Pet-friendly (subject to approval)" : "No pets (per submission)" },
      { label: "Building", value: property.buildingName },
      {
        label: "Overview",
        value:
          sub.houseOverview.trim().slice(0, 80) + (sub.houseOverview.length > 80 ? "…" : "") || "—",
      },
    ],
  };
}

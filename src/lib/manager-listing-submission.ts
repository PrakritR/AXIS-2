/** Full manager “add listing” payload — drives generated listing detail page (localStorage-backed). */

export type PaymentAtSigningOptionId =
  | "security_deposit"
  | "move_in_fee"
  | "first_month_rent"
  | "first_month_utilities";

export const PAYMENT_AT_SIGNING_OPTIONS: readonly { id: PaymentAtSigningOptionId; label: string }[] = [
  { id: "security_deposit", label: "Security deposit" },
  { id: "move_in_fee", label: "Move-in fee" },
  { id: "first_month_rent", label: "First month rent" },
  { id: "first_month_utilities", label: "First month utilities" },
];

export type ManagerRoomSubmission = {
  id: string;
  name: string;
  floor: string;
  monthlyRent: number;
  availability: string;
  detail: string;
  /** Furnishing level or what is included (shown on listing). */
  furnishing: string;
  /** Room-level amenities (lines or comma-separated), shown as chips on the listing. */
  roomAmenitiesText: string;
  photoDataUrls: string[];
  videoDataUrl: string | null;
  /** Estimated monthly utilities for this room (shown on listing). */
  utilitiesEstimate: string;
};

/** Sidebar “Quick facts” rows on the public listing; when empty, facts are auto-derived from the submission. */
export type ManagerQuickFactRow = {
  id: string;
  label: string;
  value: string;
};

/** Rows for the public “Bundles & leasing” table (optional — defaults are generated from rooms). */
export type ManagerBundleRow = {
  id: string;
  label: string;
  /** e.g. from $899/mo or $950/mo */
  price: string;
  strikethrough: string;
  /** Shown as “offer” / promo line when set */
  promo: string;
  /** Secondary line under the bundle name — optional manual override when rooms are picked. */
  roomsLine: string;
  /** Rooms included in this bundle (scope line auto-built from names when set). */
  includedRoomIds?: string[];
};

/** How a room uses a specific bathroom row (optional; improves listing copy). */
export type ManagerBathroomRoomAccessKind = "ensuite" | "shared" | "hall";

export type ManagerBathroomSubmission = {
  id: string;
  name: string;
  location: string;
  shower: boolean;
  toilet: boolean;
  bathtub: boolean;
  /**
   * Which rooms use this bathroom. Exclusive across bathrooms that are **not** `allResidents`
   * (a listed room should appear on at most one of those rows).
   */
  assignedRoomIds: string[];
  /**
   * Hall / whole-house bath everyone shares — no per-room checkboxes; listing shows all bedrooms.
   * Does not claim room ids, so rooms can still be assigned to their suite / shared bath rows.
   */
  allResidents?: boolean;
  /** Optional per-room situation for this bathroom (only meaningful when the room is checked). */
  accessKindByRoomId?: Partial<Record<string, ManagerBathroomRoomAccessKind>>;
};

export type ManagerSharedSpaceSubmission = {
  id: string;
  /** Short label on the listing (e.g. Kitchen, Laundry room). */
  name: string;
  /** Longer description / rules / hours. */
  detail: string;
  /** Rooms with access (same room may have access to multiple shared spaces). */
  roomAccessIds: string[];
};

export type ManagerListingSubmissionV1 = {
  v: 1;
  buildingName: string;
  address: string;
  zip: string;
  neighborhood: string;
  tagline: string;
  petFriendly: boolean;
  /** Long-form house / coliving description shown on listing */
  houseOverview: string;
  /** Quiet hours, guests, smoking, shared spaces — shown on House rules tab */
  houseRulesText: string;
  /** General house photos (common areas, exterior, kitchen) shown at the top of the public listing. */
  housePhotoDataUrls: string[];
  leaseTermsBody: string;
  applicationFee: string;
  securityDeposit: string;
  moveInFee: string;
  /** Charges included in “payment due at signing” (multi-select). */
  paymentAtSigningIncludes: PaymentAtSigningOptionId[];
  houseCostsDetail: string;
  parkingMonthly: string;
  hoaMonthly: string;
  otherMonthlyFees: string;
  sharedSpaces: ManagerSharedSpaceSubmission[];
  /** One amenity per line or comma-separated */
  amenitiesText: string;
  /** When true, applicants/residents see Zelle instructions using `zelleContact`. */
  zellePaymentsEnabled?: boolean;
  /** Phone or email for Zelle (shown to applicants; manager marks payments paid manually). */
  zelleContact?: string;
  /**
   * When Zelle is enabled for the listing, applicants can still use the default “portal / online” path
   * for the application fee (manager marks received). Default true.
   */
  applicationFeeStripeEnabled?: boolean;
  /**
   * When Zelle is enabled, offer Zelle as an application-fee payment path in the apply flow.
   * Default true when Zelle is on; ignored when Zelle is off.
   */
  applicationFeeZelleEnabled?: boolean;
  rooms: ManagerRoomSubmission[];
  bathrooms: ManagerBathroomSubmission[];
  /** Optional bundle rows for the listing; if empty, copy is derived from rooms. */
  bundles: ManagerBundleRow[];
  /** Optional sidebar quick facts; when empty, listing derives defaults from submission. */
  quickFacts: ManagerQuickFactRow[];
};

/** Legacy persisted shapes (optional fields). */
type LegacyListingSubmissionFields = {
  paymentAtSigning?: string;
  utilitiesMonthly?: string;
  sharedSpacesDescription?: string;
};

/** Match legacy free-text room lists ("Room 1, Room 2") to current room ids by name. */
export function matchRoomIdsFromLegacyNames(text: string, rooms: ManagerRoomSubmission[]): string[] {
  if (!text.trim()) return [];
  const parts = text.split(/[,;&]/).map((s) => s.trim()).filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const hit =
      rooms.find((x) => x.name.trim().toLowerCase() === part.toLowerCase()) ??
      rooms.find((x) => x.name.trim().toLowerCase().includes(part.toLowerCase()));
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      ids.push(hit.id);
    }
  }
  return ids;
}

let idCounter = 0;
function rid(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/** Coerces older saved submissions into the current v1 shape (preserves listing data where possible). */
export function normalizeManagerListingSubmissionV1(sub: ManagerListingSubmissionV1): ManagerListingSubmissionV1 {
  const legacy = sub as ManagerListingSubmissionV1 & LegacyListingSubmissionFields;
  const fallbackUtil = legacy.utilitiesMonthly?.trim() ?? "";

  let paymentAtSigningIncludes = sub.paymentAtSigningIncludes;
  if (!Array.isArray(paymentAtSigningIncludes) || paymentAtSigningIncludes.length === 0) {
    paymentAtSigningIncludes = legacy.paymentAtSigning?.trim()
      ? (["security_deposit", "move_in_fee"] as PaymentAtSigningOptionId[])
      : (["security_deposit", "move_in_fee"] as PaymentAtSigningOptionId[]);
  } else {
    const allowed = new Set(PAYMENT_AT_SIGNING_OPTIONS.map((o) => o.id));
    paymentAtSigningIncludes = paymentAtSigningIncludes.filter((id): id is PaymentAtSigningOptionId => allowed.has(id));
    if (paymentAtSigningIncludes.length === 0) {
      paymentAtSigningIncludes = ["security_deposit", "move_in_fee"];
    }
  }

  const rooms = sub.rooms.map((r) => {
    const legacyRoom = r as ManagerRoomSubmission & { bathroomSetup?: string; sharesBathWith?: string };
    return {
      id: legacyRoom.id,
      name: legacyRoom.name ?? "",
      floor: legacyRoom.floor ?? "",
      monthlyRent: legacyRoom.monthlyRent ?? 0,
      availability: legacyRoom.availability ?? "",
      detail: legacyRoom.detail ?? "",
      photoDataUrls: legacyRoom.photoDataUrls ?? [],
      videoDataUrl: legacyRoom.videoDataUrl ?? null,
      utilitiesEstimate:
        typeof legacyRoom.utilitiesEstimate === "string" && legacyRoom.utilitiesEstimate.length > 0
          ? legacyRoom.utilitiesEstimate
          : fallbackUtil,
      furnishing: (() => {
        const f = typeof legacyRoom.furnishing === "string" ? legacyRoom.furnishing : "";
        return f.trim().length === 0 ? "" : f;
      })(),
      roomAmenitiesText:
        typeof (legacyRoom as ManagerRoomSubmission & { roomAmenitiesText?: unknown }).roomAmenitiesText === "string"
          ? (legacyRoom as ManagerRoomSubmission & { roomAmenitiesText: string }).roomAmenitiesText
          : "",
    };
  });

  let bundles = sub.bundles;
  if (!Array.isArray(bundles)) bundles = [];
  bundles = bundles.map((b) => ({
    id: b.id ?? rid("bundle"),
    label: b.label ?? "",
    price: b.price ?? "",
    strikethrough: b.strikethrough ?? "",
    promo: b.promo ?? "",
    roomsLine: b.roomsLine ?? "",
  }));

  let quickFacts = sub.quickFacts;
  if (!Array.isArray(quickFacts)) quickFacts = [];
  quickFacts = quickFacts.map((q) => ({
    id: q.id ?? rid("qf"),
    label: q.label ?? "",
    value: q.value ?? "",
  }));

  const bathrooms = sub.bathrooms.map((b) => {
    const legacyBath = b as ManagerBathroomSubmission & { sharedByRooms?: string };
    let assignedRoomIds = legacyBath.assignedRoomIds;
    if (!Array.isArray(assignedRoomIds)) assignedRoomIds = [];
    if (assignedRoomIds.length === 0 && legacyBath.sharedByRooms?.trim()) {
      assignedRoomIds = matchRoomIdsFromLegacyNames(legacyBath.sharedByRooms, rooms);
    }
    const allResidents = Boolean((legacyBath as ManagerBathroomSubmission).allResidents);
    const rawAccess = (legacyBath as ManagerBathroomSubmission).accessKindByRoomId;
    let accessKindByRoomId: ManagerBathroomSubmission["accessKindByRoomId"] = undefined;
    if (!allResidents && rawAccess && typeof rawAccess === "object") {
      const next: Partial<Record<string, ManagerBathroomRoomAccessKind>> = {};
      for (const [k, v] of Object.entries(rawAccess)) {
        if (v === "ensuite" || v === "shared" || v === "hall") next[k] = v;
      }
      accessKindByRoomId = Object.keys(next).length ? next : undefined;
    }

    return {
      id: legacyBath.id,
      name: legacyBath.name ?? "",
      location: legacyBath.location ?? "",
      shower: legacyBath.shower ?? true,
      toilet: legacyBath.toilet ?? true,
      bathtub: legacyBath.bathtub ?? false,
      assignedRoomIds: allResidents ? [] : assignedRoomIds,
      allResidents,
      accessKindByRoomId: allResidents ? undefined : accessKindByRoomId,
    };
  });

  let sharedSpaces = sub.sharedSpaces;
  if (!Array.isArray(sharedSpaces)) sharedSpaces = [];
  const legacySharedText = (legacy as LegacyListingSubmissionFields).sharedSpacesDescription?.trim();
  if (sharedSpaces.length === 0 && legacySharedText) {
    sharedSpaces = [
      {
        id: rid("sspace"),
        name: "Shared areas",
        detail: legacySharedText,
        roomAccessIds: rooms.map((r) => r.id),
      },
    ];
  } else {
    sharedSpaces = sharedSpaces.map((ss) => ({
      id: ss.id,
      name: ss.name ?? "",
      detail: ss.detail ?? "",
      roomAccessIds: Array.isArray(ss.roomAccessIds) ? [...ss.roomAccessIds] : [],
    }));
  }

  const zelleEnabled = Boolean(sub.zellePaymentsEnabled && sub.zelleContact?.trim());
  let applicationFeeStripeEnabled =
    typeof sub.applicationFeeStripeEnabled === "boolean" ? sub.applicationFeeStripeEnabled : true;
  let applicationFeeZelleEnabled =
    typeof sub.applicationFeeZelleEnabled === "boolean" ? sub.applicationFeeZelleEnabled : zelleEnabled;
  if (!sub.zellePaymentsEnabled) {
    applicationFeeZelleEnabled = false;
  } else if (zelleEnabled && !applicationFeeStripeEnabled && !applicationFeeZelleEnabled) {
    applicationFeeStripeEnabled = true;
    applicationFeeZelleEnabled = true;
  }

  const housePhotoDataUrls = Array.isArray(sub.housePhotoDataUrls)
    ? sub.housePhotoDataUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 12)
    : [];

  const next = {
    ...sub,
    houseRulesText: typeof sub.houseRulesText === "string" ? sub.houseRulesText : "",
    paymentAtSigningIncludes,
    rooms,
    bathrooms,
    sharedSpaces,
    bundles,
    quickFacts,
    applicationFeeStripeEnabled,
    applicationFeeZelleEnabled,
    housePhotoDataUrls,
  };
  delete (next as Record<string, unknown>).sharedSpacesDescription;
  delete (next as Record<string, unknown>).paymentAtSigning;
  delete (next as Record<string, unknown>).utilitiesMonthly;
  return next as ManagerListingSubmissionV1;
}

export function emptyRoom(index: number): ManagerRoomSubmission {
  return {
    id: rid("room"),
    name: `Room ${index + 1}`,
    floor: "",
    monthlyRent: 0,
    availability: "Available now",
    detail: "",
    furnishing: "",
    roomAmenitiesText: "",
    photoDataUrls: [],
    videoDataUrl: null,
    utilitiesEstimate: "",
  };
}

export function emptyBundleRow(): ManagerBundleRow {
  return {
    id: rid("bundle"),
    label: "",
    price: "",
    strikethrough: "",
    promo: "",
    roomsLine: "",
    includedRoomIds: [],
  };
}

export function emptyQuickFactRow(): ManagerQuickFactRow {
  return {
    id: rid("qf"),
    label: "",
    value: "",
  };
}

/** Copy a room for the add-listing form (new id so file inputs / keys stay unique). */
export function duplicateRoomEntry(source: ManagerRoomSubmission): ManagerRoomSubmission {
  return {
    ...source,
    id: rid("room"),
    name: source.name.trim() ? `${source.name.trim()} (copy)` : "Room (copy)",
    photoDataUrls: [...source.photoDataUrls],
    videoDataUrl: source.videoDataUrl,
    utilitiesEstimate: source.utilitiesEstimate ?? "",
    furnishing: source.furnishing ?? "",
    roomAmenitiesText: source.roomAmenitiesText ?? "",
  };
}

export function emptyBathroom(index: number): ManagerBathroomSubmission {
  return {
    id: rid("bath"),
    name: index === 0 ? "Full bath (hall)" : `Bathroom ${index + 1}`,
    location: "",
    shower: true,
    toilet: true,
    bathtub: index === 0,
    assignedRoomIds: [],
    allResidents: false,
    accessKindByRoomId: undefined,
  };
}

export function emptySharedSpace(index: number): ManagerSharedSpaceSubmission {
  return {
    id: rid("sspace"),
    name: index === 0 ? "Kitchen & dining" : `Shared space ${index + 1}`,
    detail: "",
    roomAccessIds: [],
  };
}

export function createDefaultListingSubmission(): ManagerListingSubmissionV1 {
  return {
    v: 1,
    buildingName: "",
    address: "",
    zip: "",
    neighborhood: "",
    tagline: "",
    petFriendly: false,
    houseOverview: "",
    housePhotoDataUrls: [],
    houseRulesText: "",
    leaseTermsBody: "",
    applicationFee: "",
    securityDeposit: "",
    moveInFee: "",
    paymentAtSigningIncludes: ["security_deposit", "move_in_fee"],
    houseCostsDetail: "",
    parkingMonthly: "",
    hoaMonthly: "",
    otherMonthlyFees: "",
    sharedSpaces: [],
    amenitiesText: "",
    zellePaymentsEnabled: false,
    zelleContact: "",
    applicationFeeStripeEnabled: true,
    applicationFeeZelleEnabled: false,
    rooms: [{ ...emptyRoom(0), name: "", availability: "" }],
    bathrooms: [],
    bundles: [],
    quickFacts: [],
  };
}

/** Rebuild a v1 submission from legacy single-unit admin rows (demo bucket round-trips). */
export function legacyAdminFieldsToSubmission(row: {
  buildingName: string;
  address: string;
  zip: string;
  neighborhood: string;
  unitLabel: string;
  beds: number;
  baths: number;
  monthlyRent: number;
  petFriendly: boolean;
  tagline: string;
}): ManagerListingSubmissionV1 {
  const sub = createDefaultListingSubmission();
  sub.buildingName = row.buildingName;
  sub.address = row.address;
  sub.zip = row.zip;
  sub.neighborhood = row.neighborhood;
  sub.tagline = row.tagline;
  sub.petFriendly = row.petFriendly;
  sub.rooms = [{ ...emptyRoom(0), name: row.unitLabel, monthlyRent: row.monthlyRent }];
  const nBaths = Math.max(1, Math.min(Math.floor(row.baths) || 1, 12));
  sub.bathrooms = Array.from({ length: nBaths }, (_, i) => emptyBathroom(i));
  return sub;
}

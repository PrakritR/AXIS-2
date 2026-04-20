/** Full manager “add listing” payload — drives generated listing detail page (demo localStorage). */

export type ManagerRoomSubmission = {
  id: string;
  name: string;
  floor: string;
  monthlyRent: number;
  availability: string;
  detail: string;
  bathroomSetup: "private" | "shared";
  sharesBathWith: string;
  photoDataUrls: string[];
  videoDataUrl: string | null;
};

export type ManagerBathroomSubmission = {
  id: string;
  name: string;
  location: string;
  shower: boolean;
  toilet: boolean;
  bathtub: boolean;
  sharedByRooms: string;
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
  leaseTermsBody: string;
  applicationFee: string;
  securityDeposit: string;
  moveInFee: string;
  paymentAtSigning: string;
  utilitiesMonthly: string;
  houseCostsDetail: string;
  parkingMonthly: string;
  hoaMonthly: string;
  otherMonthlyFees: string;
  sharedSpacesDescription: string;
  /** One amenity per line or comma-separated */
  amenitiesText: string;
  rooms: ManagerRoomSubmission[];
  bathrooms: ManagerBathroomSubmission[];
};

let idCounter = 0;
function rid(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function emptyRoom(index: number): ManagerRoomSubmission {
  return {
    id: rid("room"),
    name: `Room ${index + 1}`,
    floor: "",
    monthlyRent: 0,
    availability: "Available now",
    detail: "",
    bathroomSetup: "shared",
    sharesBathWith: "",
    photoDataUrls: [],
    videoDataUrl: null,
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
    sharedByRooms: "",
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
    petFriendly: true,
    houseOverview: "",
    leaseTermsBody:
      "Describe lease lengths (e.g. 3-, 9-, 12-month and month-to-month), start dates, and any premiums.",
    applicationFee: "$50",
    securityDeposit: "$400",
    moveInFee: "$200",
    paymentAtSigning: "$600",
    utilitiesMonthly: "$95/mo",
    houseCostsDetail:
      "Summarize all recurring costs: rent, utilities, parking, HOA, RUBS, pet fees, etc.",
    parkingMonthly: "",
    hoaMonthly: "",
    otherMonthlyFees: "",
    sharedSpacesDescription:
      "Kitchen, laundry, living room, outdoor space, and how shared areas work.",
    amenitiesText:
      "WiFi\nIn-building laundry\nHeating\nAC",
    rooms: [emptyRoom(0), emptyRoom(1), emptyRoom(2)],
    bathrooms: [emptyBathroom(0), emptyBathroom(1)],
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

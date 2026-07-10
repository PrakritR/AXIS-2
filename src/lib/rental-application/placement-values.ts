import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  getPropertyById,
  getRoomChoiceLabel,
  parseRoomChoiceValue,
} from "@/lib/rental-application/data";
import { resolvePlacementLeaseDates } from "@/lib/rental-application/lease-dates";
import {
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  normalizeManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/parse-money";
import { utilitiesBillableMonthlyAmount } from "@/lib/listing-utilities-payment";

/**
 * Placement / dates / charges for a resident, auto-filled from the application and
 * the listing it references. Mirrors the resolution used by
 * `recordApprovedApplicationCharges` so the read-only manager view shows exactly the
 * amounts that will bill. Client-only: `getPropertyById` reads the manager's listing
 * catalog from local storage.
 */
export type ResolvedPlacementValues = {
  propertyId: string;
  propertyLabel: string;
  roomChoice: string;
  roomLabel: string;
  rentalType: "standard" | "short_term";
  leaseTerm: string;
  leaseStart: string;
  leaseEnd: string;
  signedMonthlyRent: number;
  utilities: number;
  securityDeposit: number;
  moveInFee: number;
  otherCostLabel: string;
  otherCostAmount: number;
  /** Critical field labels that could not be auto-filled from the application or its listing. */
  missing: string[];
};

type NormalizedSub = ReturnType<typeof normalizeManagerListingSubmissionV1>;

/** Mirrors `findRoomInSub` in household-charges so displayed values match billed values. */
function findRoom(sub: NormalizedSub, roomChoice: string, signedRent?: number | null) {
  const { listingRoomId } = parseRoomChoiceValue(roomChoice);
  if (listingRoomId) {
    const byId = sub.rooms.find((r) => r.id === listingRoomId);
    if (byId) return byId;
  }
  if (signedRent && signedRent > 0) {
    const byRent = sub.rooms.filter((r) => r.monthlyRent === signedRent);
    if (byRent.length === 1) return byRent[0]!;
  }
  if (sub.rooms.length === 1) return sub.rooms[0]!;
  return null;
}

export function resolvePlacementValuesForRow(
  row: Pick<
    DemoApplicantRow,
    "application" | "assignedPropertyId" | "assignedRoomChoice" | "propertyId" | "property" | "signedMonthlyRent"
  >,
): ResolvedPlacementValues {
  const app = row.application;
  const propertyId =
    row.assignedPropertyId?.trim() || row.propertyId?.trim() || app?.propertyId?.trim() || "";
  const roomChoice = row.assignedRoomChoice?.trim() || app?.roomChoice1?.trim() || "";

  const prop = getPropertyById(propertyId);
  const sub =
    prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  const room = sub ? findRoom(sub, roomChoice, row.signedMonthlyRent) : null;

  const dates = resolvePlacementLeaseDates({
    leaseTerm: app?.leaseTerm,
    leaseStart: app?.leaseStart,
    leaseEnd: app?.leaseEnd,
    rentalType: app?.rentalType,
  });
  const rentalType: "standard" | "short_term" = app?.rentalType === "short_term" ? "short_term" : "standard";

  // Rent: manager override → signed rent → listing room / entire-home rent.
  const rentOverride = parseMoneyAmount(app?.managerRentOverride ?? "");
  const signedRent = Number(row.signedMonthlyRent ?? 0);
  let signedMonthlyRent = rentOverride > 0 ? rentOverride : signedRent > 0 ? signedRent : 0;
  if (signedMonthlyRent <= 0 && sub) {
    if (isEntireHomeListing(sub)) signedMonthlyRent = entireHomeMonthlyRentAmount(sub);
    else if (room?.monthlyRent && room.monthlyRent > 0) signedMonthlyRent = room.monthlyRent;
  }

  const utilOverride = app?.managerUtilitiesOverride?.trim();
  const utilities = utilOverride
    ? parseMoneyAmount(utilOverride)
    : utilitiesBillableMonthlyAmount(sub ?? undefined, room);

  const depOverride = app?.managerSecurityDepositOverride?.trim();
  const securityDeposit = depOverride ? parseMoneyAmount(depOverride) : parseMoneyAmount(sub?.securityDeposit ?? "");

  const moveOverride = app?.managerMoveInFeeOverride?.trim();
  const moveInFee = moveOverride ? parseMoneyAmount(moveOverride) : parseMoneyAmount(sub?.moveInFee ?? "");

  const otherCostLabel = app?.managerOtherCostLabel?.trim() || "";
  const otherCostAmount = parseMoneyAmount(app?.managerOtherCostAmount ?? "");

  const propertyLabel = prop?.title?.trim() || row.property?.trim() || "";
  const roomLabel = getRoomChoiceLabel(roomChoice) || "";

  const missing: string[] = [];
  if (!propertyId) missing.push("House");
  if (!roomChoice) missing.push("Room");
  if (!(signedMonthlyRent > 0)) missing.push("Signed monthly rent");
  if (!dates.leaseTerm) missing.push("Stay type");
  if (!dates.leaseStart) missing.push("Move-in date");
  if (dates.leaseTerm && dates.leaseTerm !== "Month-to-Month" && !dates.leaseEnd) missing.push("Lease end");

  return {
    propertyId,
    propertyLabel,
    roomChoice,
    roomLabel,
    rentalType,
    leaseTerm: dates.leaseTerm,
    leaseStart: dates.leaseStart,
    leaseEnd: dates.leaseEnd,
    signedMonthlyRent,
    utilities,
    securityDeposit,
    moveInFee,
    otherCostLabel,
    otherCostAmount,
    missing,
  };
}

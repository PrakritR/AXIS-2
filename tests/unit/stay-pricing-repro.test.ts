/**
 * @vitest-environment jsdom
 *
 * The stay-pricing bug, end to end: for one fixture, the lease DOCUMENT and the
 * charge LEDGER must quote the same rate.
 *
 * Both sides are driven here on purpose. `recordApprovedApplicationCharges` is what
 * the manager portal runs on approval, and `buildAiGeneratedLeaseHtml` is what the
 * Leases pipeline runs on generate; before the stay-pricing resolver they read two
 * different "daily rate" fields and disagreed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  readHouseholdCharges,
  recordApprovedApplicationCharges,
  removeResidentHouseholdPaymentData,
} from "@/lib/household-charges";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow } from "@/lib/manager-applications-storage";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

const MANAGER_ID = "mgr-stay-pricing";

/** Fremont is the reported case: California, but not San Francisco. */
const FREMONT = { address: "3200 Walnut Ave, Fremont, CA", zip: "94538", neighborhood: "Central Fremont" };

function room(over: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  const base = createDefaultListingSubmission().rooms[0]!;
  return { ...base, id: "room-1", name: "Room 1", monthlyRent: 1200, ...over } as ManagerRoomSubmission;
}

function seedListing(
  propertyId: string,
  r: ManagerRoomSubmission,
  subOver: Partial<ManagerListingSubmissionV1> = {},
): MockProperty {
  const sub = { ...createDefaultListingSubmission(), ...subOver };
  sub.rooms = [r];
  sub.securityDeposit = subOver.securityDeposit ?? "900";
  const property: MockProperty = {
    id: propertyId,
    title: "Walnut Ave House",
    tagline: "Rooms by the day",
    ...FREMONT,
    beds: 1,
    baths: 1,
    rentLabel: "$55/day",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Walnut Ave House",
    unitLabel: "Room 1",
    adminPublishLive: true,
    managerUserId: MANAGER_ID,
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
  return property;
}

function application(propertyId: string, over: Partial<RentalWizardFormState> = {}): Partial<RentalWizardFormState> {
  return {
    propertyId,
    roomChoice1: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
    fullLegalName: "Dana Tenant",
    email: "dana@example.com",
    leaseTerm: "Custom",
    leaseStart: "2026-03-10",
    leaseEnd: "2026-03-20",
    rentalType: "standard",
    ...over,
  };
}

function applicantRow(propertyId: string, email: string, app: Partial<RentalWizardFormState>): DemoApplicantRow {
  return {
    id: `app-${email}`,
    name: "Dana Tenant",
    email,
    property: "Walnut Ave House",
    propertyId,
    assignedPropertyId: propertyId,
    assignedRoomChoice: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
    managerUserId: MANAGER_ID,
    application: app,
  } as unknown as DemoApplicantRow;
}

/** Every rent-ish charge for this resident (daily rooms bill "rent", short stays bill "stay_total"). */
function rentCharges(email: string) {
  return readHouseholdCharges()
    .filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase())
    .filter((c) => c.kind.includes("rent") || c.kind === "stay_total")
    .map((c) => ({ title: c.title, amount: c.amountLabel }));
}

function money(label: string): number {
  return Number(String(label).replace(/[^0-9.]/g, "")) || 0;
}

/** Everything the ledger will bill this resident, summed. */
function ledgerTotal(email: string): number {
  return Number(
    readHouseholdCharges()
      .filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase())
      .reduce((sum, c) => sum + money(c.amountLabel), 0)
      .toFixed(2),
  );
}

/** The "Total due" the short-stay agreement states. */
function documentTotalDue(html: string): number {
  const table = html.split("<h2>4. Payment</h2>")[1]?.split("</table>")[0] ?? "";
  const row = table.split("<tr").find((r) => r.includes("Total due")) ?? "";
  return money(row.replace(/<[^>]*>/g, " ").replace("Total due", ""));
}

function leaseHtml(app: Partial<RentalWizardFormState>): string {
  return buildAiGeneratedLeaseHtml(leaseContextFromApplication(app));
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("stay pricing: document and ledger agree", () => {
  it("1. daily-priced room with short-term rentals UNTICKED still gets the short-term stay agreement", () => {
    const email = "untick@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-untick";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }), {
      shortTermRentalsAllowed: false,
    });
    const app = application(propertyId);

    // Mar 10 → Mar 20 2026 is an 11-day stay: 11 × $55 = $605.
    recordApprovedApplicationCharges(applicantRow(propertyId, email, app), MANAGER_ID, true);
    expect(rentCharges(email)[0]?.amount).toBe("$605.00");

    const html = leaseHtml(app);
    expect(html).toContain("SHORT-TERM ROOM STAY AGREEMENT (11-Day Stay)");
    expect(html).toContain("$55.00 per day");
    expect(html).toContain("$605.00");
  });

  it("2. room daily price beats the listing shortTermDailyCost on BOTH sides", () => {
    const email = "conflict@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-conflict";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }), {
      shortTermRentalsAllowed: true,
      shortTermDailyCost: "40",
      shortTermDeposit: "300",
    });
    const app = application(propertyId, { rentalType: "short_term", leaseTerm: "Short-Term Stay" });

    recordApprovedApplicationCharges(applicantRow(propertyId, email, app), MANAGER_ID, true);
    expect(rentCharges(email)[0]?.amount).toBe("$605.00");

    const html = leaseHtml(app);
    expect(html).toContain("$55.00 per day");
    expect(html).not.toContain("$40.00 per day");
    expect(html).toContain("$605.00");
  });

  it("3. blank listing short-term fields render no em-dash when the room carries a daily price", () => {
    const email = "blank@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-blank";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }), {
      shortTermRentalsAllowed: true,
      shortTermDailyCost: "",
      shortTermDeposit: "",
    });
    const app = application(propertyId, { rentalType: "short_term", leaseTerm: "Short-Term Stay" });

    const html = leaseHtml(app);
    expect(html).toContain("$55.00 per day");
    expect(html).not.toContain("— per day");
  });

  it("4. a negotiated monthly rent still beats the room's daily basis", () => {
    const email = "override@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-override";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }));
    const app = application(propertyId, { managerRentOverride: "1500" });

    const html = leaseHtml(app);
    expect(html).toContain("RESIDENTIAL ROOM RENTAL AGREEMENT");
    expect(html).toContain("$1,500.00");
    expect(html).not.toContain("SHORT-TERM ROOM STAY AGREEMENT");
  });

  it("5. REGRESSION: a monthly room is untouched", () => {
    const email = "monthly@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-monthly";
    seedListing(propertyId, room({ monthlyRent: 1200 }));
    const app = application(propertyId);

    const html = leaseHtml(app);
    expect(html).toContain("RESIDENTIAL ROOM RENTAL AGREEMENT");
    expect(html).toContain("$1200.00 / month");
    expect(html).not.toContain("SHORT-TERM ROOM STAY AGREEMENT");
  });

  it("6. uploaded-template summary labels a daily rate as daily, not Monthly rent", () => {
    const propertyId = "prop-stay-template";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }), {
      leaseConfigMode: "custom",
      leaseCustomKind: "document",
      leaseTemplateDocUrl: "https://x/storage/lease-template.pdf",
      leaseTemplateDocName: "House lease.pdf",
    });

    const html = leaseHtml(application(propertyId));
    expect(html).toContain("<th>Daily rent</th>");
    expect(html).not.toContain("<th>Monthly rent</th>");
  });

  it("9. THE INVARIANT: the stay agreement's Total due equals every charge the ledger writes", () => {
    // This is the whole point of the resolver. The document quoted rent + deposit only, while
    // the ledger also billed prorated utilities and a move-in fee.
    //
    // The stay is placed in a FUTURE month on purpose, computed from the clock rather than
    // hardcoded so it stays future forever: the recurring generator only looks forward, so a
    // past-dated stay silently skips the double-billing path this pins.
    const email = "total@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-total";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55, utilitiesEstimate: "120" }), {
      securityDeposit: "900",
      moveInFee: "300",
      applicationFee: "",
    });

    // A 31-day month two months out, days 3..13 → an 11-day stay.
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const ym = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    const app = application(propertyId, { leaseStart: `${ym}-03`, leaseEnd: `${ym}-13` });

    recordApprovedApplicationCharges(applicantRow(propertyId, email, app), MANAGER_ID, true);

    const expectedUtilities = Number((120 * (11 / daysInMonth)).toFixed(2));
    const expected = Number((11 * 55 + expectedUtilities + 900 + 300).toFixed(2));
    expect(documentTotalDue(leaseHtml(app))).toBe(ledgerTotal(email));
    expect(documentTotalDue(leaseHtml(app))).toBe(expected);
  });

  it("10. a future-dated lease is not billed twice for its move-in month", () => {
    // Regression: the recurring generator always looked one month ahead, even when that month
    // was BEFORE the profile's start month. A profile deliberately starts the month AFTER
    // move-in because the move-in month is already covered by the upfront charges, so for any
    // lease starting in a future month the same month was billed twice. Monthly rooms too.
    const email = "double@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-double";
    seedListing(propertyId, room({ monthlyRent: 1200 }), { applicationFee: "" });

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const ym = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    const app = application(propertyId, { leaseStart: `${ym}-03`, leaseEnd: `${ym}-13` });

    recordApprovedApplicationCharges(applicantRow(propertyId, email, app), MANAGER_ID, true);

    // The upfront prorated first/last-month charges are the legacy monthly path and stay.
    // What must NOT exist is a recurring "rent" row for the move-in month, which the profile
    // deliberately does not cover.
    const recurring = readHouseholdCharges().filter(
      (c) => c.residentEmail.toLowerCase() === email && (c.kind === "rent" || c.kind === "utilities"),
    );
    expect(recurring.map((c) => `${c.kind} ${c.rentMonth}`)).toEqual([]);
  });

  it("8. a multi-month daily-priced tenancy keeps the full residential lease", () => {
    const email = "longdaily@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-stay-longdaily";
    seedListing(propertyId, room({ rentBasis: "daily", dailyRentPrice: 55 }));
    // Mar 10 -> Jun 12: the ledger bills four recurring monthly rent charges, so the guest
    // must NOT receive a lodger agreement stating one up-front stay total.
    const app = application(propertyId, { leaseStart: "2026-03-10", leaseEnd: "2026-06-12" });

    recordApprovedApplicationCharges(applicantRow(propertyId, email, app), MANAGER_ID, true);
    expect(rentCharges(email).length).toBeGreaterThan(1);

    const html = leaseHtml(app);
    expect(html).toContain("RESIDENTIAL ROOM RENTAL AGREEMENT");
    expect(html).not.toContain("SHORT-TERM ROOM STAY AGREEMENT");
    expect(html).not.toContain("Lodger Status");
    // The federally required disclosure that the short-term document does not carry.
    expect(html).toContain("Lead-Based Paint Disclosure");
  });

  it("7. a California property outside San Francisco does not claim San Francisco", () => {
    const propertyId = "prop-stay-fremont";
    seedListing(propertyId, room({ monthlyRent: 1200 }));

    const html = leaseHtml(application(propertyId));
    expect(html).toContain("State of California");
    expect(html).not.toContain("City and County of San Francisco");
    expect(html).not.toContain("San Francisco Rent Ordinance");
  });
});

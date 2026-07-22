import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import { LEASE_AI_REVIEW_DISCLAIMER } from "@/lib/lease-templates/types";
import { resolveApplicationPersonalFields } from "@/lib/application-personal-fields";

describe("generated-lease", () => {
  it("builds lease context from application snapshot", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication({
      ...app,
      propertyId: app.propertyId,
    });
    const withSeattle = {
      ...ctx,
      leasedRoom: undefined,
      listingProperty: ctx.listingProperty
        ? { ...ctx.listingProperty, address: "5259 Brooklyn Ave NE, Seattle, WA", neighborhood: "Seattle" }
        : ctx.listingProperty,
    };
    expect(withSeattle.application.fullLegalName).toContain("Jordan");
    expect(withSeattle.generatedAtIso).toBeTruthy();
    const html = buildAiGeneratedLeaseHtml(withSeattle);
    expect(html).not.toContain(LEASE_AI_REVIEW_DISCLAIMER);
    expect(html).toContain("State of Washington");
  });

  it("includes phone, email, and date of birth in generated lease html", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const withSeattle = {
      ...ctx,
      leasedRoom: undefined,
      listingProperty: ctx.listingProperty
        ? { ...ctx.listingProperty, address: "5259 Brooklyn Ave NE, Seattle, WA", neighborhood: "Seattle" }
        : undefined,
    };
    const html = buildAiGeneratedLeaseHtml(withSeattle);
    expect(html).toContain("(206) 555-0142");
    expect(html).toContain("jordan.lee@example.com");
    expect(html).toContain("1998-03-14");
  });

  it("renders San Francisco governing law when address is in SF", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const baseListing = ctx.listingProperty ?? {
      id: "sf-test",
      title: "SF House",
      tagline: "",
      address: "",
      zip: "94103",
      neighborhood: "SOMA",
      beds: 1,
      baths: 1,
      rentLabel: "$1000",
      available: "Now",
      petFriendly: false,
      buildingId: "b1",
      buildingName: "SF House",
      unitLabel: "Room 1",
      adminPublishLive: true,
    };
    const sfCtx = {
      ...ctx,
      leasedRoom: undefined,
      listingProperty: {
        ...baseListing,
        address: "123 Market St, San Francisco, CA",
        neighborhood: "SOMA",
      },
    };
    const html = buildAiGeneratedLeaseHtml(sfCtx);
    expect(html).toContain("State of California");
    expect(html).toContain("San Francisco");
    expect(html).not.toContain(LEASE_AI_REVIEW_DISCLAIMER);
  });

  it("fills personal fields from row-level fallbacks when application snapshot is sparse", () => {
    const personal = resolveApplicationPersonalFields({
      name: "Sam Rivera",
      email: "sam@example.com",
      application: {
        phone: "(206) 555-0199",
        dateOfBirth: "1995-07-04",
      },
    });
    const ctx = leaseContextFromApplication(personal);
    expect(ctx.application.fullLegalName).toBe("Sam Rivera");
    expect(ctx.application.email).toBe("sam@example.com");
    expect(ctx.application.phone).toBe("(206) 555-0199");
    expect(ctx.application.dateOfBirth).toBe("1995-07-04");
  });

  it("renders bundle premises and bundle price for bundle applications", () => {
    const app = { ...snapshotJordanLee(), bundleId: "bundle-two", roomChoice1: "", roomChoice2: "", roomChoice3: "" };
    const ctx = leaseContextFromApplication(app);
    const submission = {
      v: 1,
      buildingName: "Alder Row",
      bathrooms: [],
      customLeaseTerms: [],
      customApplicationFields: [],
      rooms: [
        { id: "room-1", name: "Room 1", monthlyRent: 1150 },
        { id: "room-2", name: "Room 2", monthlyRent: 1100 },
        { id: "room-3", name: "Room 3", monthlyRent: 1050 },
      ],
      bundles: [
        {
          id: "bundle-two",
          label: "Two or more rooms",
          price: "$2,150/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "",
          includedRoomIds: ["room-1", "room-2"],
        },
      ],
    } as unknown as NonNullable<typeof ctx.submission>;
    const html = buildAiGeneratedLeaseHtml({ ...ctx, leasedRoom: undefined, submission });
    expect(html).toContain("Two or more rooms");
    expect(html).toContain("Room 1, Room 2");
    expect(html).toContain("$2,150/mo");
  });

  const RESIDENT_RESPONSIBLE_SENTENCE = "This estimate reflects the utilities the Resident is responsible for above.";
  const NO_BREAKDOWN_SENTENCE =
    "This covers a prorated share of household utilities including electricity, gas, water, sewer, trash, and high-speed internet as applicable to this property.";
  const ALL_INCLUDED_SENTENCE =
    "All utilities and services listed above are included in the monthly rent or paid by Landlord, up to any allowance shown, and no separate monthly utilities / RUBS charge is due from Resident.";

  const UTILITIES_FIGURE = "$175.00";
  const NO_SEPARATE_CHARGE = "None — included in rent or paid by Landlord";

  function leaseHtmlWithUtilities(leaseUtilities?: unknown[], appOverrides?: Record<string, unknown>): string {
    const ctx = leaseContextFromApplication({
      ...snapshotJordanLee(),
      managerUtilitiesOverride: UTILITIES_FIGURE,
      ...(appOverrides ?? {}),
    });
    const submission = {
      ...(ctx.submission ?? { v: 1, rooms: [], bundles: [], bathrooms: [] }),
      v: 1,
      ...(leaseUtilities ? { leaseUtilities } : {}),
    } as unknown as NonNullable<typeof ctx.submission>;
    return buildAiGeneratedLeaseHtml({
      ...ctx,
      submission,
      leasedRoom: undefined,
      listingProperty: ctx.listingProperty
        ? {
            ...ctx.listingProperty,
            address: "5259 Brooklyn Ave NE, Seattle, WA",
            neighborhood: "Seattle",
            listingSubmission: submission,
          }
        : ctx.listingProperty,
    });
  }

  it("renders the per-utility responsibility breakdown in the lease when configured", () => {
    const html = leaseHtmlWithUtilities([
      { kind: "electricity", paidBy: "resident", setUpBy: "resident" },
      { kind: "water", paidBy: "included_in_rent", setUpBy: "manager", allowance: "$60/mo" },
      { kind: "other", paidBy: "manager", setUpBy: "manager", label: "Landscaping", notes: "weekly service" },
    ]);
    expect(html).toContain("Account set up by");
    expect(html).toContain("Included up to $60/mo");
    expect(html).toContain("Landscaping");
    expect(html).toContain("Landlord pays");
    expect(html).toContain(RESIDENT_RESPONSIBLE_SENTENCE);
    expect(html).not.toContain(ALL_INCLUDED_SENTENCE);
    expect(html).toContain(UTILITIES_FIGURE);
    expect(html).not.toContain(NO_SEPARATE_CHARGE);
  });

  it("keeps the standard utilities prose when no breakdown is configured", () => {
    const html = leaseHtmlWithUtilities();
    expect(html).toContain(NO_BREAKDOWN_SENTENCE);
    expect(html).not.toContain(RESIDENT_RESPONSIBLE_SENTENCE);
    expect(html).not.toContain("Account set up by");
    expect(html).toContain(UTILITIES_FIGURE);
    expect(html).not.toContain(NO_SEPARATE_CHARGE);
  });

  it("does not claim the resident is responsible when no utility is resident-paid", () => {
    const html = leaseHtmlWithUtilities([
      { kind: "electricity", paidBy: "included_in_rent", setUpBy: "manager" },
      { kind: "water", paidBy: "included_in_rent", setUpBy: "manager", allowance: "$60/mo" },
      { kind: "trash", paidBy: "manager", setUpBy: "manager" },
    ]);
    expect(html).toContain("Account set up by");
    expect(html).toContain(ALL_INCLUDED_SENTENCE);
    expect(html).not.toContain(RESIDENT_RESPONSIBLE_SENTENCE);
    expect(html).not.toContain(NO_BREAKDOWN_SENTENCE);
    expect(html).not.toContain(UTILITIES_FIGURE);
    expect(html).not.toContain("estimated monthly utilities / RUBS charge");
    expect(html.match(new RegExp(NO_SEPARATE_CHARGE, "g"))?.length).toBe(2);
  });

  it("does not prorate a utilities estimate the breakdown says is included in rent", () => {
    const allIncluded = [
      { kind: "electricity", paidBy: "included_in_rent", setUpBy: "manager" },
      { kind: "water", paidBy: "included_in_rent", setUpBy: "manager" },
    ];
    const residentPaid = [
      { kind: "electricity", paidBy: "resident", setUpBy: "resident" },
      { kind: "water", paidBy: "included_in_rent", setUpBy: "manager" },
    ];
    const midMonth = { leaseStart: "2026-06-15", managerRentOverride: "$1800" };
    const withResidentPaid = leaseHtmlWithUtilities(residentPaid, midMonth);
    expect(withResidentPaid).toContain("Prorated First Month");
    expect(withResidentPaid).toContain("<td>Utilities estimate</td>");

    const withNoneResidentPaid = leaseHtmlWithUtilities(allIncluded, midMonth);
    expect(withNoneResidentPaid).toContain("Prorated First Month");
    expect(withNoneResidentPaid).not.toContain("<td>Utilities estimate</td>");
  });

  it("renders entire-home premises and rent for whole-house applications", () => {
    const app = { ...snapshotJordanLee(), bundleId: "", roomChoice1: "some-property-id", roomChoice2: "", roomChoice3: "" };
    const ctx = leaseContextFromApplication(app);
    const submission = {
      v: 1,
      buildingName: "Meadow Brook Village",
      listingPlaceCategoryId: "entire_home",
      entireHomeMonthlyRent: 2800,
      bathrooms: [],
      customLeaseTerms: [],
      customApplicationFields: [],
      rooms: [],
      bundles: [],
    } as unknown as NonNullable<typeof ctx.submission>;
    const html = buildAiGeneratedLeaseHtml({ ...ctx, leasedRoom: undefined, submission });
    expect(html).toContain("Entire home");
    expect(html).toContain("$2800.00 / month");
  });
});

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

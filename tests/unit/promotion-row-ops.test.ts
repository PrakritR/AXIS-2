import { describe, expect, it } from "vitest";
import { composeFallbackFlyerCopy, type ManagerPromotionRow } from "@/lib/promotion-flyer";
import { readFlyerEntries } from "@/lib/promotion-flyer";
import { removeFlyerEntryFromRow } from "@/lib/promotion-row-ops";

const inputs = {
  headline: "Bright loft",
  sellingPoints: "Deck",
  price: "$2,400/mo",
  promo: "",
  cta: "Tour",
  contact: "leasing@example.com",
  tone: "Warm & welcoming",
  address: "123 Main",
  customDetails: "",
};

function legacyFlyerRow(): ManagerPromotionRow {
  const now = "2026-06-01T12:00:00.000Z";
  const copy = composeFallbackFlyerCopy(inputs, "Alpha Lofts");
  return {
    id: "promo-legacy",
    managerUserId: "mgr-1",
    propertyId: "listing-a",
    propertyLabel: "Alpha Lofts",
    title: "Flyer",
    theme: "cobalt",
    flyerSize: "letter",
    template: "showcase",
    status: "generated",
    inputs,
    copy,
    textCopy: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("promotion row delete", () => {
  it("readFlyerEntries does not resurrect legacy copy when flyerCopies is empty", () => {
    const row = legacyFlyerRow();
    expect(readFlyerEntries(row)).toHaveLength(1);
    expect(readFlyerEntries({ ...row, flyerCopies: [] })).toHaveLength(0);
  });

  it("removeFlyerEntryFromRow clears a legacy-only flyer and drops the row when empty", () => {
    const row = legacyFlyerRow();
    const entryId = `${row.id}::flyer-0`;
    const next = removeFlyerEntryFromRow(row, entryId);
    expect(next).toBeNull();
    expect(readFlyerEntries({ ...row, flyerCopies: [], copy: null })).toHaveLength(0);
  });

  it("removeFlyerEntryFromRow removes one flyer variant but keeps the row when text remains", () => {
    const row = legacyFlyerRow();
    const now = row.createdAt;
    const entry = readFlyerEntries(row)[0]!;
    const withMulti = {
      ...row,
      flyerCopies: [entry],
      textCopies: [
        {
          id: "text-1",
          title: "Blurb",
          copy: {
            format: "social_post" as const,
            hook: "Hi",
            body: "Body",
            ctaLine: "",
            hashtags: "",
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const next = removeFlyerEntryFromRow(withMulti, entry.id);
    expect(next).not.toBeNull();
    expect(readFlyerEntries(next!)).toHaveLength(0);
    expect(next!.copy).toBeNull();
  });
});

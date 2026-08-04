import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { getListingRichContent } from "@/data/listing-rich-content";

/**
 * F-DRAFT-2: a draft listing preview printed "from $500–$100/mo" — the low
 * bound five times the high bound. The fallback band ran `low = max(500, mid -
 * 125)` against `high = mid + 100`, so any rent under $400/mo (including a
 * draft's $0) came out backwards.
 */

function property(over: Partial<MockProperty>): MockProperty {
  return {
    id: "mgr-draft-1",
    title: "Audit Test Draft House",
    tagline: "",
    address: "",
    zip: "98107",
    neighborhood: "Ballard",
    beds: 2,
    baths: 1,
    rentLabel: "",
    available: "",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Audit Test Draft House",
    unitLabel: "",
    ...over,
  } as MockProperty;
}

function bounds(label: string): [number, number] | null {
  const match = label.match(/\$([\d,]+)[–-]\$([\d,]+)/);
  if (!match) return null;
  return [Number(match[1]!.replace(/,/g, "")), Number(match[2]!.replace(/,/g, ""))];
}

describe("listing fallback price range (F-DRAFT-2)", () => {
  it("shows no price at all for a draft with no rent, rather than an invented one", () => {
    // A draft's label is literally "$0" — `buildMockPropertyFromDraft` writes
    // `rentLabel: \`$${monthlyRent}\`` and a draft with no rent has monthlyRent 0.
    // That is exactly the input that printed "from $500–$100/mo".
    for (const label of ["$0", "$0/mo", "$0.00/mo"]) {
      const rich = getListingRichContent(property({ rentLabel: label }));
      expect(rich.priceRangeLabel, label).toBe("—");
      expect(rich.startingRentLabel, label).toBe("—");
    }
  });

  it("leaves the legacy unparseable-label fallback band alone", () => {
    // Not a draft: an old mock listing with no machine-readable rent still gets
    // the generic band it always had. Only a stated zero suppresses the price.
    expect(getListingRichContent(property({ rentLabel: "" })).priceRangeLabel).toBe("from $750–$975/mo");
  });

  it("never prints a backwards range for a genuinely low rent", () => {
    for (const rent of ["$100/mo", "$250/mo", "$350/mo", "$399/mo", "$875/mo", "$2,400/mo"]) {
      const label = getListingRichContent(property({ rentLabel: rent })).priceRangeLabel;
      const range = bounds(label);
      expect(range, `${rent} → ${label}`).not.toBeNull();
      expect(range![0], `${rent} → ${label}`).toBeLessThanOrEqual(range![1]);
    }
  });

  it("never prints a band whose low bound exceeds the rent shown beside it", () => {
    // A $450 listing used to render "$450/mo" directly above "from $500–$550/mo"
    // because of the $500 floor — two different prices for one unit, which is
    // the same self-contradiction F-DRAFT-2 is about.
    for (const rent of ["$100/mo", "$250/mo", "$450/mo", "$499/mo", "$875/mo"]) {
      const rich = getListingRichContent(property({ rentLabel: rent }));
      const range = bounds(rich.priceRangeLabel)!;
      const stated = Number(rich.startingRentLabel.replace(/[^\d.]/g, ""));
      expect(range[0], `${rent} → ${rich.priceRangeLabel}`).toBeLessThanOrEqual(stated);
      expect(range[1], `${rent} → ${rich.priceRangeLabel}`).toBeGreaterThanOrEqual(stated);
    }
  });

  it("still bands a normal rent around its value", () => {
    const rich = getListingRichContent(property({ rentLabel: "$875/mo" }));
    expect(rich.priceRangeLabel).toBe("from $750–$975/mo");
    expect(rich.startingRentLabel).toBe("$875/mo");
  });
});

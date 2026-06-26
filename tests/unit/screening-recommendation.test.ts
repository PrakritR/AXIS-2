import { describe, expect, it } from "vitest";
import { buildScreeningRecommendation, creditRatingFromScore } from "@/lib/screening/recommendation";

describe("screening recommendation", () => {
  it("rates excellent credit", () => {
    expect(creditRatingFromScore(760)).toBe("excellent");
  });

  it("builds strong_yes when credit and background are clean", () => {
    const result = buildScreeningRecommendation({
      vendor: {
        externalOrderId: "abc",
        status: "complete",
        creditScore: 760,
        criminalFlags: 0,
        evictionFlags: 0,
        rawResultLabel: "Cleared",
      },
      application: {
        monthlyIncome: "4500",
        notEmployed: false,
        employer: "Acme Co",
      } as never,
      monthlyRentCents: 120_000,
    });
    expect(result.recommendation).toBe("strong_yes");
    expect(result.pros.length).toBeGreaterThan(0);
  });

  it("flags concerns for criminal hits", () => {
    const result = buildScreeningRecommendation({
      vendor: {
        externalOrderId: "abc",
        status: "complete",
        creditScore: 710,
        criminalFlags: 1,
        evictionFlags: 0,
      },
      application: null,
      monthlyRentCents: null,
    });
    expect(result.recommendation).toBe("concerns");
    expect(result.cons.some((line) => line.includes("criminal"))).toBe(true);
    expect(result.adverseActionRequired).toBe(true);
  });
});

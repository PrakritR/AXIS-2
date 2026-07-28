/**
 * `resolveStayPricing` in isolation: the one place that decides whether a placement is a
 * short stay, which rate is active, and which deposit applies. The lease document and the
 * charge ledger both read it, so its precedence IS the contract between them.
 */
import { describe, expect, it } from "vitest";
import { resolveStayPricing, type RoomPricingLike } from "@/lib/room-pricing";

const DAILY_ROOM: RoomPricingLike = { monthlyRent: 1200, rentBasis: "daily", dailyRentPrice: 55 };
const MONTHLY_ROOM: RoomPricingLike = { monthlyRent: 1200, rentBasis: "monthly" };
/** Short stays are OFFERED here; the deposit/rate fallbacks are the same as SUB. */
const SUB = {
  shortTermDailyCost: "40",
  shortTermDeposit: "300",
  securityDeposit: "900",
  shortTermRentalsAllowed: true,
};
/** Identical listing, except the manager never ticked "short-term rentals allowed". */
const SUB_NO_SHORT_STAYS = { ...SUB, shortTermRentalsAllowed: false };

describe("resolveStayPricing", () => {
  it("treats a SHORT daily-priced stay on a short-stay listing as short, even on a standard application", () => {
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "standard", leaseStart: "2026-03-10", leaseEnd: "2026-03-20" },
    });
    expect(stay.stayKind).toBe("short");
    expect(stay.basis).toBe("daily");
    expect(stay.dailyRate).toBe(55);
    expect(stay.source).toBe("room");
  });

  it("defaults a daily room with unknown dates to a tenancy, not a lodger stay", () => {
    // Fail safe: with no dates we cannot prove the stay is short, and the expensive mistake
    // is handing a real tenant a document that disclaims tenancy.
    const stay = resolveStayPricing({ room: DAILY_ROOM, submission: SUB, application: { rentalType: "standard" } });
    expect(stay.stayKind).toBe("long");
    expect(stay.basis).toBe("daily");
  });

  it("lets the room's daily price beat the listing shortTermDailyCost", () => {
    const stay = resolveStayPricing({ room: DAILY_ROOM, submission: SUB, application: { rentalType: "short_term" } });
    expect(stay.dailyRate).toBe(55);
    expect(stay.source).toBe("room");
  });

  it("falls back to the listing nightly rate when the room is not daily-priced", () => {
    const stay = resolveStayPricing({ room: MONTHLY_ROOM, submission: SUB, application: { rentalType: "short_term" } });
    expect(stay.stayKind).toBe("short");
    expect(stay.dailyRate).toBe(40);
    expect(stay.source).toBe("listing");
  });

  it("reports no daily rate when neither the room nor the listing sets one", () => {
    const stay = resolveStayPricing({
      room: MONTHLY_ROOM,
      submission: { securityDeposit: "900" },
      application: { rentalType: "short_term" },
    });
    expect(stay.dailyRate).toBeUndefined();
    expect(stay.stayKind).toBe("short");
  });

  it("lets a negotiated monthly rent beat the room's daily basis", () => {
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "standard", managerRentOverride: "1500" },
    });
    expect(stay.stayKind).toBe("long");
    expect(stay.basis).toBe("monthly");
    expect(stay.monthlyRate).toBe(1500);
    expect(stay.source).toBe("application_override");
  });

  it("uses a signed rent when there is no manager override", () => {
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "standard", signedMonthlyRent: 1425 },
    });
    expect(stay.monthlyRate).toBe(1425);
    expect(stay.source).toBe("application_override");
  });

  it("does NOT let a negotiated monthly rent convert an explicit short stay to monthly", () => {
    // The short-term charge branch ignores managerRentOverride, so the document must too,
    // or the two disagree about what the guest owes.
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "short_term", managerRentOverride: "1500" },
    });
    expect(stay.stayKind).toBe("short");
    expect(stay.basis).toBe("daily");
    expect(stay.dailyRate).toBe(55);
  });

  it("REGRESSION: a monthly room is a long stay on the monthly basis", () => {
    const stay = resolveStayPricing({ room: MONTHLY_ROOM, submission: SUB, application: { rentalType: "standard" } });
    expect(stay).toMatchObject({
      stayKind: "long",
      basis: "monthly",
      dailyRate: undefined,
      monthlyRate: 1200,
      source: "room",
    });
  });

  it("REGRESSION: a room with no rentBasis at all behaves as monthly", () => {
    const stay = resolveStayPricing({
      room: { monthlyRent: 825 },
      submission: SUB,
      application: { rentalType: "standard" },
    });
    expect(stay.stayKind).toBe("long");
    expect(stay.monthlyRate).toBe(825);
  });

  it("ignores rentBasis daily with no positive daily price", () => {
    const stay = resolveStayPricing({
      room: { monthlyRent: 700, rentBasis: "daily", dailyRentPrice: 0 },
      submission: SUB,
      application: { rentalType: "standard" },
    });
    expect(stay.stayKind).toBe("long");
    expect(stay.monthlyRate).toBe(700);
  });
});

describe("resolveStayPricing: the daily basis is not by itself a short stay", () => {
  const span = (leaseStart: string, leaseEnd: string) =>
    resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "standard", leaseStart, leaseEnd },
    });

  it("an intra-month daily lease IS a short stay (the ledger bills it once, up front)", () => {
    expect(span("2026-03-10", "2026-03-20").stayKind).toBe("short");
  });

  it("a short daily stay on a listing that does NOT offer short stays is a tenancy", () => {
    // A billing-basis flag plus two dates cannot establish an owner-occupied residence or
    // support disclaiming tenancy, so the lodger document needs the manager's own declaration.
    // The rate is unaffected — the residential lease quotes the same $55/day.
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB_NO_SHORT_STAYS,
      application: { rentalType: "standard", leaseStart: "2026-03-10", leaseEnd: "2026-03-20" },
    });
    expect(stay.stayKind).toBe("long");
    expect(stay.basis).toBe("daily");
    expect(stay.dailyRate).toBe(55);
  });

  it("an EXPLICIT short-term application is short even on a listing with the tick off", () => {
    // rentalType is the manager's declaration in its own right, and it is the ledger's key.
    expect(
      resolveStayPricing({
        room: DAILY_ROOM,
        submission: SUB_NO_SHORT_STAYS,
        application: { rentalType: "short_term", leaseStart: "2026-03-10", leaseEnd: "2026-03-20" },
      }).stayKind,
    ).toBe("short");
  });

  it("a multi-month daily lease is a TENANCY, not a lodger stay", () => {
    // Regression: a daily-priced room is a supported way to bill a normal tenancy, and the
    // ledger bills it monthly and recurring. Handing that resident an agreement that
    // disclaims tenancy, drops the lead-paint disclosure, and states one up-front total is
    // both wrong against the ledger and legally dangerous.
    const stay = span("2026-03-10", "2026-06-12");
    expect(stay.stayKind).toBe("long");
    expect(stay.basis).toBe("daily");
    expect(stay.dailyRate).toBe(55);
  });

  it("a month-to-month daily lease with no end date is a tenancy", () => {
    const stay = resolveStayPricing({
      room: DAILY_ROOM,
      submission: SUB,
      application: { rentalType: "standard", leaseStart: "2026-03-10", leaseEnd: "" },
    });
    expect(stay.stayKind).toBe("long");
  });

  it("a daily lease covering a whole calendar month is a tenancy", () => {
    expect(span("2026-03-01", "2026-03-31").stayKind).toBe("long");
  });

  it("an EXPLICIT short-term application stays short regardless of span", () => {
    // rentalType is the manager's own declaration and the ledger's own key, so it is not
    // second-guessed by duration.
    expect(
      resolveStayPricing({
        room: DAILY_ROOM,
        submission: SUB,
        application: { rentalType: "short_term", leaseStart: "2026-03-10", leaseEnd: "2026-06-12" },
      }).stayKind,
    ).toBe("short");
  });
});

describe("resolveStayPricing deposit", () => {
  it("uses shortTermDeposit only for an explicit short-term application", () => {
    expect(
      resolveStayPricing({ room: DAILY_ROOM, submission: SUB, application: { rentalType: "short_term" } }).deposit,
    ).toBe(300);
  });

  it("uses the standard securityDeposit for a daily-priced room on a standard application", () => {
    // The short-term DOCUMENT renders, but the ledger charges securityDeposit for this row,
    // so the document has to quote the same number.
    expect(
      resolveStayPricing({ room: DAILY_ROOM, submission: SUB, application: { rentalType: "standard" } }).deposit,
    ).toBe(900);
  });

  it("lets a manager deposit override beat both", () => {
    expect(
      resolveStayPricing({
        room: DAILY_ROOM,
        submission: SUB,
        application: { rentalType: "short_term", managerSecurityDepositOverride: "$1,250" },
      }).deposit,
    ).toBe(1250);
  });

  it("honours a deposit override of zero instead of falling back to the listing", () => {
    // The ledger treats any non-empty override as authoritative, so "0" (a waived deposit)
    // charges nothing. The document must quote $0, not the listing's $300.
    expect(
      resolveStayPricing({
        room: DAILY_ROOM,
        submission: SUB,
        application: { rentalType: "short_term", managerSecurityDepositOverride: "0" },
      }).deposit,
    ).toBe(0);
  });

  it("reports no deposit when nothing is configured", () => {
    expect(
      resolveStayPricing({ room: MONTHLY_ROOM, submission: {}, application: { rentalType: "standard" } }).deposit,
    ).toBeUndefined();
  });
});

describe("resolveStayPricing null tolerance", () => {
  it("handles a missing room, submission, and application", () => {
    expect(resolveStayPricing({ room: null, submission: null, application: null })).toMatchObject({
      stayKind: "long",
      basis: "monthly",
      monthlyRate: undefined,
      deposit: undefined,
    });
  });
});

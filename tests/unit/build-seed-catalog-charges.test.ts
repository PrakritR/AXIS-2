import { describe, expect, it } from "vitest";
import {
  buildSeedChargesForPerson,
  buildSeedRentProfileForPerson,
  chargeKeyPart,
} from "../../tests/helpers/build-seed-catalog-charges.mjs";

describe("build-seed-catalog-charges", () => {
  const person = {
    axisId: "AXIS-TESTRSID",
    email: "resident@test.proplane.local",
    name: "Test Resident",
    rent: 1800,
    propId: "mgr-demo-lakeview",
    prop: { name: "Lakeview Studio", ownerUserId: "mgr-user-1", deposit: 1800 },
    room: { name: "Studio" },
    residentUserId: "resident-user-1",
    leaseStage: "signed",
    primaryE2e: true,
  };

  it("maps axis ids to pl_ charge key segments", () => {
    expect(chargeKeyPart("AXIS-TESTRSID")).toBe("pl_testrsid");
    expect(chargeKeyPart("AXIS-DEMOMYACH")).toBe("pl_demomyach");
  });

  it("builds move-in charges plus a recurring rent line for signed leases", () => {
    const charges = buildSeedChargesForPerson(person, { moveInDueLabel: "2026-08-16" });
    expect(charges.some((c) => c.kind === "application_fee" && c.status === "paid")).toBe(true);
    expect(charges.some((c) => c.kind === "security_deposit" && c.status === "paid")).toBe(true);
    expect(charges.some((c) => c.kind === "rent" && c.status === "pending")).toBe(true);
    expect(charges.find((c) => c.kind === "rent")?.id).toContain("hc_rent_");
  });

  it("builds an active rent profile for signed leases", () => {
    const profile = buildSeedRentProfileForPerson(person, { leaseEndIso: "2027-08-01" });
    expect(profile?.active).toBe(true);
    expect(profile?.monthlyRent).toBe(1800);
    expect(profile?.residentEmail).toBe("resident@test.proplane.local");
  });
});

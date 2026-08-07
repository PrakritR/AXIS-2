import { describe, expect, it } from "vitest";

function paymentRowMatchesProperty(row: { propertyId?: string }, propertyFilters: string[]): boolean {
  if (propertyFilters.length === 0) return true;
  const propertyId = row.propertyId?.trim();
  return Boolean(propertyId && propertyFilters.includes(propertyId));
}

function paymentResidentKey(row: { residentEmail?: string; residentName: string }): string {
  const email = row.residentEmail?.trim().toLowerCase();
  if (email) return email;
  return row.residentName?.trim() ?? "";
}

function paymentRowMatchesResident(
  row: { residentEmail?: string; residentName: string },
  residentFilters: string[],
): boolean {
  if (residentFilters.length === 0) return true;
  const key = paymentResidentKey(row);
  return Boolean(key && residentFilters.includes(key));
}

describe("manager payments filters", () => {
  it("matches property by id, not display label", () => {
    const row = { propertyId: "mgr-oak-1", propertyName: "Oak House" };
    expect(paymentRowMatchesProperty(row, [])).toBe(true);
    expect(paymentRowMatchesProperty(row, ["mgr-oak-1"])).toBe(true);
    expect(paymentRowMatchesProperty(row, ["Oak House"])).toBe(false);
  });

  it("matches resident by email when present", () => {
    const row = { residentEmail: "Resident@Test.com", residentName: "Alex Resident" };
    expect(paymentRowMatchesResident(row, ["resident@test.com"])).toBe(true);
    expect(paymentRowMatchesResident(row, ["Alex Resident"])).toBe(false);
  });
});

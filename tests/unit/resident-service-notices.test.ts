import { describe, expect, it } from "vitest";
import {
  buildServiceRequestApprovedNotice,
  buildServiceRequestDeniedNotice,
  buildWorkOrderCompletedNotice,
} from "@/lib/resident-service-notices";

describe("resident-service-notices", () => {
  it("builds approve notice with charge", () => {
    const n = buildServiceRequestApprovedNotice({
      residentName: "Test Resident",
      offerName: "Reserved parking spot",
      price: "$120.00",
      propertyLabel: "The Pioneer",
    });
    expect(n.subject).toContain("Reserved parking spot");
    expect(n.body).toContain("approved");
    expect(n.body).toContain("$120.00");
    expect(n.body).toContain("Test Resident");
  });

  it("builds deny notice", () => {
    const n = buildServiceRequestDeniedNotice({
      residentName: "Test Resident",
      offerName: "Storage",
    });
    expect(n.subject).toContain("Storage");
    expect(n.body.toLowerCase()).toContain("can't approve");
  });

  it("builds work order completed notice", () => {
    const n = buildWorkOrderCompletedNotice({
      residentName: "Test Resident",
      title: "Leaky faucet",
      propertyLabel: "The Pioneer",
      unit: "12A",
      workDoneSummary: "Replaced cartridge",
    });
    expect(n.subject).toContain("completed");
    expect(n.body).toContain("Leaky faucet");
    expect(n.body).toContain("Replaced cartridge");
  });
});

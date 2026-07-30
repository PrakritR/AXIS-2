/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { readManagerApplicationRows, writeManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  clearManualResidentOffPlatformLeaseFromApplication,
  hasBothLeaseSignatures,
  readLeasePipeline,
  syncLeasePipelineFromApplications,
} from "@/lib/lease-pipeline-storage";

const MANAGER_ID = "mgr-manual-lease-flow";

function seedManualResident(over?: Partial<DemoApplicantRow>): DemoApplicantRow {
  const row: DemoApplicantRow = {
    id: "PROPLANE-MANUAL1",
    name: "Test Resident",
    email: "manual.lease@test.proplane.local",
    property: "Test House",
    stage: "Active",
    bucket: "approved",
    detail: "",
    manuallyAdded: true,
    managerUserId: MANAGER_ID,
    manualResidentDetails: {
      externallySignedLease: true,
    },
    application: {
      leaseTerm: "Short-Term Stay",
      rentalType: "short_term",
      leaseStart: "2026-07-31",
      leaseEnd: "2026-08-04",
      fullLegalName: "Test Resident",
      email: "manual.lease@test.proplane.local",
    },
    ...over,
  };
  writeManagerApplicationRows([row]);
  return row;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("manual resident lease workflow", () => {
  it("seeds manager review without auto-signatures when no PDF was uploaded", () => {
    seedManualResident();
    syncLeasePipelineFromApplications(MANAGER_ID);
    const lease = readLeasePipeline(MANAGER_ID).find((r) => r.axisId === "PROPLANE-MANUAL1");
    expect(lease).toBeTruthy();
    expect(lease?.bucket).toBe("manager");
    expect(lease?.status === "Manager Review" || lease?.status === "Draft").toBe(true);
    expect(hasBothLeaseSignatures(lease!)).toBe(false);
    expect(lease?.externallySignedLease).not.toBe(true);
  });

  it("clears off-platform lease flags on the application record", () => {
    seedManualResident({
      manualResidentDetails: {
        externallySignedLease: true,
        signedLeaseDataUrl: "data:application/pdf;base64,x",
        signedLeaseFileName: "lease.pdf",
      },
    });
    clearManualResidentOffPlatformLeaseFromApplication("PROPLANE-MANUAL1");
    const app = readManagerApplicationRows()[0];
    expect(app?.manualResidentDetails?.externallySignedLease).toBeUndefined();
    expect(app?.manualResidentDetails?.signedLeaseDataUrl).toBeUndefined();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";

const readManagerApplicationRowsMock = vi.fn();
const getPropertyByIdMock = vi.fn();

vi.mock("@/lib/manager-applications-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-applications-storage")>();
  return {
    ...actual,
    readManagerApplicationRows: (...args: unknown[]) => readManagerApplicationRowsMock(...args),
  };
});

vi.mock("@/lib/rental-application/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rental-application/data")>();
  return {
    ...actual,
    getPropertyById: (...args: unknown[]) => getPropertyByIdMock(...args),
  };
});

import {
  leaseGenerationSupportedForRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

function baseLeaseRow(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease-1",
    residentName: "Jordan Lee",
    residentEmail: "jordan.lee@example.com",
    unit: "5257 Brooklyn · 9 rooms · Room 1",
    stageLabel: "Manager review",
    updated: "Jul 27",
    bucket: "manager",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: new Date().toISOString(),
    axisId: "PROPLANE-JORDAN",
    propertyId: "mgr--9-rooms-b1wf3z",
    roomChoice: "mgr--9-rooms-b1wf3z::room-1",
    status: "Manager Review",
    thread: [],
    ...overrides,
  };
}

describe("leaseGenerationSupportedForRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const wizard = snapshotJordanLee();
    readManagerApplicationRowsMock.mockReturnValue([
      {
        id: "PROPLANE-JORDAN",
        name: wizard.fullLegalName,
        email: wizard.email,
        property: "5257 Brooklyn · 9 rooms",
        stage: "Approved",
        detail: "",
        bucket: "approved",
        assignedPropertyId: "mgr--9-rooms-b1wf3z",
        assignedRoomChoice: "mgr--9-rooms-b1wf3z::room-1",
        application: {
          ...wizard,
          propertyId: wizard.propertyId,
          currentCity: "Seattle",
          currentState: "WA",
        },
      },
    ]);
    getPropertyByIdMock.mockReturnValue({
      id: "mgr--9-rooms-b1wf3z",
      title: "5257 Brooklyn · 9 rooms",
      tagline: "",
      address: "5257 Brooklyn Ave NE",
      zip: "98105",
      neighborhood: "University District",
      beds: 9,
      baths: 3,
      rentLabel: "$950 / month",
      available: "Now",
      petFriendly: false,
      buildingId: "b1",
      buildingName: "5257 Brooklyn",
      unitLabel: "9 rooms",
      adminPublishLive: true,
    });
  });

  it("loads application answers from the linked application id when the lease row snapshot is empty", () => {
    expect(
      leaseGenerationSupportedForRow(
        baseLeaseRow({
          application: {},
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("merges lease row placement ids when the application snapshot omits propertyId", () => {
    const wizard = snapshotJordanLee();
    readManagerApplicationRowsMock.mockReturnValue([
      {
        id: "PROPLANE-JORDAN",
        name: wizard.fullLegalName,
        email: wizard.email,
        property: "5257 Brooklyn · 9 rooms",
        stage: "Approved",
        detail: "",
        bucket: "approved",
        assignedPropertyId: "mgr--9-rooms-b1wf3z",
        assignedRoomChoice: "mgr--9-rooms-b1wf3z::room-1",
        application: {
          ...wizard,
          propertyId: "",
          roomChoice1: "",
        },
      },
    ]);

    expect(
      leaseGenerationSupportedForRow(
        baseLeaseRow({
          application: { fullLegalName: wizard.fullLegalName },
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("returns a clear error when no application answers exist", () => {
    readManagerApplicationRowsMock.mockReturnValue([]);
    const result = leaseGenerationSupportedForRow(
      baseLeaseRow({ axisId: undefined, application: undefined }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No application data");
  });
});

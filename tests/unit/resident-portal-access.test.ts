import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadResidentPortalAccessState,
  residentPortalHomePath,
} from "@/lib/resident-portal-access";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

function makeDbMock(options: {
  applicationRows?: Array<{ row_data: unknown; updated_at?: string }>;
  profile?: { application_approved?: boolean; manager_id?: string | null } | null;
  axisRecord?: { row_data: unknown } | null;
}) {
  const { applicationRows = [], profile = null, axisRecord = null } = options;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "manager_application_records") {
        return {
          select: vi.fn().mockImplementation((_cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: vi.fn().mockResolvedValue({ count: applicationRows.length, error: null }),
              };
            }
            return {
              eq: vi.fn().mockImplementation((col: string) => {
                if (col === "resident_email") {
                  return {
                    order: vi.fn().mockResolvedValue({ data: applicationRows, error: null }),
                  };
                }
                if (col === "id") {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: axisRecord, error: null }),
                  };
                }
                return {
                  order: vi.fn().mockResolvedValue({ data: applicationRows, error: null }),
                };
              }),
            };
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
            }),
          }),
        };
      }
      if (table === "resident_tour_links") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      }
      if (table === "portal_lease_pipeline_records") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  };
}

describe("resident portal access state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks pre-application residents before any submission", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(makeDbMock({ applicationRows: [] }) as never);

    const access = await loadResidentPortalAccessState({
      userId: "user-1",
      role: "resident",
      email: "resident@example.com",
    });

    expect(access.hasSubmittedApplication).toBe(false);
    expect(access.isPreApplicationResident).toBe(true);
    expect(residentPortalHomePath(access)).toBe("/resident/applications/apply");
  });

  it("sends tour-only residents to the tour workspace", async () => {
    const db = makeDbMock({ applicationRows: [] });
    vi.mocked(db.from).mockImplementation((table: string) => {
      if (table === "resident_tour_links") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        } as never;
      }
      return makeDbMock({ applicationRows: [] }).from(table);
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const access = await loadResidentPortalAccessState({
      userId: "user-1",
      role: "resident",
      email: "resident@example.com",
    });

    expect(access.hasTourLink).toBe(true);
    expect(access.isPreLeaseResident).toBe(true);
    expect(residentPortalHomePath(access)).toBe("/resident/tour");
  });

  it("keeps application-phase home while application is pending approval", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(
      makeDbMock({
        applicationRows: [
          {
            updated_at: "2026-01-01T00:00:00Z",
            row_data: {
              id: "AXIS-ABC123",
              email: "resident@example.com",
              bucket: "pending",
              stage: "Submitted",
              property: "Test House",
            },
          },
        ],
        profile: { application_approved: false, manager_id: null },
      }) as never,
    );

    const access = await loadResidentPortalAccessState({
      userId: "user-1",
      role: "resident",
      email: "resident@example.com",
    });

    expect(access.hasSubmittedApplication).toBe(true);
    expect(access.hasCompletedApplicationSubmission).toBe(true);
    expect(access.isPreApplicationResident).toBe(false);
    expect(access.applicationApproved).toBe(false);
    expect(access.leaseSigned).toBe(false);
    expect(access.leaseAccessUnlocked).toBe(false);
    expect(access.fullPortalAccess).toBe(false);
    expect(access.isPreLeaseResident).toBe(true);
    expect(residentPortalHomePath(access)).toBe("/resident/dashboard");
  });

  it("does not treat in-progress drafts as completed submissions", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(
      makeDbMock({
        applicationRows: [
          {
            updated_at: "2026-01-01T00:00:00Z",
            row_data: {
              id: "AXIS-DRAFT1",
              email: "resident@example.com",
              bucket: "pending",
              stage: "In progress",
              property: "Test House",
            },
          },
        ],
      }) as never,
    );

    const access = await loadResidentPortalAccessState({
      userId: "user-1",
      role: "resident",
      email: "resident@example.com",
    });

    expect(access.hasSubmittedApplication).toBe(true);
    expect(access.hasCompletedApplicationSubmission).toBe(false);
  });
});

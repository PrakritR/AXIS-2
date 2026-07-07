import { describe, expect, it, vi } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { linkResidentOnApplicationSubmit } from "@/lib/auth/link-resident-on-application-submit";

function makeDbMock(options: {
  propertyRecord?: { manager_user_id?: string | null; property_data?: unknown } | null;
  profile?: { manager_id?: string | null } | null;
}) {
  const profileUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const profileUpdate = vi.fn().mockReturnValue({ eq: profileUpdateEq });
  const db = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "manager_property_records") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: options.propertyRecord ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: options.profile ?? null, error: null }),
            }),
          }),
          update: profileUpdate,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    profileUpdate,
    profileUpdateEq,
  };
  return db;
}

describe("linkResidentOnApplicationSubmit", () => {
  it("resolves manager_user_id from property record and links profile on new submit", async () => {
    const db = makeDbMock({
      propertyRecord: { manager_user_id: "manager-1" },
      profile: { manager_id: null },
    });
    const row: DemoApplicantRow = {
      id: "AXIS-ABC123",
      name: "Resident",
      property: "Test House",
      propertyId: "prop-1",
      stage: "Submitted",
      bucket: "pending",
      detail: "",
      email: "resident@example.com",
      application: { propertyId: "prop-1" } as DemoApplicantRow["application"],
    };

    const linked = await linkResidentOnApplicationSubmit(db as never, {
      userId: "user-1",
      row,
      isNewSubmit: true,
    });

    expect(linked.id).toBe("AXIS-ABC123");
    expect(linked.managerUserId).toBe("manager-1");
    expect(linked.propertyId).toBe("prop-1");
    expect(db.profileUpdate).toHaveBeenCalledWith({ manager_id: "AXIS-ABC123" });
    expect(db.profileUpdateEq).toHaveBeenCalledWith("id", "user-1");
  });

  it("keeps existing profile manager_id on edits", async () => {
    const db = makeDbMock({
      propertyRecord: { manager_user_id: "manager-1" },
      profile: { manager_id: "AXIS-EXISTING" },
    });
    const row: DemoApplicantRow = {
      id: "AXIS-ABC123",
      name: "Resident",
      property: "Test House",
      propertyId: "prop-1",
      managerUserId: "manager-1",
      stage: "Submitted",
      bucket: "pending",
      detail: "",
      email: "resident@example.com",
    };

    await linkResidentOnApplicationSubmit(db as never, {
      userId: "user-1",
      row,
      isNewSubmit: false,
    });

    expect(db.profileUpdate).not.toHaveBeenCalled();
  });
});

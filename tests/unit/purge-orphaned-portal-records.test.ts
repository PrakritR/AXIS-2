import { describe, expect, it } from "vitest";
import type { PortalAccountIndex } from "@/lib/auth/purge-orphaned-portal-records";

function residentStillExists(
  record: { resident_email?: unknown; resident_user_id?: unknown; row_data?: unknown },
  index: PortalAccountIndex,
): boolean {
  const email = typeof record.resident_email === "string" ? record.resident_email.trim().toLowerCase() : "";
  const userId = typeof record.resident_user_id === "string" ? record.resident_user_id.trim() : "";
  if (userId && index.residentUserIds.has(userId)) return true;
  if (email && index.residentEmails.has(email)) return true;
  const rowData = record.row_data;
  if (rowData && typeof rowData === "object") {
    const nestedEmail = String((rowData as Record<string, unknown>).residentEmail ?? "").trim().toLowerCase();
    const nestedUserId = String((rowData as Record<string, unknown>).residentUserId ?? "").trim();
    if (nestedUserId && index.residentUserIds.has(nestedUserId)) return true;
    if (nestedEmail && index.residentEmails.has(nestedEmail)) return true;
  }
  return false;
}

function isOrphan(
  record: { resident_email?: unknown; resident_user_id?: unknown; manager_user_id?: unknown; row_data?: unknown },
  index: PortalAccountIndex,
): boolean {
  const email = typeof record.resident_email === "string" ? record.resident_email.trim().toLowerCase() : "";
  const userId = typeof record.resident_user_id === "string" ? record.resident_user_id.trim() : "";
  const nestedEmail =
    record.row_data && typeof record.row_data === "object"
      ? String((record.row_data as Record<string, unknown>).residentEmail ?? "").trim().toLowerCase()
      : "";
  const hasResidentRef = Boolean(email || userId || nestedEmail);
  if (hasResidentRef && !residentStillExists(record, index)) return true;

  const managerId = typeof record.manager_user_id === "string" ? record.manager_user_id.trim() : "";
  const nestedManagerId =
    record.row_data && typeof record.row_data === "object"
      ? String((record.row_data as Record<string, unknown>).managerUserId ?? "").trim()
      : "";
  const hasManagerRef = Boolean(managerId || nestedManagerId);
  if (hasManagerRef) {
    const managerExists =
      (managerId && index.managerUserIds.has(managerId)) ||
      (nestedManagerId && index.managerUserIds.has(nestedManagerId));
    if (!managerExists) return true;
  }
  return false;
}

describe("orphan portal record detection", () => {
  const index: PortalAccountIndex = {
    residentEmails: new Set(["resident@test.com"]),
    residentUserIds: new Set(["res-1"]),
    managerUserIds: new Set(["mgr-1"]),
  };

  it("flags leases whose resident email no longer exists", () => {
    expect(
      isOrphan(
        {
          resident_email: "deleted@test.com",
          manager_user_id: "mgr-1",
          row_data: { residentEmail: "deleted@test.com", managerUserId: "mgr-1" },
        },
        index,
      ),
    ).toBe(true);
  });

  it("keeps leases tied to valid resident and manager accounts", () => {
    expect(
      isOrphan(
        {
          resident_email: "resident@test.com",
          manager_user_id: "mgr-1",
          row_data: { residentEmail: "resident@test.com", managerUserId: "mgr-1" },
        },
        index,
      ),
    ).toBe(false);
  });

  it("flags rows when only row_data resident email exists and account is gone", () => {
    expect(
      isOrphan(
        {
          resident_email: null,
          manager_user_id: "mgr-1",
          row_data: { residentEmail: "ghost@test.com", managerUserId: "mgr-1" },
        },
        index,
      ),
    ).toBe(true);
  });
});

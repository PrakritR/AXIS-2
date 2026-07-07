import { describe, expect, it, vi } from "vitest";
import { purgeResidentPortalData } from "@/lib/auth/purge-portal-account-data";

function mockDeleteChain() {
  return {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
}

describe("purgeResidentPortalData", () => {
  it("purges service requests, ledger, screening, cosigner, and scheduled inbox rows", async () => {
    const chain = mockDeleteChain();
    const db = { from: vi.fn(() => chain) } as unknown as Parameters<typeof purgeResidentPortalData>[0];

    await purgeResidentPortalData(db, {
      email: "resident@example.com",
      userId: "user-1",
      applicationId: "app-1",
    });

    const tables = db.from.mock.calls.map((call) => call[0]);
    expect(tables).toContain("portal_service_request_records");
    expect(tables).toContain("ledger_entries");
    expect(tables).toContain("cosigner_submission_records");
    expect(tables).toContain("screening_orders");
    expect(tables).toContain("portal_scheduled_inbox_message_records");
    expect(db.from).toHaveBeenCalled();
  });
});

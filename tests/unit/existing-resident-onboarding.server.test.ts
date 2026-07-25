import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";

const { deliverExistingResidentWelcome } = vi.hoisted(() => ({
  deliverExistingResidentWelcome: vi.fn(),
}));

vi.mock("@/lib/resident-welcome.server", () => ({
  deliverExistingResidentWelcome,
  RESIDENT_WELCOME_EMAIL_RE: /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/,
}));

import { runExistingResidentOnboarding } from "@/lib/existing-resident-onboarding.server";

function mockDb() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn(() => ({
      upsert,
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    })),
    _upsert: upsert,
  };
}

describe("runExistingResidentOnboarding", () => {
  beforeEach(() => {
    deliverExistingResidentWelcome.mockReset();
    deliverExistingResidentWelcome.mockResolvedValue({ ok: true, id: "email-1", skipped: false });
  });

  it("creates signed lease and sends welcome for manual residents", async () => {
    const db = mockDb();
    const row: DemoApplicantRow = {
      id: "PROPLANE-TEST01",
      name: "Jane Smith",
      email: "jane.onboard@test.axis.local",
      property: "Ballard House",
      stage: "Active",
      bucket: "approved",
      detail: "",
      manuallyAdded: true,
      manualResidentDetails: {
        monthlyUtilities: 175,
        securityDeposit: 875,
        externallySignedLease: true,
      },
    };

    const result = await runExistingResidentOnboarding(
      db as never,
      { userId: "mgr-1", email: "manager@test.axis.local", managerName: "Alex Manager" },
      row,
      { sendWelcomeEmail: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leaseId).toBe("lease_app_PROPLANE-TEST01");
    expect(result.welcomeEmailSent).toBe(true);
    expect(db._upsert).toHaveBeenCalled();
    expect(deliverExistingResidentWelcome).toHaveBeenCalled();
    const welcomeArgs = deliverExistingResidentWelcome.mock.calls[0]?.[2] as { axisId?: string };
    expect(welcomeArgs?.axisId).toBe("PROPLANE-TEST01");
  });

  it("rejects non-manual residents", async () => {
    const db = mockDb();
    const result = await runExistingResidentOnboarding(
      db as never,
      { userId: "mgr-1", email: "manager@test.axis.local" },
      {
        id: "PROPLANE-X",
        name: "Applicant",
        email: "a@test.axis.local",
        property: "P",
        stage: "Pending",
        bucket: "pending",
        detail: "",
      },
    );
    expect(result.ok).toBe(false);
  });
});

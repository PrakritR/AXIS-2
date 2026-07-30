import { describe, expect, it, vi } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  buildApplicationSubmittedManagerBody,
  shouldNotifyManagerOfApplicationSubmit,
} from "@/lib/application-submitted-notification.server";
import { IN_PROGRESS_APPLICATION_STAGE } from "@/lib/rental-application/in-progress-application";
import { buildLeaseReadyForResidentMessage } from "@/lib/resident-portal-login-copy";

function submittedRow(overrides: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "PROPLANE-TEST-1",
    name: "SIVA NARENDRA CHERUKU",
    email: "narendracheruku18@gmail.com",
    property: "4709A 8th Ave NE",
    propertyId: "prop-1",
    managerUserId: "mgr-1",
    bucket: "pending",
    stage: "Submitted",
    application: {
      propertyId: "prop-1",
      phone: "206-555-0100",
      consentCredit: true,
    } as DemoApplicantRow["application"],
    ...overrides,
  };
}

describe("application-submitted-notification", () => {
  it("buildApplicationSubmittedManagerBody includes vital review fields", () => {
    const body = buildApplicationSubmittedManagerBody({
      row: submittedRow(),
      origin: "https://prop-lane.space",
    });
    expect(body).toContain("SIVA NARENDRA CHERUKU");
    expect(body).toContain("narendracheruku18@gmail.com");
    expect(body).toContain("206-555-0100");
    expect(body).toContain("PROPLANE-TEST-1");
    expect(body).toContain("https://prop-lane.space/portal/applications");
    expect(body).toContain("https://prop-lane.space/portal/communication/inbox/unopened");
    expect(body).toContain("4709A 8th Ave NE");
  });

  it("shouldNotifyManagerOfApplicationSubmit fires only on first submit", () => {
    const draft: DemoApplicantRow = submittedRow({
      stage: IN_PROGRESS_APPLICATION_STAGE,
    });
    const submitted = submittedRow();
    expect(shouldNotifyManagerOfApplicationSubmit(null, submitted)).toBe(true);
    expect(shouldNotifyManagerOfApplicationSubmit(draft, submitted)).toBe(true);
    expect(shouldNotifyManagerOfApplicationSubmit(submitted, submitted)).toBe(false);
    expect(shouldNotifyManagerOfApplicationSubmit(draft, draft)).toBe(false);
  });

  it("lease-ready resident message includes sign-in guidance (communication email parity)", () => {
    const body = buildLeaseReadyForResidentMessage({
      residentName: "SIVA",
      residentEmail: "narendracheruku18@gmail.com",
      unit: "4709A 8th Ave NE · 10 rooms",
      variant: "send",
    });
    expect(body).toContain("How to sign in to PropLane");
    expect(body).toContain("narendracheruku18@gmail.com");
    expect(body).toContain("Continue with Google");
    expect(body).toContain("Leases in the sidebar");
  });
});

describe("notifyManagerApplicationSubmitted", () => {
  it("writes manager inbox thread grouped by applicant email", async () => {
    vi.resetModules();
    vi.doMock("@/lib/co-manager-notification-recipients.server", () => ({
      resolvePropertyLeadRecipientIds: vi.fn(async () => ["mgr-1"]),
      resolveManagerRecipientProfiles: vi.fn(async () => [
        { userId: "mgr-1", email: "manager@test.com", phone: null },
      ]),
    }));
    vi.doMock("@/lib/portal-inbox-delivery", () => ({
      deliverPortalMessageThreadSide: vi.fn(async () => ({ action: "create", threadId: "t1" })),
    }));
    const { notifyManagerApplicationSubmitted } = await import("@/lib/application-submitted-notification.server");
    const upsert = vi.fn();
    const db = { from: vi.fn(() => ({ upsert })) } as never;
    const result = await notifyManagerApplicationSubmitted(db, submittedRow());
    expect(result.ok).toBe(true);
    const { deliverPortalMessageThreadSide } = await import("@/lib/portal-inbox-delivery");
    expect(deliverPortalMessageThreadSide).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        otherPartyEmail: "narendracheruku18@gmail.com",
        participantEmail: "manager@test.com",
        messageId: "application-submitted-PROPLANE-TEST-1",
      }),
    );
  });
});

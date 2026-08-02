// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DemoApplicantRow } from "@/data/demo-portal";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: () => {} }),
}));
vi.mock("@/lib/demo/demo-session", () => ({
  isDemoModeActive: () => false,
}));
vi.mock("@/lib/screening/screening-test-mode", () => ({
  isScreeningTestModeActive: () => false,
}));

import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";

afterEach(cleanup);

const completedRow: DemoApplicantRow = {
  id: "AXIS-TEST",
  name: "Olivia Brooks",
  email: "olivia.brooks.workflow@test.proplane.local",
  property: "Ballard House",
  propertyId: "prop-ballard",
  stage: "Submitted",
  bucket: "approved",
  detail: "Approved",
  application: {
    consentCredit: true,
    email: "olivia.brooks.workflow@test.proplane.local",
  } as DemoApplicantRow["application"],
  backgroundCheck: {
    provider: "checkr",
    candidateId: "cand-1",
    reportId: "order-1",
    packageSlug: "essential",
    status: "complete",
    result: "clear",
    orderedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:05:00.000Z",
    reportSnapshot: {
      credit_score: 720,
      criminal: { status: "clear" },
    },
  },
};

describe("ApplicationScreeningPanel — completed check", () => {
  it("shows completed banner with Run again and hides the primary run button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          settings: { mode: "manual" },
          configured: true,
          backgroundCheckConfigured: true,
          screeningAllowed: true,
        }),
      }),
    );

    const onOpenScreeningModal = vi.fn();
    render(
      <ApplicationScreeningPanel
        row={completedRow}
        collapsible={false}
        onOpenScreeningModal={onOpenScreeningModal}
      />,
    );

    expect(screen.getByText(/Background check already completed/i)).toBeTruthy();
    expect(screen.queryByText("Re-run background check")).toBeNull();
    expect(screen.queryByText("Run background check")).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Run again/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Run again/i }));
    expect(onOpenScreeningModal).toHaveBeenCalledWith({ showPackagePicker: true });

    vi.unstubAllGlobals();
  });
});

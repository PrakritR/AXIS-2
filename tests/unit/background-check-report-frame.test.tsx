// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { DemoApplicantRow } from "@/data/demo-portal";

vi.mock("@/lib/demo/demo-session", () => ({
  isDemoModeActive: () => false,
}));
vi.mock("@/lib/screening/screening-test-mode", () => ({
  isScreeningTestModeActive: () => false,
}));

import { BackgroundCheckReportFrame } from "@/components/portal/application-screening-panel";

afterEach(cleanup);

function completeRow(): DemoApplicantRow {
  return {
    id: "AXIS-TEST",
    name: "Olivia Brooks",
    email: "olivia.brooks.workflow@test.axis.local",
    property: "Ballard House",
    propertyId: "prop-ballard",
    stage: "Submitted",
    bucket: "approved",
    detail: "Approved",
    application: {
      consentCredit: true,
      email: "olivia.brooks.workflow@test.axis.local",
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
}

describe("BackgroundCheckReportFrame", () => {
  it("renders inline HTML for a completed check instead of the PDF proxy iframe", () => {
    const { container } = render(<BackgroundCheckReportFrame row={completeRow()} demo={false} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBeNull();
    expect(iframe?.getAttribute("srcdoc") ?? "").toContain("Olivia Brooks");
    expect(iframe?.getAttribute("srcdoc") ?? "").toContain("720");
  });
});

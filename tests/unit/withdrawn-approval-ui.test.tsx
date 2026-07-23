// @vitest-environment jsdom
//
// Manager Applications UI guard: a resident-withdrawn application keeps
// `bucket === "pending"`, so it stays visible on the Pending tab labelled
// "Withdrawn" — but the manager must NOT be offered Approve on it (approving
// provisions a resident account + rent/deposit charges for someone who withdrew).
// A normal pending row is the control: it still offers Approve.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { DemoApplicantRow } from "@/data/demo-portal";

/** Rows the mocked storage layer hands the manager panel; swapped per scenario. */
let ROWS: DemoApplicantRow[] = [];

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/applications",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: "mgr-1", email: "mgr@example.com", ready: true }),
}));
vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: () => {} }),
}));
vi.mock("@/lib/manager-applications-storage", () => ({
  MANAGER_APPLICATIONS_EVENT: "manager-applications-changed",
  syncManagerApplicationsFromServer: () => Promise.resolve(),
  readManagerApplicationRows: () => ROWS,
  deleteManagerApplicationFromServer: () => Promise.resolve({ ok: true }),
  normalizeApplicationAxisId: (id: string) => id,
}));
vi.mock("@/lib/manager-portfolio-access", () => ({
  MANAGER_PORTFOLIO_REFRESH_EVENTS: [],
  applicationVisibleToPortalUser: () => true,
  buildManagerPropertyFilterOptions: () => [],
}));
vi.mock("@/lib/manager-property-links", () => ({
  buildManagerShareablePropertyOptions: () => [],
}));
vi.mock("@/lib/demo-property-pipeline", () => ({
  PROPERTY_PIPELINE_EVENT: "property-pipeline-changed",
  syncPropertyPipelineFromServer: () => Promise.resolve(),
  hasCachedPropertyPipeline: () => true,
}));
vi.mock("@/lib/cosigner-submissions-storage", () => ({
  fetchCosignerSubmissionsForSignerAppId: () => Promise.resolve([]),
  readCosignerSubmissionsForSignerAppId: () => [],
}));
vi.mock("@/lib/demo/demo-session", () => ({
  isDemoModeActive: () => false,
  DEMO_GUIDED_USER_ID: "demo-everything",
  resolveManagerScopeUserId: (id: string | null) => id,
}));

import { ManagerApplications } from "@/components/portal/manager-applications";

afterEach(cleanup);

function row(over: Partial<DemoApplicantRow> & { id: string; name: string }): DemoApplicantRow {
  return {
    property: "The Pioneer",
    propertyId: "mgr-demo-pioneer",
    stage: "Submitted",
    bucket: "pending",
    detail: "Submitted Jul 19, 2026",
    email: `${over.id.toLowerCase()}@example.com`,
    backgroundCheckStatus: "pending_review",
    ...over,
  };
}

async function expandRow(name: string) {
  fireEvent.click((await screen.findByText(name)).closest("button")!);
}

describe("manager Applications — no Approve on a withdrawn row", () => {
  it("hides Approve (and the reminder) but keeps the row visible + labelled Withdrawn", async () => {
    ROWS = [
      row({ id: "AXIS-W1", name: "Withdrawn Wanda", withdrawnAt: "2026-07-22T00:00:00.000Z" }),
    ];
    render(<ManagerApplications />);

    // The row is still shown on the Pending tab, labelled Withdrawn.
    expect(await screen.findByText("Withdrawn Wanda")).toBeTruthy();
    expect(screen.getByText("Withdrawn")).toBeTruthy();

    await expandRow("Withdrawn Wanda");

    // No Approve button and no "Send reminder" — but Reject/Delete remain so the
    // manager can still formally close the row.
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Send reminder")).toBeNull();
    expect(screen.getByText("Reject")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("still offers Approve on a normal (non-withdrawn) pending row — the control", async () => {
    ROWS = [row({ id: "AXIS-N1", name: "Normal Nora" })];
    render(<ManagerApplications />);

    await expandRow("Normal Nora");
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Reject")).toBeTruthy();
  });
});

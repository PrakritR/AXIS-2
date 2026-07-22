// @vitest-environment jsdom
//
// Renders the two user-facing surfaces the group-application change adds:
//
//   1. `GroupShareCallout` — the applicant's Group ID hand-off (organizer,
//      joining member, and the post-rejection reference-only variant).
//   2. `ManagerApplications` — the group badge on the Linear-style row plus the
//      "Group application" roster inside an expanded application.
//
// Set GROUP_UI_HTML_DIR to also dump each rendered surface's HTML to that
// directory so it can be screenshotted with the app's real stylesheet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

const HTML_DIR = process.env.GROUP_UI_HTML_DIR;
function dumpHtml(name: string, html: string) {
  if (!HTML_DIR) return;
  fs.mkdirSync(HTML_DIR, { recursive: true });
  fs.writeFileSync(path.join(HTML_DIR, `${name}.body.html`), html, "utf8");
}

const GROUP_ID = "AXISGRP-7KQ2MW9D";

function application(over: Partial<RentalWizardFormState>): RentalWizardFormState {
  return {
    applyingAsGroup: "yes",
    groupRole: "first",
    groupSize: "3",
    groupId: GROUP_ID,
    ...over,
  } as RentalWizardFormState;
}

/** Rows the mocked storage layer hands the manager panel; swapped per scenario. */
let ROWS: DemoApplicantRow[] = [];

/** Organizer (approved), one joining member in screening, one still filling the wizard. */
const HOUSEHOLD_ROWS: DemoApplicantRow[] = [
  {
    id: "AXIS-1001",
    name: "Jordan Reyes",
    email: "jordan.reyes@example.com",
    property: "The Pioneer",
    propertyId: "mgr-demo-pioneer",
    stage: "Approved",
    bucket: "approved",
    detail: "Submitted Jul 18, 2026",
    application: application({ groupRole: "first", groupSize: "3" }),
  },
  {
    id: "AXIS-1002",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    property: "The Pioneer",
    propertyId: "mgr-demo-pioneer",
    stage: "Submitted",
    bucket: "pending",
    detail: "Submitted Jul 19, 2026",
    backgroundCheckStatus: "pending_review",
    application: application({ groupRole: "joining", groupSize: "" }),
  },
  {
    id: "AXIS-1003",
    name: "Sam Okafor",
    email: "sam.okafor@example.com",
    property: "The Pioneer",
    propertyId: "mgr-demo-pioneer",
    stage: "In progress",
    bucket: "pending",
    detail: "Started Jul 20, 2026",
    application: application({ groupRole: "joining", groupSize: "" }),
  },
];

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

import { GroupShareCallout } from "@/components/marketing/rental-application-finish-panel";
import { ManagerApplications } from "@/components/portal/manager-applications";
import { makeApplicationGroupId } from "@/lib/rental-application/application-groups";

afterEach(cleanup);

describe("group application — applicant Group ID hand-off", () => {
  it("shows the organizer a shareable Group ID sized to the household", () => {
    const { container } = render(
      <div className="mx-auto max-w-xl p-6">
        <GroupShareCallout groupId={GROUP_ID} groupRole="first" groupSize="3" />
      </div>,
    );
    expect(screen.getByText("Your group is ready")).toBeTruthy();
    expect(screen.getByText(/Share this Group ID with your 2 roommates/)).toBeTruthy();
    expect(screen.getByText(GROUP_ID)).toBeTruthy();
    dumpHtml("callout-organizer", container.innerHTML);
  });

  it("tells a joining member their application is linked", () => {
    const { container } = render(
      <div className="mx-auto max-w-xl p-6">
        <GroupShareCallout groupId={GROUP_ID} groupRole="joining" />
      </div>,
    );
    expect(screen.getByText("You joined a group application")).toBeTruthy();
    expect(screen.getByText(/reviews you together/)).toBeTruthy();
    dumpHtml("callout-joining", container.innerHTML);
  });

  it("keeps the Group ID readable but drops the share pitch once rejected", () => {
    const { container } = render(
      <div className="mx-auto max-w-xl p-6">
        <GroupShareCallout groupId={GROUP_ID} groupRole="first" groupSize="3" shareable={false} />
      </div>,
    );
    expect(screen.getByText("Group application")).toBeTruthy();
    expect(screen.getByText(/kept here for reference/)).toBeTruthy();
    expect(screen.queryByText(/Share this Group ID/)).toBeNull();
    dumpHtml("callout-rejected", container.innerHTML);
  });

  it("mints ids in the AXISGRP- format the wizard validates", () => {
    const id = makeApplicationGroupId();
    expect(id.startsWith("AXISGRP-")).toBe(true);
    expect(id.length).toBeGreaterThanOrEqual(12);
  });
});

describe("group application — manager reconciliation", () => {
  it("badges each member row and rosters the household in the expanded application", async () => {
    ROWS = HOUSEHOLD_ROWS;
    const { container } = render(<ManagerApplications />);

    // Row badge on the default (Pending) tab: 2 of the 3 declared members have
    // actually submitted — the count reconciles across buckets, so the approved
    // organizer sitting on another tab still counts toward the 2.
    const rowBadges = await screen.findAllByText("Group 2/3");
    expect(rowBadges.length).toBe(2);
    dumpHtml("manager-rows", container.innerHTML);

    // Expand a joining member's application → roster of the whole household.
    fireEvent.click(screen.getByText("Priya Nair").closest("button")!);
    expect(await screen.findByText("Group application")).toBeTruthy();
    expect(screen.getByText(/2 of 3 applied · waiting on 1/)).toBeTruthy();
    expect(screen.getByText(GROUP_ID)).toBeTruthy();
    expect(screen.getByText("(this application)")).toBeTruthy();
    expect(screen.getByText("· organizer")).toBeTruthy();
    // Organizer is approved even though this member is still in review.
    expect(screen.getByText("Jordan Reyes")).toBeTruthy();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    dumpHtml("manager-expanded", container.innerHTML);
  });

  it("reports a raw count instead of a misleading ratio when the roster is odd", async () => {
    // Two applications share a code no organizer application uses, and a third
    // group has more members than its organizer declared.
    ROWS = [
      {
        id: "AXIS-2001",
        name: "Casey Lin",
        email: "casey.lin@example.com",
        property: "Cascade Lofts",
        stage: "Submitted",
        bucket: "pending",
        detail: "Submitted Jul 19, 2026",
        application: application({ groupRole: "joining", groupSize: "", groupId: "AXISGRP-ORPHAN01" }),
      },
      {
        id: "AXIS-2002",
        name: "Devon Marsh",
        email: "devon.marsh@example.com",
        property: "Cascade Lofts",
        stage: "Submitted",
        bucket: "pending",
        detail: "Submitted Jul 19, 2026",
        application: application({ groupRole: "joining", groupSize: "", groupId: "AXISGRP-ORPHAN01" }),
      },
      ...["Ada Vance", "Bo Whitaker", "Cleo Park"].map((name, i) => ({
        id: `AXIS-30${i}`,
        name,
        email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
        property: "Emerald Court",
        stage: "Submitted",
        bucket: "pending" as const,
        detail: "Submitted Jul 20, 2026",
        application: application({
          groupRole: i === 0 ? ("first" as const) : ("joining" as const),
          groupSize: i === 0 ? "2" : "",
          groupId: "AXISGRP-OVER0001",
        }),
      })),
    ];

    const { container } = render(<ManagerApplications />);
    expect((await screen.findAllByText("Group 2 · organizer not shown")).length).toBe(2);
    expect(screen.getAllByText("Group 3 · 2 declared").length).toBe(3);
    dumpHtml("manager-edge-rows", container.innerHTML);

    fireEvent.click(screen.getByText("Ada Vance").closest("button")!);
    expect(
      await screen.findByText(/3 applications carry this Group ID, more than the 2 the organizer declared/),
    ).toBeTruthy();
    dumpHtml("manager-edge-expanded", container.innerHTML);
  });
});

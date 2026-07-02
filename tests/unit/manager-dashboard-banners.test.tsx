// @vitest-environment jsdom
//
// Renders the manager Dashboard with a scenario that has BOTH overdue charges
// and other action items. Locks in the "Remove overdue-charges banner" change:
// the rose "N overdue charges totalling $X" NotifBanner must be gone from the
// Action-required banner block, while every other banner and the separate
// "Pending & overdue payments" table (which still lists overdue charges) stay.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

// ── Inject a deterministic scenario through the data layer the dashboard reads.
// One overdue charge + one on-time pending charge + apps/leases/inbox items, so
// the banner block is populated and the payments table has an "Overdue" row.
const CHARGES = [
  {
    id: "chg-overdue",
    status: "pending",
    createdAt: "2026-05-01T00:00:00.000Z",
    residentName: "Dana Ramirez",
    residentEmail: "dana@example.com",
    title: "May rent",
    balanceLabel: "$1,250.00",
    __overdue: true,
  },
  {
    id: "chg-pending",
    status: "pending",
    createdAt: "2026-06-20T00:00:00.000Z",
    residentName: "Sam Lee",
    residentEmail: "sam@example.com",
    title: "Parking fee",
    balanceLabel: "$75.00",
    __overdue: false,
  },
];

vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: "mgr-1", email: "mgr@example.com", ready: true }),
}));

vi.mock("@/lib/household-charges", () => ({
  HOUSEHOLD_CHARGES_EVENT: "household-charges-changed",
  syncHouseholdChargesFromServer: () => Promise.resolve(),
  readChargesForManager: () => CHARGES,
  isHouseholdChargeOverdue: (c: { __overdue?: boolean }) => Boolean(c.__overdue),
  chargeDueLabel: (c: { __overdue?: boolean }) => (c.__overdue ? "Due May 1, 2026" : "Due Jul 20, 2026"),
}));

vi.mock("@/lib/manager-applications-storage", () => ({
  MANAGER_APPLICATIONS_EVENT: "manager-applications-changed",
  syncManagerApplicationsFromServer: () => Promise.resolve(),
  readManagerApplicationRows: () => [
    { id: "app-1", bucket: "pending", name: "Alex Kim", email: "alex@example.com", property: "Elm St #2", stage: "Screening" },
    { id: "app-2", bucket: "pending", name: "Jordan Fox", email: "jordan@example.com", property: "Oak Ave #5", stage: "Review" },
    { id: "app-3", bucket: "approved", name: "Riley Poe", email: "riley@example.com", property: "Elm St #1", stage: "Approved" },
  ],
}));

vi.mock("@/lib/manager-portfolio-access", () => ({
  applicationVisibleToPortalUser: () => true,
}));

vi.mock("@/lib/lease-pipeline-storage", () => ({
  LEASE_PIPELINE_EVENT: "lease-pipeline-changed",
  syncLeasePipelineFromServer: () => Promise.resolve(),
  readLeasePipeline: () => [
    {
      id: "lease-1",
      status: "Manager Signature Pending",
      updatedAtIso: "2026-06-30T00:00:00.000Z",
      residentName: "Dana Ramirez",
      residentEmail: "dana@example.com",
      unit: "Elm St #2",
      signedRentLabel: "$1,250/mo",
    },
  ],
}));

vi.mock("@/lib/portal-inbox-storage", () => ({
  MANAGER_INBOX_STORAGE_KEY: "manager-inbox",
  PORTAL_INBOX_CHANGED_EVENT: "portal-inbox-changed",
  syncPersistedInboxFromServer: () => Promise.resolve(),
  countUnopenedPersistedInbox: () => 3,
  loadPersistedInbox: () => [
    { id: "t-1", folder: "inbox", unread: true, from: "Dana Ramirez", subject: "Rent question", preview: "Hi..." },
  ],
}));

vi.mock("@/lib/demo-admin-property-inventory", () => ({
  adminKpiCounts: () => [2, 0, 4],
}));

vi.mock("@/lib/demo-admin-scheduling", () => ({
  getPartnerInquiryWindows: () => [],
  readPartnerInquiries: () => [],
  readPlannedEvents: () => [],
  syncScheduleRecordsFromServer: () => Promise.resolve(),
}));

vi.mock("@/lib/demo-admin-ui", () => ({ ADMIN_UI_EVENT: "admin-ui-changed" }));
vi.mock("@/lib/demo-property-pipeline", () => ({ PROPERTY_PIPELINE_EVENT: "property-pipeline-changed" }));

import { ManagerDashboard } from "@/components/portal/manager-dashboard";

function findBannerBlock(): HTMLElement {
  // The Action-required banner block is the wrapper holding the NotifBanners
  // (portal-banner-* pills). Grab the closest such wrapper via a known banner.
  const anyBanner = document.querySelector(".portal-banner-info, .portal-banner-pending, .portal-banner-danger");
  expect(anyBanner, "expected an action-required banner to render").not.toBeNull();
  return anyBanner!.parentElement as HTMLElement;
}

describe("Manager dashboard — overdue-charges banner removed", () => {
  afterEach(cleanup);

  it("does not render the rose overdue-charges banner even when overdue charges exist", () => {
    render(<ManagerDashboard />);

    // The banner block renders (other action items are present)...
    const block = findBannerBlock();
    // ...but the rose danger banner (the only user of portal-banner-danger here)
    // and its "overdue charges totalling ..." copy are gone.
    expect(document.querySelector(".portal-banner-danger")).toBeNull();
    expect(within(block).queryByText(/overdue charges? totalling/i)).toBeNull();
    expect(block.textContent).not.toMatch(/across residents/i);
  });

  it("keeps the other action-required banners", () => {
    render(<ManagerDashboard />);
    const block = findBannerBlock();
    expect(within(block).getByText(/waiting for a decision/i)).toBeTruthy(); // applications
    expect(within(block).getByText(/your signature/i)).toBeTruthy(); // leases
    expect(within(block).getByText(/unread message/i)).toBeTruthy(); // inbox
    expect(within(block).getByText(/pending Axis approval/i)).toBeTruthy(); // properties
  });

  it("still surfaces the overdue charge in the Pending & overdue payments table", () => {
    render(<ManagerDashboard />);
    // The overdue info lives in the table now, not the top banner.
    expect(screen.getByText("Pending & overdue payments")).toBeTruthy();
    const overdueBadges = screen.getAllByText(/^Overdue$/i);
    expect(overdueBadges.length).toBeGreaterThan(0);
    // The overdue charge's resident + charge title appear in the payments table.
    expect(screen.getAllByText("Dana Ramirez").length).toBeGreaterThan(0);
    expect(screen.getByText(/May rent/)).toBeTruthy();
  });
});

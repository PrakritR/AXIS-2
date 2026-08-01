// @vitest-environment jsdom
//
// Documents is a paid-tier resident section, but the Application tab is exempt
// so an approved resident can always read their OWN submitted application
// (`applications` is a RESIDENT_FREE_TIER_SECTION_ID, and `/resident/applications`
// — the approval push deep link — redirects here).
//
// The exemption is the TAB, not the section. Unlocking the whole shell for a
// free-tier household hands them chrome that leads nowhere: tab links to Lease
// / Rent receipts / Other documents, each of which still renders
// `ResidentFreeTierFeatureNotice`, plus an Add button whose success handler
// navigates to `documents/other` — which would strand the file they just
// uploaded behind the upgrade notice.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/providers/app-ui-provider", () => ({ useAppUi: () => ({ showToast: vi.fn() }) }));
vi.mock("@/hooks/use-portal-session", () => ({
  usePortalSession: () => ({ email: "resident@example.com", userId: "user-1" }),
}));
vi.mock("@/lib/portal-nav-client", () => ({
  usePortalNavigate: () => vi.fn(),
  portalNavClick: () => () => {},
  isCrossPortalNavigation: () => false,
}));
vi.mock("@/lib/manager-applications-storage", () => ({
  MANAGER_APPLICATIONS_EVENT: "manager-applications",
  readManagerApplicationRows: () => [],
  syncManagerApplicationsFromServer: () => Promise.resolve(),
  isWithdrawnApplicationRow: () => false,
}));
vi.mock("@/lib/uploaded-own-lease-storage", () => ({
  readUploadedOwnLeases: () => [],
  removeUploadedOwnLease: vi.fn(),
  syncUploadedOwnLeasesFromServer: () => Promise.resolve([]),
}));

const { ResidentDocumentsPanel } = await import("@/components/portal/resident-documents-panel");

const TABS = [
  { id: "application", label: "Application" },
  { id: "lease", label: "Lease" },
  { id: "receipts", label: "Rent receipts" },
  { id: "other", label: "Other documents" },
];

afterEach(cleanup);

describe("resident Documents shell on a free-tier household", () => {
  it("shows only the application, with no tab links and no Add button", () => {
    render(<ResidentDocumentsPanel tabId="application" tabs={TABS} applicationOnly />);

    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    for (const label of ["Lease", "Rent receipts", "Other documents"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
    // The application content itself is still rendered — that is the point of
    // the exemption; an empty roster still means the tab, not the upsell page.
    expect(screen.getByText("Documents")).toBeTruthy();
  });

  it("leaves a paid-tier household's Documents shell fully intact", () => {
    render(<ResidentDocumentsPanel tabId="application" tabs={TABS} />);

    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
    for (const label of ["Lease", "Rent receipts", "Other documents"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("defaults to the full shell when the flag is omitted", () => {
    render(<ResidentDocumentsPanel tabId="lease" tabs={TABS} />);
    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
  });
});

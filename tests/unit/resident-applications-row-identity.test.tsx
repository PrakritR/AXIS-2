// @vitest-environment jsdom
//
// Regression coverage for the "clicking row 2 or 3 opens row 1" bug.
//
// In apply mode the panel auto-expands "the" in-progress application. It used
// to resolve that via `findInProgressRowForTarget(rows, null)`, which returns
// `inProgress[0]` — the FIRST in-progress row — whenever the URL carries no
// propertyId. Worse, `inProgressRow` is recomputed from `rows` on every render,
// so a background sync tick (new array → new object ref) re-fired the
// auto-expand effect and snapped the expansion BACK onto that first row,
// hijacking clicks on every other row. A resident could then withdraw or edit
// the WRONG application without realising.
//
// The fix: auto-open ONLY the URL-targeted application, or (bare /apply) the
// SOLE in-progress draft; never an arbitrary first-of-many, and fire once per
// resolved id so a tick can't re-snap. These tests drive the real panel.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { DemoApplicantRow } from "@/data/demo-portal";

let ROWS: DemoApplicantRow[] = [];
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/resident/applications/apply",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/hooks/use-portal-session", () => ({
  usePortalSession: () => ({ email: "jamie.rivera@example.com", ready: true }),
}));
vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: () => {} }),
}));
vi.mock("@/lib/manager-applications-storage", () => ({
  MANAGER_APPLICATIONS_EVENT: "manager-applications-changed",
  syncManagerApplicationsFromServer: () => Promise.resolve(),
  readManagerApplicationRows: () => ROWS,
  replaceManagerApplicationRowInCache: () => {},
  normalizeApplicationAxisId: (id: string) => id,
}));
vi.mock("@/lib/demo/demo-session", () => ({ isDemoModeActive: () => false }));
vi.mock("@/lib/resident-public-nav", () => ({
  residentBrowseFromApplicationHref: () => "/rent/browse",
}));
vi.mock("@/components/portal/manager-applications", () => ({ ApplicationDocumentPreview: () => null }));
vi.mock("@/components/portal/resident-application-editor", () => ({ ResidentApplicationEditor: () => null }));
vi.mock("@/components/marketing/rental-application-finish-panel", () => ({ GroupShareCallout: () => null }));
vi.mock("@/components/marketing/rental-application-wizard", () => ({ RentalApplicationWizard: () => null }));

import { ResidentApplicationsPanel } from "@/components/portal/resident-applications-panel";

function inProgressRow(id: string, propertyId: string, property: string): DemoApplicantRow {
  return {
    id,
    name: "Jamie Rivera",
    email: "jamie.rivera@example.com",
    property,
    propertyId,
    stage: "In progress",
    bucket: "pending",
    detail: "Started",
    application: { propertyId, email: "jamie.rivera@example.com" },
  } as DemoApplicantRow;
}

function submittedRow(id: string, propertyId: string, property: string): DemoApplicantRow {
  return {
    id,
    name: "Jamie Rivera",
    email: "jamie.rivera@example.com",
    property,
    propertyId,
    stage: "Submitted",
    bucket: "pending",
    detail: "",
    application: { propertyId, email: "jamie.rivera@example.com" },
  } as DemoApplicantRow;
}

/** Desktop table rows only (the dual-mount also renders mobile cards). */
function expandedRowIds(): string[] {
  return [...document.querySelectorAll('tr[id^="resident-application-"][aria-expanded="true"]')].map((r) =>
    r.id.replace("resident-application-", ""),
  );
}

function desktopRow(id: string): HTMLElement {
  const el = [...document.querySelectorAll<HTMLElement>(`tr#resident-application-${id}`)][0];
  if (!el) throw new Error(`row ${id} not rendered`);
  return el;
}

afterEach(() => {
  cleanup();
  ROWS = [];
  searchParams = new URLSearchParams();
});

describe("ResidentApplicationsPanel — each row opens its OWN application", () => {
  it("with several in-progress drafts and no URL target, auto-expands NONE (not the first)", async () => {
    ROWS = [
      inProgressRow("PROPLANE-AAAA0001", "mgr-test-magnolia", "Magnolia House"),
      inProgressRow("PROPLANE-BBBB0002", "mgr-test-alder", "Alder Row"),
      submittedRow("PROPLANE-CCCC0003", "mgr-test-cedar", "Cedar Flat"),
    ];
    await act(async () => {
      render(<ResidentApplicationsPanel applyMode />);
    });
    // Old code auto-expanded PROPLANE-AAAA0001 (inProgress[0]); the fix opens none.
    expect(expandedRowIds()).toEqual([]);
  });

  it("resumes the sole in-progress draft on bare /apply", async () => {
    ROWS = [
      submittedRow("PROPLANE-CCCC0003", "mgr-test-cedar", "Cedar Flat"),
      inProgressRow("PROPLANE-AAAA0001", "mgr-test-magnolia", "Magnolia House"),
    ];
    await act(async () => {
      render(<ResidentApplicationsPanel applyMode />);
    });
    expect(expandedRowIds()).toEqual(["PROPLANE-AAAA0001"]);
  });

  it("keeps a manually opened row open — a sync tick never snaps back to the in-progress row", async () => {
    ROWS = [
      submittedRow("PROPLANE-CCCC0003", "mgr-test-cedar", "Cedar Flat"),
      inProgressRow("PROPLANE-AAAA0001", "mgr-test-magnolia", "Magnolia House"),
    ];
    await act(async () => {
      render(<ResidentApplicationsPanel applyMode />);
    });
    // Auto-opened the sole draft, then the resident clicks the submitted row.
    await act(async () => {
      fireEvent.click(desktopRow("PROPLANE-CCCC0003"));
    });
    expect(expandedRowIds()).toEqual(["PROPLANE-CCCC0003"]);

    // A background sync rebuilds `rows` (new object refs). Pre-fix this re-fired
    // the auto-expand and dragged the expansion back to PROPLANE-AAAA0001.
    ROWS = [...ROWS];
    await act(async () => {
      window.dispatchEvent(new Event("manager-applications-changed"));
    });
    expect(expandedRowIds()).toEqual(["PROPLANE-CCCC0003"]);
  });
});

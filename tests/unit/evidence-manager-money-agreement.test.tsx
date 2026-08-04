// @vitest-environment jsdom
//
// EVIDENCE HARNESS (F-PAY-1).
//
// The pure-logic proof lives in `manager-payments-dashboard-agreement.test.ts`.
// This file renders the two REAL components a manager actually looks at —
// `ManagerDashboard` and `ManagerPayments` — against ONE seeded portfolio, and
// asserts the numbers printed on screen agree. When EVIDENCE_DIR is set it also
// writes the rendered HTML of each surface so a reviewer can see them.
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { HouseholdCharge } from "@/lib/household-charges";

const MANAGER_ID = "mgr-evidence";

// ── One seeded portfolio, shaped like the audited one ────────────────────────
// 20 charges. Every rule the two surfaces used to disagree about is present.
function charge(over: Partial<HouseholdCharge> & Pick<HouseholdCharge, "id">): HouseholdCharge {
  return {
    createdAt: "2026-06-01T00:00:00.000Z",
    residentEmail: "maya@example.com",
    residentName: "Maya Chen",
    residentUserId: null,
    propertyId: "prop-magnolia",
    propertyLabel: "The Magnolia · 2B",
    managerUserId: MANAGER_ID,
    kind: "rent",
    title: "August rent",
    amountLabel: "$1,850.00",
    balanceLabel: "$1,850.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    dueDateLabel: "2026-08-01",
    ...over,
  } as HouseholdCharge;
}

const CHARGES: HouseholdCharge[] = [
  // A housed resident who ALSO holds a second, pending application elsewhere.
  // The old rule hid every one of these from BOTH surfaces.
  charge({ id: "c1", dueDateLabel: "2026-09-01", title: "September rent" }),
  charge({ id: "c2", dueDateLabel: "2026-07-01", title: "July rent" }),
  charge({ id: "c3", kind: "utilities", title: "July utilities", amountLabel: "$140.00", balanceLabel: "$140.00", dueDateLabel: "2026-07-05" }),
  // A pending applicant carrying a real application fee.
  charge({
    id: "c4",
    residentEmail: "jordan@example.com",
    residentName: "Jordan Fox",
    kind: "application_fee",
    title: "Application fee",
    amountLabel: "$45.00",
    balanceLabel: "$45.00",
    dueDateLabel: "2026-07-20",
  }),
  // An ACH payment mid-clearing: Pending on both surfaces, never Overdue.
  charge({
    id: "c5",
    residentEmail: "riley@example.com",
    residentName: "Riley Poe",
    status: "processing",
    title: "August rent",
    amountLabel: "$1,600.00",
    balanceLabel: "$1,600.00",
    dueDateLabel: "2026-07-01",
  }),
  // Settled states that must never read as money still owed.
  charge({ id: "c6", status: "cancelled", balanceLabel: "$0.00", title: "Cancelled cleaning fee", dueDateLabel: "2026-06-01" }),
  charge({ id: "c7", status: "paid", paidAt: "2026-07-02", balanceLabel: "$0.00", title: "June rent", dueDateLabel: "2026-06-01" }),
  // A manager-entered one-off for someone who HAS moved out — deliberately kept.
  charge({
    id: "hc_mgr_oneoff_1",
    residentEmail: "gone@example.com",
    residentName: "Sam Lee",
    kind: "other_cost",
    title: "Carpet damage",
    amountLabel: "$300.00",
    balanceLabel: "$300.00",
    dueDateLabel: "2026-06-15",
  }),
  // A genuinely moved-out resident's ordinary charge — dropped from both.
  charge({
    id: "c9",
    residentEmail: "gone@example.com",
    residentName: "Sam Lee",
    title: "May rent",
    dueDateLabel: "2026-05-01",
  }),
  // The internal payer account — dropped from both, by EXACT name.
  charge({ id: "c10", residentName: "Sharad Ramachandran", residentEmail: "internal@example.com", title: "Internal transfer" }),
  // …and a real resident whose name merely CONTAINS that token. The substring
  // rule this replaced hid her money from her manager entirely.
  charge({
    id: "c11",
    residentName: "Sharada Iyer",
    residentEmail: "sharada@example.com",
    title: "August rent",
    amountLabel: "$1,725.00",
    balanceLabel: "$1,725.00",
    dueDateLabel: "2026-06-25",
  }),
];

const APPLICATIONS: DemoApplicantRow[] = [
  { id: "AXIS-1", name: "Maya Chen", email: "maya@example.com", property: "The Magnolia · 2B", stage: "Current resident", bucket: "approved", managerUserId: MANAGER_ID } as DemoApplicantRow,
  // Maya's SECOND application — pending, not a move-out.
  { id: "AXIS-2", name: "Maya Chen", email: "maya@example.com", property: "Cedar House · 1A", stage: "Submitted", bucket: "pending", managerUserId: MANAGER_ID } as DemoApplicantRow,
  { id: "AXIS-3", name: "Jordan Fox", email: "jordan@example.com", property: "Cedar House · 3C", stage: "Screening", bucket: "pending", managerUserId: MANAGER_ID } as DemoApplicantRow,
  { id: "AXIS-4", name: "Riley Poe", email: "riley@example.com", property: "The Magnolia · 4A", stage: "Current resident", bucket: "approved", managerUserId: MANAGER_ID } as DemoApplicantRow,
  { id: "AXIS-5", name: "Sam Lee", email: "gone@example.com", property: "The Magnolia · 1C", stage: "Moved out", bucket: "approved", managerUserId: MANAGER_ID } as DemoApplicantRow,
  { id: "AXIS-6", name: "Sharada Iyer", email: "sharada@example.com", property: "Cedar House · 2B", stage: "Current resident", bucket: "approved", managerUserId: MANAGER_ID } as DemoApplicantRow,
];

// ── Mocks: only the storage/transport layer. All scoping + bucketing is real. ─
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/dashboard",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: MANAGER_ID, email: "manager@example.com", ready: true }),
}));
vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: () => {} }),
}));
vi.mock("@/lib/household-charges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/household-charges")>();
  return {
    ...actual,
    syncHouseholdChargesFromServer: () => Promise.resolve(),
    readChargesForManager: () => CHARGES,
    reconcileApprovedResidentPaymentSchedules: () => {},
  };
});
vi.mock("@/lib/manager-applications-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-applications-storage")>();
  return {
    ...actual,
    syncManagerApplicationsFromServer: () => Promise.resolve(APPLICATIONS),
    readManagerApplicationRows: () => APPLICATIONS,
  };
});
vi.mock("@/lib/manager-portfolio-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-portfolio-access")>();
  return { ...actual, collectLinkedPropertyIdsForModule: () => new Set<string>() };
});
vi.mock("@/lib/lease-pipeline-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lease-pipeline-storage")>();
  return { ...actual, syncLeasePipelineFromServer: () => Promise.resolve([]), readLeasePipeline: () => [] };
});
vi.mock("@/lib/portal-inbox-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-inbox-storage")>();
  return {
    ...actual,
    syncPersistedInboxFromServer: () => Promise.resolve([]),
    countUnopenedPersistedInbox: () => 0,
    loadPersistedInbox: () => [],
  };
});
vi.mock("@/lib/demo-property-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo-property-pipeline")>();
  return {
    ...actual,
    syncPropertyPipelineFromServer: () => Promise.resolve(undefined),
    hasCachedPropertyPipeline: () => false,
    readExtraListingsForUser: () => [],
    readAllExtraListings: () => [],
    readScopedExtraListings: () => [],
    readPendingManagerPropertiesForUser: () => [],
    readAllPendingManagerProperties: () => [],
  };
});
vi.mock("@/lib/manager-work-orders-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-work-orders-storage")>();
  return { ...actual, syncManagerWorkOrdersFromServer: () => Promise.resolve([]), readManagerWorkOrderRows: () => [] };
});
vi.mock("@/lib/manager-vendors-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-vendors-storage")>();
  return { ...actual, syncManagerVendorsFromServer: () => Promise.resolve([]), readOwnActiveManagerVendorRows: () => [] };
});
vi.mock("@/lib/manager-outgoing-payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-outgoing-payments")>();
  return {
    ...actual,
    syncManagerOutgoingExpensesFromServer: () => Promise.resolve([]),
    readManagerOutgoingExpenses: () => [],
  };
});
vi.mock("@/lib/demo/demo-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/demo-session")>();
  return { ...actual, isDemoModeActive: () => false, resolveManagerScopeUserId: (id: string | null) => id };
});

import { ManagerDashboard } from "@/components/portal/manager-dashboard";
import { ManagerPayments } from "@/components/portal/manager-payments";

// The panels fire a couple of background reads (scheduled reminder messages);
// jsdom has no origin, so answer them locally instead of letting them reject.
vi.stubGlobal("fetch", async () =>
  new Response(JSON.stringify({ messages: [], settings: null, rows: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
);

const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? "";
const captured: { name: string; html: string }[] = [];

function capture(name: string, node: HTMLElement) {
  captured.push({ name, html: node.innerHTML });
}

afterAll(() => {
  if (!EVIDENCE_DIR || captured.length === 0) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  for (const { name, html } of captured) {
    writeFileSync(join(EVIDENCE_DIR, `${name}.fragment.html`), html, "utf8");
  }
});

describe("F-PAY-1 — dashboard and Payments print the same numbers", () => {
  it("renders both surfaces from one portfolio and they agree", async () => {
    // ── The dashboard's Payments group ──────────────────────────────────────
    const dash = render(<ManagerDashboard displayName="Alex" />);
    const pendingPill = await screen.findByText(/^\d+ pending$/);
    const groupCard = pendingPill.closest("[data-section-id='payments'], section, div") as HTMLElement;
    expect(groupCard).toBeTruthy();
    capture("f-pay-1-dashboard", dash.container.firstElementChild as HTMLElement);

    // "View all N →" and the "N pending · N overdue" summary.
    const viewAll = await screen.findByText(/View all \d+/);
    const dashboardTotal = Number(/View all (\d+)/.exec(viewAll.textContent ?? "")?.[1]);
    const dashPending = Number(/^(\d+) pending$/.exec(pendingPill.textContent ?? "")?.[1]);
    const dashOverdue = Number(
      /^(\d+) overdue$/.exec(screen.getByText(/^\d+ overdue$/).textContent ?? "")?.[1],
    );

    cleanup();

    // ── /portal/payments, the page that link lands on ───────────────────────
    const pay = render(<ManagerPayments direction="incoming" bucket="pending" />);
    const pendingTab = await screen.findByRole("link", { name: /^Pending/ });
    const overdueTab = screen.getByRole("link", { name: /^Overdue/ });
    const paidTab = screen.getByRole("link", { name: /^Paid/ });
    capture("f-pay-1-payments", pay.container.firstElementChild as HTMLElement);

    const tabCount = (el: HTMLElement) => Number(/(\d+)/.exec(el.textContent ?? "")?.[1] ?? "0");
    const payPending = tabCount(pendingTab);
    const payOverdue = tabCount(overdueTab);
    const payPaid = tabCount(paidTab);

    // eslint-disable-next-line no-console
    console.log(
      `\nF-PAY-1 evidence\n` +
        `  dashboard  → View all ${dashboardTotal}  (${dashPending} pending · ${dashOverdue} overdue)\n` +
        `  /payments  → Pending ${payPending} · Overdue ${payOverdue} · Paid ${payPaid}\n`,
    );

    expect(dashPending).toBe(payPending);
    expect(dashOverdue).toBe(payOverdue);
    expect(dashboardTotal).toBe(payPending + payOverdue);

    cleanup();

    // ── The Overdue tab: the rows the audit found missing are really listed ──
    const overdueView = render(<ManagerPayments direction="incoming" bucket="overdue" />);
    await screen.findByRole("link", { name: /^Overdue/ });
    capture("f-pay-1-payments-overdue", overdueView.container.firstElementChild as HTMLElement);

    const list = overdueView.container;
    // The housed resident who also holds a second, pending application.
    expect(within(list).queryAllByText(/Maya Chen/).length).toBeGreaterThan(0);
    // The pending applicant's real application fee.
    expect(within(list).queryAllByText(/Jordan Fox/).length).toBeGreaterThan(0);
    // The resident whose NAME merely contains the internal-account token.
    expect(within(list).queryAllByText(/Sharada Iyer/).length).toBeGreaterThan(0);
    // The internal account itself is still excluded.
    expect(within(list).queryAllByText(/Sharad Ramachandran/).length).toBe(0);
    // The genuinely moved-out resident: manager one-off kept, ordinary rent gone.
    expect(within(list).queryAllByText(/Carpet damage/).length).toBeGreaterThan(0);
    expect(within(list).queryAllByText(/May rent/).length).toBe(0);
  });
});

// @vitest-environment jsdom
//
// The Communication nav badge must never disagree with the Communication list.
//
// While the SMS UI is hidden (`smsUiEnabled` false, the default) an inbound-SMS
// notice FALLS THROUGH into the conversation list via `keepSmsLike`. This hook
// is a client hook with no access to that server-resolved flag, so it must count
// every unread inbox row — filtering SMS-like rows out here would leave an
// inbound text visible in the list but missing from the sidebar badge.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

const EMAIL_UNREAD = {
  id: "thr-1000000001",
  folder: "inbox",
  from: "Property manager",
  email: "manager@example.com",
  subject: "Welcome to your unit",
  body: "Move-in info",
  time: "Jul 20, 2026",
  unread: true,
};
const SMS_NOTICE_UNREAD = {
  id: "thr-1000000002",
  folder: "inbox",
  from: "+12065550147",
  email: "+12065550147",
  subject: "New SMS in your inbox",
  body: "On my way",
  time: "Jul 21, 2026",
  unread: true,
};
const EMAIL_READ = { ...EMAIL_UNREAD, id: "thr-1000000003", unread: false };
const SENT = { ...EMAIL_UNREAD, id: "thr-1000000004", folder: "sent" };

const ROWS = [EMAIL_UNREAD, SMS_NOTICE_UNREAD, EMAIL_READ, SENT];

vi.mock("@/lib/portal-inbox-storage", () => ({
  MANAGER_INBOX_STORAGE_KEY: "manager-inbox",
  RESIDENT_INBOX_STORAGE_KEY: "resident-inbox",
  loadPersistedInbox: () => ROWS,
}));
vi.mock("@/components/portal/resident-inbox-panel", () => ({ RESIDENT_INBOX_THREAD_FALLBACK: [] }));
vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: "user-1", email: "u@example.com", ready: true }),
}));
vi.mock("@/lib/portal-data-store", () => ({ prefetchPortalData: () => Promise.resolve() }));
vi.mock("@/lib/demo-admin-partner-inbox", () => ({ readInboxMessages: () => [] }));
vi.mock("@/lib/demo-admin-scheduling", () => ({
  readPartnerInquiries: () => [],
  syncScheduleRecordsFromServer: () => Promise.resolve(),
}));
vi.mock("@/lib/demo-admin-ui", () => ({ ADMIN_UI_EVENT: "admin-ui" }));
vi.mock("@/lib/demo-property-pipeline", () => ({ PROPERTY_PIPELINE_EVENT: "property-pipeline" }));
vi.mock("@/lib/manager-portfolio-access", () => ({
  applicationVisibleToPortalUser: () => true,
  moduleRowVisibleToPortalUser: () => true,
}));
vi.mock("@/lib/rental-application/in-progress-application", () => ({
  isSubmittedPendingApplicationRow: () => false,
}));
vi.mock("@/lib/manager-applications-storage", () => ({
  MANAGER_APPLICATIONS_EVENT: "manager-applications",
  readManagerApplicationRows: () => [],
}));
vi.mock("@/lib/manager-work-orders-storage", () => ({
  MANAGER_WORK_ORDERS_EVENT: "manager-work-orders",
  readManagerWorkOrderRows: () => [],
}));
vi.mock("@/lib/service-requests-storage", () => ({
  SERVICE_REQUESTS_EVENT: "service-requests",
  readAllServiceRequests: () => [],
}));
vi.mock("@/lib/portal-bug-feedback", () => ({ readBugFeedbackRows: () => [] }));

import { usePortalNavCounts } from "@/hooks/use-portal-nav-counts";

afterEach(cleanup);

describe("Communication nav badge counts what the conversation list shows", () => {
  it("counts an unread inbound-SMS notice for the resident badge", () => {
    const { result } = renderHook(() => usePortalNavCounts("resident"));
    // Both unread inbox rows — the email AND the SMS-like notice. Not 1.
    expect(result.current.communication).toBe(2);
  });

  it("counts an unread inbound-SMS notice for the manager badge", () => {
    const { result } = renderHook(() => usePortalNavCounts("manager"));
    expect(result.current.communication).toBe(2);
  });
});

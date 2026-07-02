"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import type { DemoPortalRole } from "@/lib/demo/demo-session";
import { DEMO_MANAGER_USER_ID, DEMO_RESIDENT_EMAIL, DEMO_RESIDENT_NAME, DEMO_RESIDENT_USER_ID } from "@/lib/demo/demo-session";
import type { PortalSection } from "@/lib/portal-types";

const loading = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">Loading…</div>
);

// Manager / pro panels
const ManagerDashboard = dynamic(() => import("@/components/portal/manager-dashboard").then((m) => m.ManagerDashboard), { ssr: false, loading });
const ManagerProperties = dynamic(() => import("@/components/portal/manager-properties").then((m) => m.ManagerProperties), { ssr: false, loading });
const ManagerApplications = dynamic(() => import("@/components/portal/manager-applications").then((m) => m.ManagerApplications), { ssr: false, loading });
const ManagerResidents = dynamic(() => import("@/components/portal/manager-residents").then((m) => m.ManagerResidents), { ssr: false, loading });
const ManagerLeases = dynamic(() => import("@/components/portal/manager-leases").then((m) => m.ManagerLeases), { ssr: false, loading });
const ManagerPayments = dynamic(() => import("@/components/portal/manager-payments").then((m) => m.ManagerPayments), { ssr: false, loading });
const ManagerInbox = dynamic(() => import("@/components/portal/manager-inbox").then((m) => m.ManagerInbox), { ssr: false, loading });
const ManagerAllServicesPanel = dynamic(() => import("@/components/portal/manager-all-services-panel").then((m) => m.ManagerAllServicesPanel), { ssr: false, loading });
const ManagerFinancesPanel = dynamic(() => import("@/components/portal/manager-finances-panel").then((m) => m.ManagerFinancesPanel), { ssr: false, loading });
const ManagerDocumentsPanel = dynamic(() => import("@/components/portal/manager-documents-panel").then((m) => m.ManagerDocumentsPanel), { ssr: false, loading });
const PortalCalendar = dynamic(() => import("@/components/portal/portal-calendar").then((m) => m.PortalCalendar), { ssr: false, loading });
const ProAccountLinksPanel = dynamic(() => import("@/components/portal/pro-account-links-panel").then((m) => m.ProAccountLinksPanel), { ssr: false, loading });
const ManagerPromotion = dynamic(() => import("@/components/portal/manager-promotion").then((m) => m.ManagerPromotion), { ssr: false, loading });
const PortalBugFeedbackPanel = dynamic(() => import("@/components/portal/portal-bug-feedback-panel").then((m) => m.PortalBugFeedbackPanel), { ssr: false, loading });

// Admin panels
const AdminDashboard = dynamic(() => import("@/components/portal/admin-dashboard").then((m) => m.AdminDashboard), { ssr: false, loading });
const AdminPropertiesClient = dynamic(() => import("@/components/portal/admin-properties-client").then((m) => m.AdminPropertiesClient), { ssr: false, loading });
const AdminLeasesClient = dynamic(() => import("@/components/portal/admin-leases-client").then((m) => m.AdminLeasesClient), { ssr: false, loading });
const AdminEventsClient = dynamic(() => import("@/components/portal/admin-events-client").then((m) => m.AdminEventsClient), { ssr: false, loading });
const AdminInboxClient = dynamic(() => import("@/components/portal/admin-inbox-client").then((m) => m.AdminInboxClient), { ssr: false, loading });
const AdminBugFeedbackClient = dynamic(() => import("@/components/portal/admin-bug-feedback-client").then((m) => m.AdminBugFeedbackClient), { ssr: false, loading });
const AdminAxisUsersClient = dynamic(() => import("@/components/portal/admin-axis-users-client").then((m) => m.AdminAxisUsersClient), { ssr: false, loading });

// Resident panels
const ResidentDashboard = dynamic(() => import("@/components/portal/resident-dashboard").then((m) => m.ResidentDashboard), { ssr: false, loading });
const ResidentLeasePanel = dynamic(() => import("@/components/portal/resident-lease-panel").then((m) => m.ResidentLeasePanel), { ssr: false, loading });
const ResidentPaymentsPanel = dynamic(() => import("@/components/portal/resident-payments-panel").then((m) => m.ResidentPaymentsPanel), { ssr: false, loading });
const ResidentServicesPanel = dynamic(() => import("@/components/portal/resident-services-panel").then((m) => m.ResidentServicesPanel), { ssr: false, loading });
const ResidentInboxPanel = dynamic(() => import("@/components/portal/resident-inbox-panel").then((m) => m.ResidentInboxPanel), { ssr: false, loading });
const ResidentDocumentsPanel = dynamic(() => import("@/components/portal/resident-documents-panel").then((m) => m.ResidentDocumentsPanel), { ssr: false, loading });
const ResidentProfilePanel = dynamic(() => import("@/components/portal/resident-profile-panel").then((m) => m.ResidentProfilePanel), { ssr: false, loading });

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <ManagerPortalPageShell title={title}>
      <PortalDataTableEmpty message={message} icon="default" />
    </ManagerPortalPageShell>
  );
}

export function DemoSectionRenderer({
  role,
  section,
  tab,
  meta,
}: {
  role: DemoPortalRole;
  section: string;
  tab: string | null;
  meta: PortalSection | undefined;
}): ReactNode {
  const firstTab = meta?.tabs[0]?.id;
  const tabId = tab ?? firstTab ?? "index";
  const basePath = role === "resident" ? "/resident" : role === "admin" ? "/admin" : "/portal";

  if (role === "manager") {
    switch (section) {
      case "dashboard":
        return <ManagerDashboard />;
      case "properties":
        return <ManagerProperties />;
      case "calendar":
        return <PortalCalendar portal="manager" initialUserId={DEMO_MANAGER_USER_ID} />;
      case "applications":
        return <ManagerApplications />;
      case "residents":
        return <ManagerResidents tabId={(tabId as "current" | "previous") ?? "current"} />;
      case "leases":
        return <ManagerLeases />;
      case "payments":
        return <ManagerPayments />;
      case "services":
        return (
          <ManagerAllServicesPanel
            tabId={(tabId as "requests" | "work-orders" | "vendors") ?? "requests"}
            basePath={basePath}
          />
        );
      case "inbox":
        return <ManagerInbox tabId={tabId} />;
      case "financials":
        return <ManagerFinancesPanel tabId={tabId} basePath={basePath} />;
      case "documents":
        return <ManagerDocumentsPanel tabId={tabId} basePath={basePath} />;
      case "relationships":
        return <ProAccountLinksPanel userId={DEMO_MANAGER_USER_ID} />;
      case "promotion":
        return <ManagerPromotion />;
      case "bugs-feedback":
        return <PortalBugFeedbackPanel reporterRole="manager" />;
      case "profile":
        return <Placeholder title="Settings" message="Profile settings appear here for your real account." />;
      default:
        return <Placeholder title={meta?.label ?? "Section"} message="Nothing to show yet." />;
    }
  }

  if (role === "admin") {
    switch (section) {
      case "dashboard":
        return <AdminDashboard />;
      case "properties":
        return <AdminPropertiesClient />;
      case "leases":
        return <AdminLeasesClient />;
      case "events":
        return <AdminEventsClient />;
      case "inbox":
        return <AdminInboxClient tabId={tabId} />;
      case "bugs-feedback":
        return <AdminBugFeedbackClient />;
      case "axis-users":
        return <AdminAxisUsersClient />;
      case "profile":
        return <Placeholder title="Settings" message="Admin profile settings appear here for your real account." />;
      default:
        return <Placeholder title={meta?.label ?? "Section"} message="Nothing to show yet." />;
    }
  }

  // resident
  switch (section) {
    case "dashboard":
      return (
        <ResidentDashboard
          applicationApproved
          displayName={DEMO_RESIDENT_NAME}
          residentEmail={DEMO_RESIDENT_EMAIL}
          residentUserId={DEMO_RESIDENT_USER_ID}
          managerSubscriptionTier="paid"
        />
      );
    case "lease":
      return (
        <ManagerPortalPageShell title="Lease">
          <ResidentLeasePanel />
        </ManagerPortalPageShell>
      );
    case "payments":
      return <ResidentPaymentsPanel />;
    case "move-in":
      return <ResidentMoveInDemo />;
    case "services":
      return <ResidentServicesPanel tabId={(tabId as "requests" | "work-orders") ?? "requests"} basePath={basePath} />;
    case "inbox":
      return <ResidentInboxPanel tabId={tabId} />;
    case "documents":
      return <ResidentDocumentsPanel tabId={tabId} basePath={basePath} tabs={meta?.tabs ?? []} />;
    case "bugs-feedback":
      return <PortalBugFeedbackPanel reporterRole="resident" />;
    case "profile":
      return <ResidentProfilePanel />;
    default:
      return <Placeholder title={meta?.label ?? "Section"} message="Nothing to show yet." />;
  }
}

function ResidentMoveInDemo() {
  return (
    <ManagerPortalPageShell title="Move-in">
      <div className="glass-card rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Move-in</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">You&apos;re all set for The Pioneer</h2>
        <ul className="mt-4 space-y-2 text-sm text-muted">
          <li>• Keys ready at the Pioneer Square office after 3:00 PM on move-in day.</li>
          <li>• First month&apos;s rent is confirmed paid.</li>
          <li>• Building Wi-Fi and utilities activate automatically on your start date.</li>
        </ul>
      </div>
    </ManagerPortalPageShell>
  );
}

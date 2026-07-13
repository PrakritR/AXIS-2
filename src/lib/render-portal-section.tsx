import { AdminDashboard } from "@/components/portal/admin-dashboard";
import { ManagerDashboard } from "@/components/portal/manager-dashboard";
import { ManagerLeases } from "@/components/portal/manager-leases";
import { ManagerPayments } from "@/components/portal/manager-payments";
import { ManagerPromotion } from "@/components/portal/manager-promotion";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { ManagerProfile } from "@/components/portal/manager-profile";
import { AdminCreateManagerClient } from "@/components/portal/admin-create-manager-client";
import { AdminCreateResidentClient } from "@/components/portal/admin-create-resident-client";
import { AdminAxisUsersClient } from "@/components/portal/admin-axis-users-client";
import { AdminPropertiesClient } from "@/components/portal/admin-properties-client";
import { AdminEventsClient } from "@/components/portal/admin-events-client";
import { AdminProfileSection } from "@/components/portal/admin-profile-section";
import { AdminInboxClient } from "@/components/portal/admin-inbox-client";
import { AdminBugFeedbackClient } from "@/components/portal/admin-bug-feedback-client";
import { ResidentDashboard } from "@/components/portal/resident-dashboard";
import { ResidentMoveInPanel } from "@/components/portal/resident-move-in-panel";
import { ResidentInboxPanel } from "@/components/portal/resident-inbox-panel";
import { ResidentPaymentsPanel } from "@/components/portal/resident-payments-panel";
import { ResidentFinancialsPanel } from "@/components/portal/resident-financials-panel";
import { ResidentDocumentsPanel } from "@/components/portal/resident-documents-panel";
import { ResidentApplicationsPanel } from "@/components/portal/resident-applications-panel";
import { ResidentLeasePanel } from "@/components/portal/resident-lease-panel";
import { ResidentProfilePanel } from "@/components/portal/resident-profile-panel";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { VendorDashboard } from "@/components/portal/vendor-dashboard";
import { VendorWorkOrdersPanel } from "@/components/portal/vendor-work-orders-panel";
import { VendorCalendarPanel } from "@/components/portal/vendor-calendar-panel";
import { VendorInboxPanel } from "@/components/portal/vendor-inbox-panel";
import { VendorFinancesPanel } from "@/components/portal/vendor-finances-panel";
import { VendorPaymentsPanel } from "@/components/portal/vendor-payments-panel";
import { VendorDocumentsPanel } from "@/components/portal/vendor-documents-panel";
import { VendorSettingsPanel } from "@/components/portal/vendor-settings-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { PortalTierPaywall } from "@/components/portal/portal-tier-paywall";
import { PortalWorkspaceClient } from "@/components/portal/portal-workspace-client";
import {
  loadManagerAllServicesPanel,
  loadManagerApplications,
  loadManagerDocumentsPanel,
  loadManagerFinancesPanel,
  loadManagerInbox,
  loadManagerProperties,
  loadManagerResidents,
  loadPortalCalendar,
  loadProAccountLinksPanel,
  loadResidentServicesPanel,
} from "@/lib/portal-panel-imports";
import type { Crumb } from "@/components/layout/breadcrumbs";
import type { TabItem } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { getEffectiveSessionForPortal, getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { managerSectionAllowedForTier, residentSectionAllowedForManagerTier } from "@/lib/manager-access";
import { getManagerSubscriptionTier, getManagerSubscriptionTierByManagerId } from "@/lib/manager-access-server";
import { loadResidentLeaseSignedStatus, loadResidentPortalAccessState, residentHasFullPortalAccess, residentPortalHomePath } from "@/lib/resident-portal-access";
import { findSection, getPortalDefinition } from "@/lib/portals";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";
import { getProPortalRenderContext } from "@/lib/portals/pro-nav";
import { buildPortalWorkspaceModel } from "@/lib/portal-workspace-model";
import type { PortalKind } from "@/lib/portal-types";
import { notFound, redirect } from "next/navigation";

const LEGACY_FINANCIALS_TAB_MAP: Record<string, string> = {
  "rent-roll": "income",
  delinquency: "summary",
  "income-statement": "expenses",
  "lease-expiration": "income-documents",
  vendors: "expenses",
  "profit-loss": "expenses",
};

const DOCUMENTS_TABS = ["library", "templates", "applications", "leases", "income-documents", "expense-documents", "occupancy", "1099", "tax-summary"] as const;

const LEGACY_DOCUMENTS_TAB_MAP: Record<string, string> = {
  summary: "tax-summary",
  "rent-receipts": "income-documents",
  "rental-days": "income-documents",
};
const FINANCIALS_TABS = ["income", "expenses", "trial-balance", "balance-sheet", "general-ledger", "cash-flow-statement", "payout-history", "trust-account-balance", "security-deposits", "financial-diagnostics", "ap-aging", "bills", "budget-vs-actual", "bank-reconciliation", "owner-statement", "owner-distributions"] as const;

const MANAGER_INBOX_TABS = ["unopened", "opened", "schedule", "sent", "trash", "notifications"] as const;

function isManagerInboxTab(tab: string): tab is (typeof MANAGER_INBOX_TABS)[number] {
  return (MANAGER_INBOX_TABS as readonly string[]).includes(tab);
}

const LEGACY_DOCUMENTS_TO_FINANCIALS: Record<string, string> = {
  expenses: "expenses",
  "profit-loss": "expenses",
};

async function renderManagerFinancesSection(
  section: string,
  tabParts: string[] | undefined,
  basePath: string,
  kind: PortalKind,
  tier: "free" | "paid" | null,
) {
  if (section !== "financials") return null;
  if (!tabParts?.length) {
    redirect(`${basePath}/financials/income`);
  }
  if (tabParts.length > 1) notFound();
  const finTab = tabParts[0]!;
  if (!FINANCIALS_TABS.includes(finTab as (typeof FINANCIALS_TABS)[number])) {
    const mapped = LEGACY_FINANCIALS_TAB_MAP[finTab];
    if (mapped) redirect(`${basePath}/financials/${mapped}`);
    notFound();
  }
  const ManagerFinancesPanel = await loadManagerFinancesPanel();
  return subscriptionGated(
    <ManagerFinancesPanel tabId={finTab} basePath={basePath} />,
    kind,
    "financials",
    tier,
  );
}

async function renderManagerDocumentsSection(
  section: string,
  tabParts: string[] | undefined,
  basePath: string,
  kind: PortalKind,
  tier: "free" | "paid" | null,
) {
  if (section !== "documents") return null;
  if (!tabParts?.length) {
    redirect(`${basePath}/documents/library`);
  }
  if (tabParts.length > 1) notFound();
  const docTab = tabParts[0]!;
  const legacyDocTab = LEGACY_DOCUMENTS_TAB_MAP[docTab];
  if (legacyDocTab) redirect(`${basePath}/documents/${legacyDocTab}`);
  const financesRedirect = LEGACY_DOCUMENTS_TO_FINANCIALS[docTab];
  if (financesRedirect) {
    redirect(`${basePath}/financials/${financesRedirect}`);
  }
  if (!DOCUMENTS_TABS.includes(docTab as (typeof DOCUMENTS_TABS)[number])) notFound();
  const ManagerDocumentsPanel = await loadManagerDocumentsPanel();
  return subscriptionGated(
    <ManagerDocumentsPanel tabId={docTab} basePath={basePath} />,
    kind,
    "documents",
    tier,
  );
}

function subscriptionGated(
  node: ReactNode,
  kind: PortalKind,
  section: string,
  tier: "free" | "paid" | null,
  featureLabel?: string,
  basePath = "/portal",
): ReactNode {
  if (kind !== "manager" && kind !== "pro") return node;
  if (managerSectionAllowedForTier(section, tier)) return node;
  return <PortalTierPaywall basePath={basePath} featureLabel={featureLabel} />;
}

function managerTierPaywall(
  kind: PortalKind,
  section: string,
  tier: "free" | "paid" | null,
  featureLabel: string,
  basePath: string,
): ReactNode | null {
  if (kind !== "manager" && kind !== "pro") return null;
  if (tier !== "free") return null;
  if (managerSectionAllowedForTier(section, tier)) return null;
  return <PortalTierPaywall basePath={basePath} featureLabel={featureLabel} />;
}

function ResidentFreeTierFeatureNotice({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <ManagerPortalPageShell title={title}>
        <div className="glass-card rounded-2xl px-5 py-6 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Property plan</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">Awaiting your property manager</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Access to <span className="font-semibold text-foreground">{title.toLowerCase()}</span> is not available while
            the property team is on the Free plan. They can enable this feature by upgrading to Pro or Business — there is
            nothing you need to do on your end.
          </p>
        </div>
      </ManagerPortalPageShell>
    </div>
  );
}

function residentManagerTierGate(
  section: string,
  managerTier: "free" | "paid" | null,
  featureLabel: string,
): ReactNode | null {
  if (residentSectionAllowedForManagerTier(section, managerTier)) return null;
  return <ResidentFreeTierFeatureNotice title={featureLabel} />;
}

export async function renderPortalSection(
  kind: PortalKind,
  section: string,
  tabParts?: string[],
) {
  const def = await getPortalDefinition(kind);

  if (section === "finances") {
    const defaultTab = kind === "resident" ? "summary" : "income";
    const tab = tabParts?.[0] ?? defaultTab;
    redirect(`${def.basePath}/financials/${tab}`);
  }

  if (kind === "admin" && (section === "managers" || section === "owners")) {
    redirect(`${def.basePath}/axis-users`);
  }

  if ((kind === "manager" || kind === "pro") && section === "upgrade") {
    redirect(MANAGER_PLAN_PORTAL_URL);
  }

  if ((kind === "manager" || kind === "pro") && section === "plan") {
    redirect(MANAGER_PLAN_PORTAL_URL);
  }

  if (kind === "manager" || kind === "pro") {
    if (section === "stripe") redirect(`${def.basePath}/payments`);
  }
  const residentCtx = kind === "resident" ? await getEffectiveSessionForPortal("resident") : null;
  const residentManagerTier =
    kind === "resident" && residentCtx?.profile?.manager_id?.trim()
      ? await getManagerSubscriptionTierByManagerId(residentCtx.profile.manager_id.trim())
      : null;
  const residentAccess =
    kind === "resident"
      ? await loadResidentPortalAccessState({
          userId: residentCtx?.user?.id ?? null,
          role: residentCtx?.profile?.role,
          email: residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null,
          managerSubscriptionTier: residentManagerTier,
        })
      : null;
  const residentWorkspaceUnlocked =
    kind === "resident"
      ? residentHasFullPortalAccess({
          applicationApproved: residentAccess?.applicationApproved ?? false,
          role: residentCtx?.profile?.role,
          email: residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null,
          managerSubscriptionTier: residentManagerTier,
        })
      : false;
  if (kind === "resident" && section === "applications") {
    if (tabParts?.length) notFound();
    return <ResidentApplicationsPanel />;
  }
  if (kind === "resident" && residentAccess && !residentAccess.leaseAccessUnlocked) {
    const allowDashboard =
      section === "dashboard" && residentAccess.hasCompletedApplicationSubmission;
    if (!allowDashboard && section !== "applications" && section !== "profile") {
      redirect(residentPortalHomePath(residentAccess));
    }
  }
  // Legacy path support: work-orders moved under Services tabs.
  if (
    (kind === "manager" || kind === "pro") &&
    section === "work-orders"
  ) {
    redirect(`${def.basePath}/services/work-orders`);
  }

  // Legacy path support: Vendors was briefly its own top-level nav section;
  // it's back to being the Services "vendors" tab (redundant otherwise).
  if ((kind === "manager" || kind === "pro") && section === "vendors") {
    redirect(`${def.basePath}/services/vendors`);
  }

  const meta = findSection(def, section);
  if (!meta) notFound();

  let managerOwnerSubscriptionTier: "free" | "paid" | null = null;
  let effectiveWorkspaceUserId: string | null = null;
  if (kind === "manager" || kind === "pro") {
    if (kind === "pro") {
      const proRender = await getProPortalRenderContext();
      effectiveWorkspaceUserId = proRender.effectiveUserId;
      managerOwnerSubscriptionTier = proRender.subscriptionTier;
    } else {
      const uid = await getEffectiveUserIdForPortal("manager");
      if (!uid) redirect("/admin/dashboard");
      effectiveWorkspaceUserId = uid;
      managerOwnerSubscriptionTier = await getManagerSubscriptionTier(uid);
    }
  }
  const managerPaywall =
    kind === "manager" || kind === "pro"
      ? managerTierPaywall(kind, section, managerOwnerSubscriptionTier, meta.label, def.basePath)
      : null;
  if (managerPaywall) return managerPaywall;

  if (kind === "admin" && section === "dashboard") {
    if (tabParts?.length) notFound();
    const { profile } = await getServerSessionProfile();
    const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "there";
    return <AdminDashboard displayName={displayName} />;
  }

  if (kind === "admin" && section === "create-manager") {
    if (tabParts?.length) notFound();
    return <AdminCreateManagerClient />;
  }

  if (kind === "admin" && section === "create-resident") {
    if (tabParts?.length) notFound();
    return <AdminCreateResidentClient />;
  }

  if (kind === "admin" && section === "properties") {
    if (tabParts?.length) notFound();
    return <AdminPropertiesClient />;
  }

  if (kind === "admin" && section === "axis-users") {
    if (tabParts?.length) notFound();
    return <AdminAxisUsersClient />;
  }

  if (kind === "admin" && section === "leases") {
    redirect(`${def.basePath}/dashboard`);
  }

  if (kind === "admin" && section === "profile") {
    if (tabParts?.length) notFound();
    return <AdminProfileSection />;
  }

  if (kind === "admin" && section === "inbox") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const inboxTab = tabParts[0]!;
    // Manager-only tab that used to leak into admin pills; keep old links working.
    if (inboxTab === "schedule") redirect(`${def.basePath}/${section}/unopened`);
    if (!["unopened", "opened", "sent", "trash", "notifications"].includes(inboxTab)) notFound();
    return <AdminInboxClient tabId={inboxTab} />;
  }

  if (kind === "admin" && section === "bugs-feedback") {
    if (tabParts?.length) notFound();
    return <AdminBugFeedbackClient />;
  }

  if (kind === "admin" && section === "events") {
    if (tabParts?.length) {
      redirect(`${def.basePath}/events`);
    }
    return <AdminEventsClient />;
  }

  if (kind === "manager" || kind === "pro") {
    const reporterRole = kind === "pro" ? "pro" : "manager";

    if (section === "work-orders") {
      redirect(`${def.basePath}/services/work-orders`);
    }

    if (kind === "pro" && section === "relationships") {
      if (tabParts?.length) {
        const legacyRelTab = tabParts[0]!;
        if (legacyRelTab === "owner" || legacyRelTab === "manager") {
          redirect(`${def.basePath}/${section}`);
        }
        notFound();
      }
      const ProAccountLinksPanel = await loadProAccountLinksPanel();
      return subscriptionGated(
        <ProAccountLinksPanel userId={effectiveWorkspaceUserId!} />,
        kind,
        "relationships",
        managerOwnerSubscriptionTier,
      );
    }

    if (section === "residents") {
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/current`);
      }
      if (tabParts.length > 1) notFound();
      const residentsTab = tabParts[0]!;
      if (!["current", "previous"].includes(residentsTab)) notFound();
      const ManagerResidents = await loadManagerResidents();
      return subscriptionGated(
        <ManagerResidents tabId={residentsTab as "current" | "previous"} />,
        kind,
        "residents",
        managerOwnerSubscriptionTier,
      );
    }

    if (section === "inbox") {
      if (!meta.tabs.length) notFound();
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
      }
      const inboxTab = tabParts[0]!;
      if (!isManagerInboxTab(inboxTab)) notFound();
      const ManagerInbox = await loadManagerInbox();
      return subscriptionGated(
        <ManagerInbox tabId={inboxTab} />,
        kind,
        "inbox",
        managerOwnerSubscriptionTier,
      );
    }

    if (section === "work-orders" || section === "services") {
      if (!tabParts?.length) {
        redirect(`${def.basePath}/services/requests`);
      }
      if (tabParts.length > 1) notFound();
      const servicesTab = tabParts[0]!;
      if (servicesTab === "work-done") {
        redirect(`${def.basePath}/financials/expenses`);
      }
      if (!["requests", "work-orders", "vendors"].includes(servicesTab)) notFound();
      const ManagerAllServicesPanel = await loadManagerAllServicesPanel();
      return subscriptionGated(
        <ManagerAllServicesPanel tabId={servicesTab as "requests" | "work-orders" | "vendors"} basePath={def.basePath} />,
        kind,
        "services",
        managerOwnerSubscriptionTier,
      );
    }

    if (section === "payments") {
      if (tabParts?.length === 1 && tabParts[0] === "payouts") {
        return subscriptionGated(
          <PortalStripeConnectPanel basePath={def.basePath} />,
          kind,
          "payments",
          managerOwnerSubscriptionTier,
        );
      }
      if (tabParts?.length) {
        redirect(`${def.basePath}/${section}`);
      }
      return subscriptionGated(<ManagerPayments />, kind, "payments", managerOwnerSubscriptionTier);
    }

    const financesView = await renderManagerFinancesSection(
      section,
      tabParts,
      def.basePath,
      kind,
      managerOwnerSubscriptionTier,
    );
    if (financesView) return financesView;
    const documentsView = await renderManagerDocumentsSection(
      section,
      tabParts,
      def.basePath,
      kind,
      managerOwnerSubscriptionTier,
    );
    if (documentsView) return documentsView;

    if (section === "leases") {
      if (tabParts?.length) {
        redirect(`${def.basePath}/${section}`);
      }
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }

    if (tabParts?.length) notFound();

    if (section === "dashboard") {
      const { profile } = await getEffectiveSessionForPortal("manager");
      const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "there";
      return subscriptionGated(
        <ManagerDashboard displayName={displayName} />,
        kind,
        "dashboard",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "properties") {
      const ManagerProperties = await loadManagerProperties();
      return subscriptionGated(<ManagerProperties />, kind, "properties", managerOwnerSubscriptionTier);
    }
    if (section === "applications") {
      const ManagerApplications = await loadManagerApplications();
      return subscriptionGated(<ManagerApplications />, kind, "applications", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      const PortalCalendar = await loadPortalCalendar();
      return subscriptionGated(
        <PortalCalendar portal="manager" initialUserId={effectiveWorkspaceUserId} />,
        kind,
        "calendar",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "promotion") {
      return subscriptionGated(<ManagerPromotion />, kind, "promotion", managerOwnerSubscriptionTier);
    }
    if (section === "bugs-feedback") {
      return subscriptionGated(
        <PortalBugFeedbackPanel reporterRole={reporterRole} />,
        kind,
        "bugs-feedback",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "profile") {
      return subscriptionGated(<ManagerProfile />, kind, "profile", managerOwnerSubscriptionTier);
    }
  }

  if (kind === "resident" && section === "dashboard") {
    if (tabParts?.length) notFound();
    const profile = residentCtx?.profile;
    return (
      <ResidentDashboard
        applicationApproved={residentAccess?.applicationApproved ?? false}
        initialApplicationId={residentAccess?.applicationId ?? null}
        displayName={profile?.full_name ?? profile?.email ?? "Resident"}
        residentEmail={profile?.email ?? residentCtx?.user?.email ?? ""}
        residentUserId={profile?.id ?? residentCtx?.user?.id ?? null}
        managerSubscriptionTier={residentManagerTier}
      />
    );
  }

  if (kind === "resident" && section === "profile") {
    if (tabParts?.length) notFound();
    return <ResidentProfilePanel />;
  }

  if (kind === "resident" && section === "bugs-feedback") {
    redirect(`${def.basePath}/profile`);
  }

  if (kind === "resident" && section === "payments") {
    const allowedTabs = meta.tabs.map((t) => t.id);
    if (!tabParts?.length) {
      redirect(`${def.basePath}/payments/pending`);
    }
    if (tabParts.length > 1) notFound();
    const payTab = tabParts[0]!;
    if (!allowedTabs.includes(payTab)) notFound();
    if (payTab === "balance" || payTab === "statements") {
      const financialTab = payTab === "balance" ? "summary" : "statements";
      return (
        <ResidentFinancialsPanel
          tabId={financialTab}
          basePath={`${def.basePath}/payments`}
          tabs={[
            { id: "pending", label: "Pending", href: `${def.basePath}/payments/pending` },
            { id: "paid", label: "Paid", href: `${def.basePath}/payments/paid` },
            { id: "balance", label: "Balance", href: `${def.basePath}/payments/balance` },
            { id: "statements", label: "Statements", href: `${def.basePath}/payments/statements` },
          ]}
          activePaymentsTab={payTab}
        />
      );
    }
    return <ResidentPaymentsPanel tabId={payTab} basePath={def.basePath} />;
  }

  if (kind === "resident" && section === "financials") {
    redirect(`${def.basePath}/payments`);
  }

  if (kind === "resident" && section === "documents") {
    const tierGate = residentManagerTierGate("documents", residentManagerTier, meta.label);
    if (tierGate) return tierGate;
    const allowedTabs = meta.tabs.map((t) => t.id);
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${allowedTabs[0] ?? "application"}`);
    }
    if (tabParts.length > 1) notFound();
    const docTab = tabParts[0]!;
    if (!allowedTabs.includes(docTab)) notFound();
    return <ResidentDocumentsPanel tabId={docTab} basePath={def.basePath} tabs={meta.tabs} />;
  }

  if (kind === "resident" && section === "lease") {
    if (tabParts?.length) notFound();
    // ResidentLeasePanel renders its own "Lease" page shell (title + actions);
    // don't wrap it in a second shell or the header stacks twice.
    return <ResidentLeasePanel />;
  }

  if (kind === "resident" && section === "move-in") {
    if (tabParts?.length) notFound();
    const moveInEmail = residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null;
    const leaseSigned = moveInEmail ? await loadResidentLeaseSignedStatus(moveInEmail) : false;
    if (!leaseSigned) {
      return (
        <ManagerPortalPageShell title="Move-in">
          <PortalDataTableEmpty message="Available once your lease is signed" icon="lease" />
        </ManagerPortalPageShell>
      );
    }
    return <ResidentMoveInPanel residentEmail={moveInEmail} />;
  }

  if (kind === "resident" && section === "inbox") {
    const tierGate = residentManagerTierGate("inbox", residentManagerTier, meta.label);
    if (tierGate) return tierGate;
    const inboxEmail = residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null;
    const inboxLeaseSigned = inboxEmail ? await loadResidentLeaseSignedStatus(inboxEmail) : false;
    if (!inboxLeaseSigned) {
      return (
        <ManagerPortalPageShell title="Inbox">
          <PortalDataTableEmpty message="Available once your lease is signed" icon="lease" />
        </ManagerPortalPageShell>
      );
    }
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const inboxTab = tabParts[0]!;
    if (!["unopened", "opened", "schedule", "sent", "trash", "notifications"].includes(inboxTab)) notFound();
    return <ResidentInboxPanel tabId={inboxTab} />;
  }

  if (kind === "resident") {
    if (residentWorkspaceUnlocked) {
      if (section === "services") {
        const tierGate = residentManagerTierGate("services", residentManagerTier, meta.label);
        if (tierGate) return tierGate;
        if (!tabParts?.length) {
          redirect(`${def.basePath}/services/requests`);
        }
        if (tabParts.length > 1) notFound();
        const servicesTab = tabParts[0]!;
        if (!["requests", "work-orders"].includes(servicesTab)) notFound();
        const ResidentServicesPanel = await loadResidentServicesPanel();
        return <ResidentServicesPanel tabId={servicesTab as "requests" | "work-orders"} basePath={def.basePath} />;
      }
      if (tabParts?.length) notFound();
      if (section === "work-orders") {
        const ResidentServicesPanel = await loadResidentServicesPanel();
        return <ResidentServicesPanel tabId="work-orders" basePath={def.basePath} />;
      }
    }
  }

  if (kind === "vendor" && section === "dashboard") {
    if (tabParts?.length) notFound();
    const { profile } = await getEffectiveSessionForPortal("vendor");
    return <VendorDashboard displayName={profile?.full_name?.trim() || "there"} />;
  }

  if (kind === "vendor" && section === "work-orders") {
    if (tabParts?.length) notFound();
    return <VendorWorkOrdersPanel />;
  }

  if (kind === "vendor" && section === "calendar") {
    if (tabParts?.length) notFound();
    return <VendorCalendarPanel />;
  }

  if (kind === "vendor" && section === "inbox") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const inboxTab = tabParts[0]!;
    if (!["unopened", "opened", "sent", "trash", "notifications"].includes(inboxTab)) notFound();
    return <VendorInboxPanel tabId={inboxTab} />;
  }

  if (kind === "vendor" && section === "financials") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/financials/income`);
    }
    if (tabParts.length > 1) notFound();
    const finTab = tabParts[0]!;
    if (!meta.tabs.some((tab) => tab.id === finTab)) notFound();
    return <VendorFinancesPanel tabId={finTab} basePath={def.basePath} />;
  }

  if (kind === "vendor" && section === "payments") {
    if (tabParts?.length) notFound();
    return <VendorPaymentsPanel />;
  }

  if (kind === "vendor" && section === "documents") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const documentsTab = tabParts[0]!;
    if (!meta.tabs.some((tab) => tab.id === documentsTab)) notFound();
    return <VendorDocumentsPanel tabId={documentsTab} basePath={def.basePath} />;
  }

  if (kind === "vendor" && section === "profile") {
    if (tabParts?.length) notFound();
    return <VendorSettingsPanel />;
  }

  if (!meta.tabs.length) {
    if (tabParts?.length) notFound();
  } else if (!tabParts?.length) {
    redirect(`${def.basePath}/${section}/${meta.tabs[0].id}`);
  }

  const tabId = meta.tabs.length ? (tabParts?.[0] ?? meta.tabs[0].id) : "index";
  if (meta.tabs.length && !meta.tabs.some((t) => t.id === tabId)) notFound();

  const modelTab = tabId === "index" ? "overview" : tabId;
  const model = buildPortalWorkspaceModel(kind, section, modelTab);

  const tabs: TabItem[] = meta.tabs.map((t) => ({
    id: t.id,
    label: t.label,
    href: `${def.basePath}/${section}/${t.id}`,
  }));

  const tabLabel = meta.tabs.find((t) => t.id === tabId)?.label ?? "Overview";

  const breadcrumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: def.title, href: `${def.basePath}/dashboard` },
    { label: meta.label, href: meta.tabs.length ? `${def.basePath}/${section}/${meta.tabs[0].id}` : `${def.basePath}/${section}` },
    ...(meta.tabs.length ? [{ label: tabLabel }] : []),
  ];

  return (
    <PortalWorkspaceClient
      portalKind={kind}
      portalLabel={def.title}
      tabId={meta.tabs.length ? tabId : "index"}
      tabs={tabs}
      model={model}
      breadcrumbs={breadcrumbs}
    />
  );
}

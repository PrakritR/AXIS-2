import { AdminDashboard } from "@/components/portal/admin-dashboard";
import { ManagerApplications } from "@/components/portal/manager-applications";
import { PortalCalendar } from "@/components/portal/portal-calendar";
import { ManagerDashboard } from "@/components/portal/manager-dashboard";
import { ManagerInbox } from "@/components/portal/manager-inbox";
import { ManagerPlan } from "@/components/portal/manager-plan";
import { ManagerLeases } from "@/components/portal/manager-leases";
import { ManagerPayments } from "@/components/portal/manager-payments";
import { ManagerProfile } from "@/components/portal/manager-profile";
import { AdminCreateManagerClient } from "@/components/portal/admin-create-manager-client";
import { AdminCreateResidentClient } from "@/components/portal/admin-create-resident-client";
import { AdminAxisUsersClient } from "@/components/portal/admin-axis-users-client";
import { AdminLeasesClient } from "@/components/portal/admin-leases-client";
import { AdminPropertiesClient } from "@/components/portal/admin-properties-client";
import { AdminEventsClient } from "@/components/portal/admin-events-client";
import { AdminProfileSection } from "@/components/portal/admin-profile-section";
import { AdminInboxClient } from "@/components/portal/admin-inbox-client";
import { ManagerProperties } from "@/components/portal/manager-properties";
import { ManagerResidents } from "@/components/portal/manager-residents";
import { ManagerWorkOrders } from "@/components/portal/manager-work-orders";
import { OwnerInboxPanel } from "@/components/portal/owner-inbox-panel";
import { OwnerProperties } from "@/components/portal/owner-properties";
import { ResidentDashboard } from "@/components/portal/resident-dashboard";
import { ResidentInboxPanel } from "@/components/portal/resident-inbox-panel";
import { ResidentLeasePanel } from "@/components/portal/resident-lease-panel";
import { ResidentPaymentsPanel } from "@/components/portal/resident-payments-panel";
import { ResidentProfilePanel } from "@/components/portal/resident-profile-panel";
import { ResidentWorkOrdersPanel } from "@/components/portal/resident-work-orders-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalSectionSubtabs } from "@/components/portal/portal-section-subtabs";
import { PortalTierPaywall } from "@/components/portal/portal-tier-paywall";
import { PortalWorkspaceClient } from "@/components/portal/portal-workspace-client";
import { ProAccountLinksPanelLoader } from "@/components/portal/pro-account-links-panel";
import type { Crumb } from "@/components/layout/breadcrumbs";
import type { TabItem } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { getPortalAccessContext } from "@/lib/auth/portal-access";
import { getEffectiveSessionForPortal, getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTier, getManagerSubscriptionTierByManagerId, managerSectionAllowedForTier } from "@/lib/manager-access";
import { residentHasFullPortalAccess, residentHasPaymentsPortalAccess } from "@/lib/resident-portal-access";
import { findSection, getPortalDefinition } from "@/lib/portals";
import { buildPortalWorkspaceModel } from "@/lib/portal-workspace-model";
import type { PortalKind } from "@/lib/portal-types";
import { notFound, redirect } from "next/navigation";

function subscriptionGated(
  node: ReactNode,
  kind: PortalKind,
  section: string,
  tier: "free" | "paid" | null,
): ReactNode {
  if (kind !== "manager" && kind !== "owner" && kind !== "pro") return node;
  if (managerSectionAllowedForTier(section, tier)) return node;
  const basePath: "/manager" | "/owner" | "/pro" =
    kind === "owner" ? "/owner" : kind === "pro" ? "/pro" : "/manager";
  return <PortalTierPaywall basePath={basePath} />;
}

function ResidentFreeTierFeatureNotice({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <ManagerPortalPageShell title={title}>
        <div className="rounded-3xl border border-amber-200/80 bg-amber-50/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70">Property plan</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Property is using the Free tier</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            This resident tab is visible so you can see what exists in the portal, but access to{" "}
            <span className="font-semibold text-slate-900">{title.toLowerCase()}</span> is not included while the property stays on the Free tier.
            Payments, inbox, dashboard, and profile are still available.
          </p>
        </div>
      </ManagerPortalPageShell>
    </div>
  );
}

export async function renderPortalSection(
  kind: PortalKind,
  section: string,
  tabParts?: string[],
) {
  const def = await getPortalDefinition(kind);

  if (kind === "admin" && (section === "managers" || section === "owners")) {
    redirect(`${def.basePath}/axis-users`);
  }

  if ((kind === "manager" || kind === "pro") && section === "upgrade") {
    redirect(`${def.basePath}/plan`);
  }

  if (kind === "manager" || kind === "pro") {
    if (section === "stripe") redirect(`${def.basePath}/payments/payouts`);
  }
  if (kind === "owner") {
    if (section === "stripe") redirect(`${def.basePath}/payments/payouts`);
  }

  const residentCtx = kind === "resident" ? await getEffectiveSessionForPortal("resident") : null;
  const residentManagerTier =
    kind === "resident" && residentCtx?.profile?.manager_id?.trim()
      ? await getManagerSubscriptionTierByManagerId(residentCtx.profile.manager_id.trim())
      : null;
  const residentPaymentsUnlocked =
    kind === "resident"
      ? residentHasPaymentsPortalAccess({
          applicationApproved: residentCtx?.profile?.application_approved ?? false,
          role: residentCtx?.profile?.role,
          email: residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null,
        })
      : false;
  const residentWorkspaceUnlocked =
    kind === "resident"
      ? residentHasFullPortalAccess({
          applicationApproved: residentCtx?.profile?.application_approved ?? false,
          role: residentCtx?.profile?.role,
          email: residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null,
          managerSubscriptionTier: residentManagerTier,
        })
      : false;
  const meta = findSection(def, section);
  if (!meta) notFound();

  let managerOwnerSubscriptionTier: "free" | "paid" | null = null;
  if (kind === "manager") {
    const uid = await getEffectiveUserIdForPortal("manager");
    if (!uid) redirect("/admin/dashboard");
    managerOwnerSubscriptionTier = await getManagerSubscriptionTier(uid);
  } else if (kind === "owner") {
    const uid = await getEffectiveUserIdForPortal("owner");
    if (!uid) redirect("/auth/sign-in");
    managerOwnerSubscriptionTier = await getManagerSubscriptionTier(uid);
  } else if (kind === "pro") {
    const proCtx = await getPortalAccessContext();
    const portalKey: PreviewPortal = proCtx.effectiveRole === "owner" ? "owner" : "manager";
    const uid = await getEffectiveUserIdForPortal(portalKey);
    if (!uid) redirect("/auth/sign-in");
    managerOwnerSubscriptionTier = await getManagerSubscriptionTier(uid);
  }

  if (kind === "admin" && section === "dashboard") {
    if (tabParts?.length) notFound();
    return <AdminDashboard />;
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
    if (tabParts?.length) notFound();
    return <AdminLeasesClient />;
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
    if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
    return <AdminInboxClient tabId={inboxTab} />;
  }

  if (kind === "admin" && section === "events") {
    if (tabParts?.length) {
      redirect(`${def.basePath}/events`);
    }
    return <AdminEventsClient />;
  }

  if (kind === "manager") {
    if (section === "inbox") {
      if (!meta.tabs.length) notFound();
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
      }
      const inboxTab = tabParts[0]!;
      if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
      return subscriptionGated(
        <ManagerInbox tabId={inboxTab} />,
        kind,
        "inbox",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "payments") {
      if (!tabParts?.length) redirect(`${def.basePath}/payments/ledger`);
      const paymentsTab = tabParts[0]!;
      if (paymentsTab === "stripe" || paymentsTab === "payouts") redirect(`${def.basePath}/payments/ledger?payouts=1`);
      if (paymentsTab !== "ledger") redirect(`${def.basePath}/payments/ledger`);
      return subscriptionGated(
        <ManagerPayments />,
        kind,
        "payments",
        managerOwnerSubscriptionTier,
      );
    }
    if (tabParts?.length) notFound();
    if (section === "dashboard") {
      return subscriptionGated(<ManagerDashboard />, kind, "dashboard", managerOwnerSubscriptionTier);
    }
    if (section === "properties") {
      return subscriptionGated(<ManagerProperties />, kind, "properties", managerOwnerSubscriptionTier);
    }
    if (section === "applications") {
      return subscriptionGated(<ManagerApplications />, kind, "applications", managerOwnerSubscriptionTier);
    }
    if (section === "residents") {
      return subscriptionGated(<ManagerResidents />, kind, "residents", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "work-orders") {
      return subscriptionGated(<ManagerWorkOrders />, kind, "work-orders", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      return subscriptionGated(<PortalCalendar portal="manager" />, kind, "calendar", managerOwnerSubscriptionTier);
    }
    if (section === "plan") {
      return subscriptionGated(<ManagerPlan />, kind, "plan", managerOwnerSubscriptionTier);
    }
    if (section === "profile") {
      return subscriptionGated(<ManagerProfile />, kind, "profile", managerOwnerSubscriptionTier);
    }
  }

  if (kind === "pro") {
    const proCtx = await getPortalAccessContext();
    const useOwnerUi = proCtx.effectiveRole === "owner";

    if (section === "relationships") {
      if (tabParts?.length) {
        const legacyRelTab = tabParts[0]!;
        if (legacyRelTab === "owner" || legacyRelTab === "manager") {
          redirect(`${def.basePath}/${section}`);
        }
        notFound();
      }
      return subscriptionGated(
        <ProAccountLinksPanelLoader />,
        kind,
        "relationships",
        managerOwnerSubscriptionTier,
      );
    }

    if (section === "inbox") {
      if (!meta.tabs.length) notFound();
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
      }
      const inboxTab = tabParts[0]!;
      if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
      return subscriptionGated(
        useOwnerUi ? (
          <OwnerInboxPanel tabId={inboxTab} />
        ) : (
          <ManagerInbox tabId={inboxTab} />
        ),
        kind,
        "inbox",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "payments") {
      if (!tabParts?.length) redirect(`${def.basePath}/payments/ledger`);
      const paymentsTab = tabParts[0]!;
      if (paymentsTab === "stripe" || paymentsTab === "payouts") redirect(`${def.basePath}/payments/ledger?payouts=1`);
      if (paymentsTab !== "ledger") redirect(`${def.basePath}/payments/ledger`);
      return subscriptionGated(
        <ManagerPayments />,
        kind,
        "payments",
        managerOwnerSubscriptionTier,
      );
    }
    if (tabParts?.length) notFound();
    if (section === "dashboard") {
      return subscriptionGated(<ManagerDashboard />, kind, "dashboard", managerOwnerSubscriptionTier);
    }
    if (section === "properties") {
      return subscriptionGated(
        useOwnerUi ? (
          <OwnerProperties />
        ) : (
          <ManagerProperties />
        ),
        kind,
        "properties",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "applications") {
      return subscriptionGated(<ManagerApplications />, kind, "applications", managerOwnerSubscriptionTier);
    }
    if (section === "residents") {
      return subscriptionGated(<ManagerResidents />, kind, "residents", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "work-orders") {
      return subscriptionGated(<ManagerWorkOrders />, kind, "work-orders", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      return subscriptionGated(<PortalCalendar portal="manager" />, kind, "calendar", managerOwnerSubscriptionTier);
    }
    if (section === "plan") {
      return subscriptionGated(<ManagerPlan />, kind, "plan", managerOwnerSubscriptionTier);
    }
    if (section === "profile") {
      return subscriptionGated(<ManagerProfile />, kind, "profile", managerOwnerSubscriptionTier);
    }
  }

  if (kind === "owner") {
    if (section === "inbox") {
      if (!meta.tabs.length) notFound();
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
      }
      const inboxTab = tabParts[0]!;
      if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
      return subscriptionGated(
        <OwnerInboxPanel tabId={inboxTab} />,
        kind,
        "inbox",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "payments") {
      if (!tabParts?.length) redirect(`${def.basePath}/payments/ledger`);
      const paymentsTab = tabParts[0]!;
      if (paymentsTab === "stripe" || paymentsTab === "payouts") redirect(`${def.basePath}/payments/ledger?payouts=1`);
      if (paymentsTab !== "ledger") redirect(`${def.basePath}/payments/ledger`);
      return subscriptionGated(
        <ManagerPayments />,
        kind,
        "payments",
        managerOwnerSubscriptionTier,
      );
    }
    if (tabParts?.length) notFound();
    if (section === "dashboard") {
      return subscriptionGated(<ManagerDashboard />, kind, "dashboard", managerOwnerSubscriptionTier);
    }
    if (section === "properties") {
      return subscriptionGated(<OwnerProperties />, kind, "properties", managerOwnerSubscriptionTier);
    }
    if (section === "applications") {
      return subscriptionGated(<ManagerApplications />, kind, "applications", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "work-orders") {
      return subscriptionGated(<ManagerWorkOrders />, kind, "work-orders", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      return subscriptionGated(<PortalCalendar portal="manager" />, kind, "calendar", managerOwnerSubscriptionTier);
    }
    if (section === "plan") {
      return subscriptionGated(<ManagerPlan />, kind, "plan", managerOwnerSubscriptionTier);
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
        applicationApproved={profile?.application_approved ?? false}
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

  if (kind === "resident" && section === "inbox") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const inboxTab = tabParts[0]!;
    if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
    return <ResidentInboxPanel tabId={inboxTab} />;
  }

  if (kind === "resident") {
    if (residentWorkspaceUnlocked || (residentPaymentsUnlocked && (section === "payments" || section === "work-orders"))) {
      if (tabParts?.length) notFound();
      if (section === "lease") return <ResidentLeasePanel />;
      if (section === "payments") return <ResidentPaymentsPanel />;
      if (section === "work-orders") return <ResidentWorkOrdersPanel />;
    }
    if (residentPaymentsUnlocked && residentManagerTier === "free") {
      if (tabParts?.length) notFound();
      if (section === "lease") return <ResidentFreeTierFeatureNotice title="Lease" />;
      if (section === "work-orders") return <ResidentFreeTierFeatureNotice title="Work orders" />;
    }
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

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
import { AdminBugFeedbackClient } from "@/components/portal/admin-bug-feedback-client";
import { ManagerProperties } from "@/components/portal/manager-properties";
import { ManagerResidents } from "@/components/portal/manager-residents";
import { ManagerAllServicesPanel } from "@/components/portal/manager-all-services-panel";
import { ResidentDashboard } from "@/components/portal/resident-dashboard";
import { ResidentMoveInPanel } from "@/components/portal/resident-move-in-panel";
import { ResidentInboxPanel } from "@/components/portal/resident-inbox-panel";
import { ResidentLeasePanel } from "@/components/portal/resident-lease-panel";
import { ResidentPaymentsPanel } from "@/components/portal/resident-payments-panel";
import { ResidentProfilePanel } from "@/components/portal/resident-profile-panel";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { ResidentServicesPanel } from "@/components/portal/resident-services-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalTierPaywall } from "@/components/portal/portal-tier-paywall";
import { PortalWorkspaceClient } from "@/components/portal/portal-workspace-client";
import { ProAccountLinksPanel } from "@/components/portal/pro-account-links-panel";
import type { Crumb } from "@/components/layout/breadcrumbs";
import type { TabItem } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { getEffectiveSessionForPortal, getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTier, getManagerSubscriptionTierByManagerId, managerSectionAllowedForTier } from "@/lib/manager-access";
import { loadResidentPortalAccessState, loadResidentLeaseSignedStatus, residentHasFullPortalAccess } from "@/lib/resident-portal-access";
import { findSection, getPortalDefinition } from "@/lib/portals";
import { getProPortalRenderContext } from "@/lib/portals/pro-nav";
import { buildPortalWorkspaceModel } from "@/lib/portal-workspace-model";
import type { PortalKind } from "@/lib/portal-types";
import { notFound, redirect } from "next/navigation";

function subscriptionGated(
  node: ReactNode,
  kind: PortalKind,
  section: string,
  tier: "free" | "paid" | null,
): ReactNode {
  if (kind !== "manager" && kind !== "pro") return node;
  if (managerSectionAllowedForTier(section, tier)) return node;
  return <PortalTierPaywall basePath="/portal" />;
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
  // Legacy path support: work-orders moved under Services tabs.
  if (
    (kind === "manager" || kind === "pro") &&
    section === "work-orders"
  ) {
    redirect(`${def.basePath}/services/work-orders`);
  }

  const meta = findSection(def, section);
  if (!meta) notFound();

  let managerOwnerSubscriptionTier: "free" | "paid" | null = null;
  let effectiveWorkspaceUserId: string | null = null;
  if (kind === "manager") {
    const uid = await getEffectiveUserIdForPortal("manager");
    if (!uid) redirect("/admin/dashboard");
    effectiveWorkspaceUserId = uid;
    managerOwnerSubscriptionTier = await getManagerSubscriptionTier(uid);
  } else if (kind === "pro") {
    const proRender = await getProPortalRenderContext();
    effectiveWorkspaceUserId = proRender.effectiveUserId;
    managerOwnerSubscriptionTier = proRender.subscriptionTier;
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

  if (kind === "admin" && section === "bugs-feedback") {
    if (!meta.tabs.length) notFound();
    if (!tabParts?.length) {
      redirect(`${def.basePath}/${section}/${meta.tabs[0]!.id}`);
    }
    const bfTab = tabParts[0]!;
    if (!["bugs", "feedback"].includes(bfTab)) notFound();
    return <AdminBugFeedbackClient tabId={bfTab as "bugs" | "feedback"} />;
  }

  if (kind === "admin" && section === "events") {
    if (tabParts?.length) {
      redirect(`${def.basePath}/events`);
    }
    return <AdminEventsClient />;
  }

  if (kind === "manager") {
    if (section === "work-orders") {
      redirect(`${def.basePath}/services/work-orders`);
    }
    if (section === "residents") {
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/current`);
      }
      if (tabParts.length > 1) notFound();
      const residentsTab = tabParts[0]!;
      if (![
        "current",
        "previous",
      ].includes(residentsTab)) notFound();
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
      if (!["unopened", "opened", "sent", "trash"].includes(inboxTab)) notFound();
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
      if (!["requests", "work-orders"].includes(servicesTab)) notFound();
      return subscriptionGated(
        <ManagerAllServicesPanel tabId={servicesTab as "requests" | "work-orders"} basePath={def.basePath} />,
        kind,
        "services",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "payments") {
      if (tabParts?.length) {
        redirect(`${def.basePath}/${section}`);
      }
      return subscriptionGated(<ManagerPayments />, kind, "payments", managerOwnerSubscriptionTier);
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
      return subscriptionGated(<ManagerResidents tabId="current" />, kind, "residents", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      return subscriptionGated(
        <PortalCalendar portal="manager" initialUserId={effectiveWorkspaceUserId} />,
        kind,
        "calendar",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "plan") {
      return subscriptionGated(<ManagerPlan />, kind, "plan", managerOwnerSubscriptionTier);
    }
    if (section === "bugs-feedback") {
      return subscriptionGated(
        <PortalBugFeedbackPanel reporterRole="manager" />,
        kind,
        "bugs-feedback",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "profile") {
      return subscriptionGated(<ManagerProfile />, kind, "profile", managerOwnerSubscriptionTier);
    }
  }

  if (kind === "pro") {
    if (section === "work-orders") {
      redirect(`${def.basePath}/services/work-orders`);
    }

    if (section === "relationships") {
      if (tabParts?.length) {
        const legacyRelTab = tabParts[0]!;
        if (legacyRelTab === "owner" || legacyRelTab === "manager") {
          redirect(`${def.basePath}/${section}`);
        }
        notFound();
      }
      return subscriptionGated(
        <ProAccountLinksPanel userId={effectiveWorkspaceUserId!} />,
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
        <ManagerInbox tabId={inboxTab} />,
        kind,
        "inbox",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "residents") {
      if (!tabParts?.length) {
        redirect(`${def.basePath}/${section}/current`);
      }
      if (tabParts.length > 1) notFound();
      const residentsTab = tabParts[0]!;
      if (![
        "current",
        "previous",
      ].includes(residentsTab)) notFound();
      return subscriptionGated(
        <ManagerResidents tabId={residentsTab as "current" | "previous"} />,
        kind,
        "residents",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "payments") {
      if (tabParts?.length) {
        redirect(`${def.basePath}/${section}`);
      }
      return subscriptionGated(<ManagerPayments />, kind, "payments", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      if (tabParts?.length) {
        redirect(`${def.basePath}/${section}`);
      }
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "work-orders" || section === "services") {
      if (!tabParts?.length) {
        redirect(`${def.basePath}/services/requests`);
      }
      if (tabParts.length > 1) notFound();
      const servicesTab = tabParts[0]!;
      if (!["requests", "work-orders"].includes(servicesTab)) notFound();
      return subscriptionGated(
        <ManagerAllServicesPanel tabId={servicesTab as "requests" | "work-orders"} basePath={def.basePath} />,
        kind,
        "services",
        managerOwnerSubscriptionTier,
      );
    }
    if (tabParts?.length) notFound();
    if (section === "dashboard") {
      return subscriptionGated(<ManagerDashboard />, kind, "dashboard", managerOwnerSubscriptionTier);
    }
    if (section === "properties") {
      return subscriptionGated(
        <ManagerProperties />,
        kind,
        "properties",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "applications") {
      return subscriptionGated(<ManagerApplications />, kind, "applications", managerOwnerSubscriptionTier);
    }
    if (section === "residents") {
      return subscriptionGated(<ManagerResidents tabId="current" />, kind, "residents", managerOwnerSubscriptionTier);
    }
    if (section === "leases") {
      return subscriptionGated(<ManagerLeases />, kind, "leases", managerOwnerSubscriptionTier);
    }
    if (section === "calendar") {
      return subscriptionGated(
        <PortalCalendar portal="manager" initialUserId={effectiveWorkspaceUserId} />,
        kind,
        "calendar",
        managerOwnerSubscriptionTier,
      );
    }
    if (section === "plan") {
      return subscriptionGated(<ManagerPlan />, kind, "plan", managerOwnerSubscriptionTier);
    }
    if (section === "bugs-feedback") {
      return subscriptionGated(
        <PortalBugFeedbackPanel reporterRole="pro" />,
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
    if (tabParts?.length) notFound();
    return <PortalBugFeedbackPanel reporterRole="resident" />;
  }

  if (kind === "resident" && section === "payments") {
    if (tabParts?.length) notFound();
    return <ResidentPaymentsPanel />;
  }

  if (kind === "resident" && section === "move-in") {
    if (tabParts?.length) notFound();
    const moveInEmail = residentCtx?.profile?.email ?? residentCtx?.user?.email ?? null;
    const leaseSigned = moveInEmail ? await loadResidentLeaseSignedStatus(moveInEmail) : false;
    if (!leaseSigned) {
      return (
        <ManagerPortalPageShell title="Move-in">
          <div className="glass-card flex flex-col items-center rounded-2xl px-5 py-10 text-center">
            <svg
              className="h-10 w-10 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <p className="mt-4 text-base font-semibold text-foreground">Available once your lease is signed</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Your move-in details will appear here after your lease has been fully signed by you and your property
              manager. Head to the <strong className="font-semibold text-foreground">Lease</strong> tab to review and sign.
            </p>
          </div>
        </ManagerPortalPageShell>
      );
    }
    return <ResidentMoveInPanel residentEmail={moveInEmail} />;
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
    if (residentWorkspaceUnlocked) {
      if (section === "services") {
        if (!tabParts?.length) {
          redirect(`${def.basePath}/services/requests`);
        }
        if (tabParts.length > 1) notFound();
        const servicesTab = tabParts[0]!;
        if (!["requests", "work-orders"].includes(servicesTab)) notFound();
        return <ResidentServicesPanel tabId={servicesTab as "requests" | "work-orders"} basePath={def.basePath} />;
      }
      if (tabParts?.length) notFound();
      if (section === "lease") return <ResidentLeasePanel />;
      if (section === "work-orders") return <ResidentServicesPanel tabId="work-orders" basePath={def.basePath} />;
    }
    if ((residentAccess?.leaseAccessUnlocked ?? false) && residentManagerTier === "free") {
      if (section === "lease") return <ResidentFreeTierFeatureNotice title="Lease" />;
      if (section === "services") {
        if (!tabParts?.length) {
          redirect(`${def.basePath}/services/requests`);
        }
        if (tabParts.length > 1) notFound();
        if (!["requests", "work-orders"].includes(tabParts[0]!)) notFound();
        return <ResidentFreeTierFeatureNotice title="Services" />;
      }
      if (tabParts?.length) notFound();
      if (section === "work-orders") return <ResidentFreeTierFeatureNotice title="Services" />;
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

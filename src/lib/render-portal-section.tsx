import { AdminDashboard } from "@/components/portal/admin-dashboard";
import { ManagerApplications } from "@/components/portal/manager-applications";
import { ManagerCalendar } from "@/components/portal/manager-calendar";
import { ManagerDashboard } from "@/components/portal/manager-dashboard";
import { ManagerInbox } from "@/components/portal/manager-inbox";
import { ManagerLeases } from "@/components/portal/manager-leases";
import { ManagerOwners } from "@/components/portal/manager-owners";
import { ManagerPayments } from "@/components/portal/manager-payments";
import { ManagerProfile } from "@/components/portal/manager-profile";
import { AdminManagersClient } from "@/components/portal/admin-managers-client";
import { AdminOwnersClient } from "@/components/portal/admin-owners-client";
import { AdminLeasesClient } from "@/components/portal/admin-leases-client";
import { AdminPropertiesClient } from "@/components/portal/admin-properties-client";
import { ManagerProperties } from "@/components/portal/manager-properties";
import { ManagerWorkOrders } from "@/components/portal/manager-work-orders";
import { OwnerManagers } from "@/components/portal/owner-managers";
import { OwnerProperties } from "@/components/portal/owner-properties";
import { ResidentDashboard } from "@/components/portal/resident-dashboard";
import { ResidentInboxPanel } from "@/components/portal/resident-inbox-panel";
import { ResidentLeasePanel } from "@/components/portal/resident-lease-panel";
import { ResidentPaymentsPanel } from "@/components/portal/resident-payments-panel";
import { ResidentProfilePanel } from "@/components/portal/resident-profile-panel";
import { ResidentWorkOrdersPanel } from "@/components/portal/resident-work-orders-panel";
import { PortalWorkspaceClient } from "@/components/portal/portal-workspace-client";
import type { Crumb } from "@/components/layout/breadcrumbs";
import type { TabItem } from "@/components/ui/tabs";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { findSection, getPortalDefinition } from "@/lib/portals";
import { buildPortalWorkspaceModel } from "@/lib/portal-workspace-model";
import type { PortalKind } from "@/lib/portal-types";
import { notFound, redirect } from "next/navigation";

export async function renderPortalSection(
  kind: PortalKind,
  section: string,
  tabParts?: string[],
) {
  const def = await getPortalDefinition(kind);
  const residentCtx = kind === "resident" ? await getServerSessionProfile() : null;
  const meta = findSection(def, section);
  if (!meta) notFound();

  if (kind === "admin" && section === "dashboard") {
    if (tabParts?.length) notFound();
    return <AdminDashboard />;
  }

  if (kind === "admin" && section === "properties") {
    if (tabParts?.length) notFound();
    return <AdminPropertiesClient />;
  }

  if (kind === "admin" && section === "managers") {
    if (tabParts?.length) notFound();
    return <AdminManagersClient />;
  }

  if (kind === "admin" && section === "owners") {
    if (tabParts?.length) notFound();
    return <AdminOwnersClient />;
  }

  if (kind === "admin" && section === "leases") {
    if (tabParts?.length) notFound();
    return <AdminLeasesClient />;
  }

  if (kind === "manager") {
    if (tabParts?.length) notFound();
    if (section === "dashboard") return <ManagerDashboard />;
    if (section === "properties") return <ManagerProperties />;
    if (section === "applications") return <ManagerApplications />;
    if (section === "leases") return <ManagerLeases />;
    if (section === "payments") return <ManagerPayments />;
    if (section === "work-orders") return <ManagerWorkOrders />;
    if (section === "owners") return <ManagerOwners />;
    if (section === "inbox") return <ManagerInbox />;
    if (section === "calendar") return <ManagerCalendar />;
    if (section === "profile") return <ManagerProfile />;
  }

  if (kind === "owner") {
    if (tabParts?.length) notFound();
    if (section === "dashboard") return <ManagerDashboard />;
    if (section === "properties") return <OwnerProperties />;
    if (section === "applications") return <ManagerApplications />;
    if (section === "leases") return <ManagerLeases />;
    if (section === "payments") return <ManagerPayments />;
    if (section === "work-orders") return <ManagerWorkOrders />;
    if (section === "managers") return <OwnerManagers />;
    if (section === "profile") return <ManagerProfile />;
  }

  if (kind === "resident" && section === "dashboard") {
    if (tabParts?.length) notFound();
    const profile = residentCtx?.profile;
    return (
      <ResidentDashboard
        applicationApproved={profile?.application_approved ?? false}
        displayName={profile?.full_name ?? profile?.email ?? "Resident"}
      />
    );
  }

  if (kind === "resident" && section === "profile") {
    if (tabParts?.length) notFound();
    return <ResidentProfilePanel />;
  }

  if (kind === "resident") {
    const profile = residentCtx?.profile;
    const approved = profile?.application_approved ?? false;
    if (approved) {
      if (tabParts?.length) notFound();
      if (section === "lease") return <ResidentLeasePanel />;
      if (section === "payments") return <ResidentPaymentsPanel />;
      if (section === "work-orders") return <ResidentWorkOrdersPanel />;
      if (section === "inbox") return <ResidentInboxPanel />;
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerEditLeasesModal } from "@/components/portal/manager-edit-leases-modal";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { ApplicationFilterSortFields } from "@/components/portal/application-filter-sort-fields";
import { PortalFilterSortSheet, portalFilterActiveCount } from "@/components/portal/portal-filter-sort-sheet";
import { PortalActiveFilterChips } from "@/components/portal/portal-filter-chips";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerLeaseTab } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  LEASE_PIPELINE_EVENT,
  countManagerLeaseTabs,
  readLeasePipeline,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { buildManagerShareablePropertyOptions } from "@/lib/manager-property-links";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { getPropertyById } from "@/lib/rental-application/data";
import { leaseListHref } from "@/lib/portal-detail-routes";

const LEASE_LABELS: { id: ManagerLeaseTab; label: string; dataAttr: string }[] = [
  { id: "manager", label: "Manager review", dataAttr: "leases-tab-manager" },
  { id: "resident", label: "Resident signature", dataAttr: "leases-tab-resident" },
  { id: "signed", label: "Manager signature", dataAttr: "leases-tab-signed" },
  { id: "completed", label: "Signed", dataAttr: "leases-tab-completed" },
];

export function ManagerLeases({
  tab: tabProp = "manager",
  basePath = "/portal",
  leaseId: leaseIdProp,
}: {
  tab?: ManagerLeaseTab;
  basePath?: string;
  leaseId?: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [tab, setTab] = useState<ManagerLeaseTab>(tabProp);
  const [prevTabProp, setPrevTabProp] = useState(tabProp);
  if (tabProp !== prevTabProp) {
    setPrevTabProp(tabProp);
    if (tab !== tabProp) setTab(tabProp);
  }
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [clientReady, setClientReady] = useState(false);
  const [editLeasesOpen, setEditLeasesOpen] = useState(false);
  const [shareLeasesOpen, setShareLeasesOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setClientReady(true));
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    const on = () => setTick((t) => t + 1);
    void Promise.all([
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
    ]).then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
  }, [authReady, userId]);

  const propertyOptions = useMemo(() => {
    if (!clientReady) return [];
    void tick;
    void propertyTick;
    const base = buildManagerPropertyFilterOptions(userId);
    const labelById = new Map(base.map((option) => [option.id, option.label]));
    for (const row of readLeasePipeline(userId)) {
      const propertyId = row.application?.propertyId?.trim();
      if (!propertyId || labelById.has(propertyId)) continue;
      labelById.set(propertyId, getPropertyById(propertyId)?.title?.trim() || row.unit || propertyId);
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [clientReady, userId, tick, propertyTick]);

  const propertyFilterLabel = useMemo(() => {
    if (!propertyFilter.trim()) return "";
    return propertyOptions.find((option) => option.id === propertyFilter)?.label ?? propertyFilter;
  }, [propertyFilter, propertyOptions]);

  const rows = useMemo(() => {
    if (!clientReady) return [];
    void tick;
    const allRows = readLeasePipeline(userId);
    const filtered = !propertyFilter.trim()
      ? allRows
      : allRows.filter((row) => row.application?.propertyId?.trim() === propertyFilter);

    return [...filtered].sort((a, b) => {
      if (propertyFilter) {
        const byResident = a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
        if (byResident !== 0) return byResident;
      }

      const byHouse = a.unit.localeCompare(b.unit, undefined, { sensitivity: "base" });
      if (byHouse !== 0) return byHouse;

      const byResident = a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
      if (byResident !== 0) return byResident;

      const aTs = Date.parse(a.updatedAtIso || "");
      const bTs = Date.parse(b.updatedAtIso || "");
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });
  }, [clientReady, tick, propertyFilter, userId]);

  const searchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [row.residentName, row.unit, row.residentEmail, row.status].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery]);


  useEffect(() => {
    const emails = [...new Set(searchedRows.map((row) => row.residentEmail.trim().toLowerCase()).filter(Boolean))];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      if (isDemoModeActive()) {
        setResidentAccountEmails(new Set(emails));
        return;
      }
      return fetch("/api/manager/resident-account-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { emails?: string[] };
          if (!cancelled && res.ok) {
            setResidentAccountEmails(new Set((body.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean)));
          }
        })
        .catch(() => {
          if (!cancelled) setResidentAccountEmails(new Set());
        });
    });
    return () => {
      cancelled = true;
    };
  }, [searchedRows]);

  const counts = useMemo(() => countManagerLeaseTabs(searchedRows), [searchedRows]);
  const tabs = useMemo(
    () => LEASE_LABELS.map(({ id, label, dataAttr }) => ({ id, label, count: counts[id], dataAttr })),
    [counts],
  );

  const editablePropertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  const shareableProperties = useMemo(() => {
    void propertyTick;
    return buildManagerShareablePropertyOptions(userId);
  }, [userId, propertyTick]);

  const leasesFilterSheet = (
    <PortalFilterSortSheet
      activeCount={portalFilterActiveCount([propertyFilter])}
      desktopPresentation="panel"
      className="min-w-0 max-md:w-full max-md:[&_button]:w-full max-md:[&_button]:px-2.5"
      onReset={() => setPropertyFilter("")}
      dataAttr="leases-filter-sheet-open"
    >
      <ApplicationFilterSortFields
        propertyOptions={propertyOptions}
        propertyFilter={propertyFilter}
        onPropertyFilterChange={setPropertyFilter}
        dataAttr="leases-filter-property"
      />
    </PortalFilterSortSheet>
  );

  const leasesShareButton = (
    <Button
      type="button"
      variant="outline"
      className={`w-full shrink-0 md:w-auto ${PORTAL_HEADER_ACTION_BTN}`}
      data-attr="leases-share"
      disabled={shareableProperties.length === 0}
      title={shareableProperties.length === 0 ? "List a property as active before sharing" : "Share listing links"}
      onClick={() => setShareLeasesOpen(true)}
    >
      Share
    </Button>
  );

  const leasesEditButton = (
    <Button
      type="button"
      variant="outline"
      className={`w-full shrink-0 md:w-auto ${PORTAL_HEADER_ACTION_BTN}`}
      data-attr="leases-edit-properties"
      disabled={editablePropertyOptions.length === 0}
      title={editablePropertyOptions.length === 0 ? "Add a property before editing lease settings" : undefined}
      onClick={() => setEditLeasesOpen(true)}
    >
      Edit
    </Button>
  );

  const leasesDesktopHeaderActions = (
    <PortalSectionActionRow variant="header" className="ml-auto hidden gap-2 sm:gap-3 md:flex">
      {leasesFilterSheet}
      {leasesShareButton}
      {leasesEditButton}
    </PortalSectionActionRow>
  );

  const leasesMobileActionsRow = (
    <div className="mb-3 md:hidden" data-slot="leases-mobile-actions">
      <div className="grid grid-cols-3 gap-2 [&_button]:min-w-0 [&_button]:w-full [&>div]:min-w-0">
        {leasesFilterSheet}
        {leasesShareButton}
        {leasesEditButton}
      </div>
    </div>
  );

  const modals = (
    <>
      <ManagerEditLeasesModal
        open={editLeasesOpen}
        onClose={() => setEditLeasesOpen(false)}
        propertyOptions={editablePropertyOptions}
        managerUserId={userId}
        onSaved={() => setPropertyTick((n) => n + 1)}
        showToast={showToast}
      />
      <ShareLeadLinkModal
        open={shareLeasesOpen}
        onClose={() => setShareLeasesOpen(false)}
        kind="listing"
        properties={shareableProperties}
      />
    </>
  );

  if (leaseIdProp) {
    return (
      <>
        <ManagerLeasesPipelinePanel
          rows={rows}
          tab={tab}
          refreshKey={tick}
          managerUserId={userId}
          residentAccountEmails={residentAccountEmails}
          leaseId={leaseIdProp}
          listBasePath={basePath}
          onEmailAccountSetup={(email) => {
            setResidentAccountEmails((prev) => new Set([...prev, email.trim().toLowerCase()]));
          }}
        />
        {modals}
      </>
    );
  }

  return (
    <>
      <ManagerPortalPageShell
        title="Leases"
        titleAside={leasesDesktopHeaderActions}
        hideTitleOnMobileNav
        compactFilterRow
      >
        {leasesMobileActionsRow}
        <PortalListControlStack
          className="mb-3"
          destinations={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            href: leaseListHref(basePath, t.id),
            count: t.count,
            dataAttr: t.dataAttr,
          }))}
          activeDestinationId={tab}
          destinationAriaLabel="Lease pipeline stage"
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: "Search residents or units",
            dataAttr: "leases-search",
          }}
          activeFilterChips={
            propertyFilter ? (
              <PortalActiveFilterChips
                chips={[
                  {
                    id: "property",
                    label: `Property: ${propertyFilterLabel}`,
                    onRemove: () => setPropertyFilter(""),
                  },
                ]}
              />
            ) : null
          }
        />
        <div className="portal-communication-inbox max-md:mt-0 max-md:-mx-0.5 md:mt-1">
          <ManagerLeasesPipelinePanel
            rows={searchedRows}
            tab={tab}
            refreshKey={tick}
            managerUserId={userId}
            residentAccountEmails={residentAccountEmails}
            leaseId={leaseIdProp}
            listBasePath={basePath}
            onEmailAccountSetup={(email) => {
              setResidentAccountEmails((prev) => new Set([...prev, email.trim().toLowerCase()]));
            }}
          />
        </div>
      </ManagerPortalPageShell>
      {modals}
    </>
  );
}

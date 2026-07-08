"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerEditLeasesModal } from "@/components/portal/manager-edit-leases-modal";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import {
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalFilterRow,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
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
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { getPropertyById } from "@/lib/rental-application/data";

const LEASE_LABELS: { id: ManagerLeaseTab; label: string; dataAttr: string }[] = [
  { id: "manager", label: "Manager review", dataAttr: "leases-tab-manager" },
  { id: "resident", label: "Resident signature pending", dataAttr: "leases-tab-resident" },
  { id: "signed", label: "Manager signature pending", dataAttr: "leases-tab-signed" },
  { id: "completed", label: "Signed", dataAttr: "leases-tab-completed" },
];

export function ManagerLeases() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [tab, setTab] = useState<ManagerLeaseTab>("manager");
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [clientReady, setClientReady] = useState(false);
  const [editLeasesOpen, setEditLeasesOpen] = useState(false);

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

  useEffect(() => {
    const emails = [...new Set(rows.map((row) => row.residentEmail.trim().toLowerCase()).filter(Boolean))];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      // Demo sandbox: every demo resident already has an Axis account, so
      // leases are sendable/signable instead of blocked on account creation.
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
  }, [rows]);

  const counts = useMemo(() => countManagerLeaseTabs(rows), [rows]);
  const tabs = useMemo(
    () => LEASE_LABELS.map(({ id, label, dataAttr }) => ({ id, label, count: counts[id], dataAttr })),
    [counts],
  );

  const editablePropertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  return (
    <>
    <ManagerPortalPageShell
      title="Leases"
      titleAside={
        <Button
          type="button"
          variant="outline"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          data-attr="leases-edit-properties"
          disabled={editablePropertyOptions.length === 0}
          title={editablePropertyOptions.length === 0 ? "Add a property before editing lease settings" : undefined}
          onClick={() => setEditLeasesOpen(true)}
        >
          Edit
          <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
        </Button>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            compact
            tabs={tabs}
            activeId={tab}
            onChange={(id) => setTab(id as ManagerLeaseTab)}
          />
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </ManagerPortalFilterRow>
      }
    >
      <ManagerLeasesPipelinePanel
        rows={rows}
        tab={tab}
        refreshKey={tick}
        managerUserId={userId}
        residentAccountEmails={residentAccountEmails}
        onEmailAccountSetup={(email) => {
          setResidentAccountEmails((prev) => new Set([...prev, email.trim().toLowerCase()]));
        }}
      />
    </ManagerPortalPageShell>
    <ManagerEditLeasesModal
      open={editLeasesOpen}
      onClose={() => setEditLeasesOpen(false)}
      propertyOptions={editablePropertyOptions}
      managerUserId={userId}
      onSaved={() => setPropertyTick((n) => n + 1)}
      showToast={showToast}
    />
    </>
  );
}

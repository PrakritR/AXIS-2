"use client";

import { useEffect, useMemo, useState } from "react";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import {
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalFilterRow,
  PORTAL_FILTER_ACTIONS_MOBILE,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
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

const LEASE_LABELS: { id: ManagerLeaseTab; label: string }[] = [
  { id: "manager", label: "Manager review" },
  { id: "admin", label: "Admin review" },
  { id: "resident", label: "Resident signature pending" },
  { id: "signed", label: "Manager signature pending" },
  { id: "completed", label: "Signed" },
];

export function ManagerLeases() {
  const { userId, ready: authReady } = useManagerUserId();
  const [tab, setTab] = useState<ManagerLeaseTab>("manager");
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [clientReady, setClientReady] = useState(false);

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
    () => LEASE_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Leases"
      titleAside={
        <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </div>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            compact
            tabs={tabs}
            activeId={tab}
            onChange={(id) => setTab(id as ManagerLeaseTab)}
          />
          <div className={`${PORTAL_FILTER_ACTIONS_MOBILE} min-w-0`}>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
          </div>
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
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  MANAGER_WORK_ORDERS_EVENT,
} from "@/lib/manager-work-orders-storage";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import {
  PortalDataTableEmpty,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";

function formatCents(cents?: number): string {
  if (cents == null || !(cents > 0)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function categoryLabel(row: DemoManagerWorkOrderRow): string {
  const labels: Record<string, string> = {
    cleaning: "Cleaning",
    plumbing: "Plumbing",
    mold: "Mold remediation",
    electrical: "Electrical",
    hvac: "HVAC",
    general: "Maintenance",
  };
  if (row.category) return labels[row.category] ?? row.category;
  return "—";
}

export function ManagerWorkDonePanel() {
  const { userId, ready: authReady } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
    void syncManagerWorkOrdersFromServer();
    const onWo = () => setDataTick((t) => t + 1);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
  }, [authReady, userId]);

  const rows = useMemo(() => {
    void dataTick;
    if (!userId) return [];
    return readManagerWorkOrderRows()
      .filter((r) => r.bucket === "completed")
      .filter((r) => !r.managerUserId || r.managerUserId === userId)
      .filter((r) => !propertyFilter || r.propertyId === propertyFilter || r.assignedPropertyId === propertyFilter)
      .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
  }, [userId, dataTick, propertyFilter]);

  const totalLabor = rows.reduce((s, r) => s + (r.vendorCostCents ?? 0), 0);
  const totalMaterials = rows.reduce((s, r) => s + (r.materialsCostCents ?? 0), 0);

  return (
    <ManagerPortalPageShell
      title="Work done"
      subtitle="Completed maintenance with vendor and materials costs — synced to Finances expenses."
      titleAside={
        <PortalPropertyFilterPill
          propertyOptions={propertyOptions}
          propertyValue={propertyFilter}
          onPropertyChange={setPropertyFilter}
        />
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="text-xs text-muted">Completed jobs</p>
          <p className="text-lg font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="text-xs text-muted">Labor / vendor costs</p>
          <p className="text-lg font-semibold">{formatCents(totalLabor)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="text-xs text-muted">Materials / equipment</p>
          <p className="text-lg font-semibold">{formatCents(totalMaterials)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <PortalDataTableEmpty message="No completed work with logged costs yet." />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Completed</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property · Unit</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Description</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Vendor</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Labor</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Materials</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Total</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Expenses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const total = (row.vendorCostCents ?? 0) + (row.materialsCostCents ?? 0);
                  return (
                    <tr key={row.id} className={PORTAL_TABLE_TR}>
                      <td className={PORTAL_TABLE_TD}>{row.completedAt?.slice(0, 10) ?? "—"}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {row.propertyName}
                        {row.unit ? ` · ${row.unit}` : ""}
                      </td>
                      <td className={PORTAL_TABLE_TD}>{categoryLabel(row)}</td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className="font-medium">{row.title}</span>
                        {row.workDoneSummary ? (
                          <p className="mt-0.5 text-xs text-muted line-clamp-2">{row.workDoneSummary}</p>
                        ) : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>{row.vendorName ?? "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>{formatCents(row.vendorCostCents)}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>{formatCents(row.materialsCostCents)}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right font-medium`}>{formatCents(total)}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {(row.expenseEntryIds?.length ?? 0) > 0 ? `${row.expenseEntryIds!.length} linked` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ManagerPortalPageShell>
  );
}

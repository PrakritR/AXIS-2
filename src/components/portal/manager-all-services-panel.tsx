"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  ManagerPortalStatusPills,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  MANAGER_WORK_ORDERS_EVENT,
} from "@/lib/manager-work-orders-storage";
import {
  readServiceRequestsForManager,
  approveServiceRequest,
  deleteServiceRequest,
  denyServiceRequest,
  markServiceRequestServicePaid,
  markServiceRequestDepositPaid,
  SERVICE_REQUESTS_EVENT,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import {
  ManagerVendorsPanel,
  type ManagerVendorsPanelHandle,
} from "@/components/portal/manager-vendors-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";

type FilterType = "requests" | "work-orders" | "vendors";

const STATUS_PILL: Record<string, string> = {
  pending: "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  approved: "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  denied: "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  returned: "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  open: "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  scheduled: "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
  completed: "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  returned: "Returned",
  open: "Open",
  scheduled: "Scheduled",
  completed: "Completed",
};

function hasDeposit(dep: string) {
  return dep.trim() !== "" && dep.trim() !== "0" && dep.trim() !== "$0";
}

export function ManagerAllServicesPanel({
  tabId,
  basePath,
}: {
  tabId: FilterType;
  basePath: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [woBucket, setWoBucket] = useState<ManagerWorkOrderBucket>("open");
  const vendorsPanelRef = useRef<ManagerVendorsPanelHandle>(null);
  const typeFilter: FilterType = tabId;

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
    void syncManagerWorkOrdersFromServer();
    const onWo = () => setDataTick((t) => t + 1);
    const onSr = () => setDataTick((t) => t + 1);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
    };
  }, [authReady, userId]);

  const workOrders = useMemo<DemoManagerWorkOrderRow[]>(() => {
    void dataTick;
    if (!userId) return [];
    return readManagerWorkOrderRows().filter((r) => !r.managerUserId || r.managerUserId === userId);
  }, [userId, dataTick]);

  const serviceRequests = useMemo<ServiceRequest[]>(() => {
    void dataTick;
    if (!userId) return [];
    return readServiceRequestsForManager(userId);
  }, [userId, dataTick]);

  const filterPropertyOptions = useMemo(() => {
    const opts = [...propertyOptions];
    const seen = new Set(opts.map((p) => p.id));
    const woProps = workOrders
      .filter((w) => w.propertyId?.trim())
      .map((w) => ({ id: w.propertyId!, label: w.propertyName || w.propertyId! }));
    for (const p of woProps) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        opts.push(p);
      }
    }
    const srProps = serviceRequests
      .filter((r) => r.propertyId?.trim())
      .map((r) => {
        const match = propertyOptions.find((p) => p.id === r.propertyId);
        return { id: r.propertyId, label: match?.label ?? r.propertyId };
      });
    for (const p of srProps) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        opts.push(p);
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [propertyOptions, workOrders, serviceRequests]);

  const filteredWorkOrders = useMemo(() => {
    let rows = workOrders;
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter || r.assignedPropertyId === propertyFilter);
    return rows;
  }, [workOrders, propertyFilter]);

  const filteredRequests = useMemo(() => {
    let rows = serviceRequests;
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter);
    return rows;
  }, [serviceRequests, propertyFilter]);

  type UnifiedItem =
    | { kind: "request"; data: ServiceRequest; sortKey: number }
    | { kind: "work-order"; data: DemoManagerWorkOrderRow; sortKey: number };

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    if (typeFilter !== "work-orders") {
      for (const r of filteredRequests) {
        items.push({ kind: "request", data: r, sortKey: new Date(r.requestedAt).getTime() });
      }
    }
    if (typeFilter !== "requests") {
      for (const w of filteredWorkOrders) {
        const t = w.scheduledAtIso ? new Date(w.scheduledAtIso).getTime() : 0;
        items.push({ kind: "work-order", data: w, sortKey: t });
      }
    }
    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
  }, [filteredRequests, filteredWorkOrders, typeFilter]);

  const pendingCount = filteredRequests.filter((r) => r.status === "pending").length;
  const openCount = filteredWorkOrders.filter((w) => w.bucket === "open").length;
  const woCounts = useMemo(() => {
    const c: Record<ManagerWorkOrderBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of filteredWorkOrders) c[r.bucket] += 1;
    return c;
  }, [filteredWorkOrders]);
  const woTabs = useMemo(
    () =>
      (["open", "scheduled", "completed"] as const).map((id) => ({
        id,
        label: id === "open" ? "Open" : id === "scheduled" ? "Scheduled" : "Completed",
        count: woCounts[id],
      })),
    [woCounts],
  );

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        <div className={`${PORTAL_PAGE_ACTIONS_DESKTOP} flex-wrap items-center justify-end gap-2`}>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300/60">
              {pendingCount} awaiting approval
            </span>
          )}
          {openCount > 0 && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 ring-1 ring-sky-300/60">
              {openCount} open work orders
            </span>
          )}
          <PortalPropertyFilterPill
            propertyOptions={filterPropertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </div>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav
            activeId={typeFilter}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests` },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders` },
              { id: "vendors", label: "Vendors", href: `${basePath}/services/vendors` },
            ]}
          />
          {typeFilter === "vendors" ? (
            <Button type="button" className="shrink-0 rounded-full text-xs" onClick={() => vendorsPanelRef.current?.openAdd()}>
              Add vendor
            </Button>
          ) : null}
        </ManagerPortalFilterRow>
      }
    >
      <div className="mt-1">
        {typeFilter === "vendors" ? (
          <ManagerVendorsPanel ref={vendorsPanelRef} embedded />
        ) : typeFilter === "work-orders" ? (
          <>
            <div className="mb-4">
              <ManagerPortalStatusPills
                tabs={woTabs}
                activeId={woBucket}
                onChange={(id) => setWoBucket(id as ManagerWorkOrderBucket)}
              />
            </div>
            <ManagerWorkOrdersPanel
              allRows={filteredWorkOrders}
              bucket={woBucket}
              onAfterSchedule={() => setWoBucket("scheduled")}
            />
          </>
        ) : unified.length === 0 ? (
          <PortalDataTableEmpty message="No service requests yet." icon="service" />
        ) : (
          <div className={PORTAL_DATA_TABLE_WRAP}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="min-w-[920px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  </tr>
                </thead>
                <tbody>
            {unified.map((item) => {
              const id = item.kind === "request" ? `request-${item.data.id}` : `work-order-${item.data.id}`;
              const isExpanded = expandedId === id;

              if (item.kind === "request") {
                const req = item.data;
                const needsReturn = hasDeposit(req.deposit);
                return (
                  <Fragment key={`req-${req.id}`}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() => setExpandedId(isExpanded ? null : id))}
                      aria-expanded={isExpanded}
                    >
                      <td className={PORTAL_TABLE_TD}>Request</td>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{req.offerName}</td>
                      <td className={PORTAL_TABLE_TD}>{req.residentName || req.residentEmail}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
                          ? propertyOptions.find((p) => p.id === req.propertyId)!.label
                          : "—"}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[req.status] ?? "bg-accent/40 text-muted ring-border"}`}>
                          {STATUS_LABEL[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        {[req.price, needsReturn ? `Deposit ${req.deposit}` : null].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={6} className={PORTAL_TABLE_DETAIL_CELL}>
                          <div className="space-y-3">
                            {req.notes ? <p className="text-xs italic text-muted">&ldquo;{req.notes}&rdquo;</p> : null}
                        {req.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="h-8 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                              onClick={() => { approveServiceRequest(req.id); setDataTick((t) => t + 1); showToast(`Approved "${req.offerName}".`); }}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                              onClick={() => { denyServiceRequest(req.id); setDataTick((t) => t + 1); showToast("Request denied."); }}
                            >
                              Deny
                            </Button>
                          </div>
                        ) : null}

                        {(req.status === "approved" || req.status === "returned") ? (
                          <div className="rounded-xl bg-accent/40 p-3 ring-1 ring-border">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Charges</p>
                            <div className="space-y-2">
                              {req.price ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-foreground/80">Service fee · {req.price}</span>
                                  {req.servicePaid
                                    ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Paid</span>
                                    : <Button type="button" className="h-6 rounded-full px-2.5 text-[10px]" onClick={() => { markServiceRequestServicePaid(req.id); setDataTick((t) => t + 1); showToast("Service charge marked paid."); }}>Mark paid</Button>
                                  }
                                </div>
                              ) : null}
                              {needsReturn ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-foreground/80">Deposit · {req.deposit}</span>
                                  {req.depositPaid
                                    ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Refunded</span>
                                    : <Button type="button" className="h-6 rounded-full px-2.5 text-[10px]" onClick={() => { markServiceRequestDepositPaid(req.id); setDataTick((t) => t + 1); showToast("Deposit marked refunded."); }}>Mark refunded</Button>
                                  }
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                            onClick={() => {
                              if (!window.confirm("Delete this request? This cannot be undone.")) return;
                              deleteServiceRequest(req.id);
                              setDataTick((t) => t + 1);
                              setExpandedId(null);
                              showToast("Request deleted.");
                            }}
                          >
                            Delete request
                          </Button>
                        </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              }

              // Work order
              const wo = item.data;
              return (
                <Fragment key={`wo-${wo.id}`}>
                  <tr
                    className={PORTAL_TABLE_TR_EXPANDABLE}
                    onClick={createPortalRowExpandClick(() => setExpandedId(isExpanded ? null : id))}
                    aria-expanded={isExpanded}
                  >
                    <td className={PORTAL_TABLE_TD}>Work order</td>
                    <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{wo.title}</td>
                    <td className={PORTAL_TABLE_TD}>{wo.residentName ?? wo.residentEmail ?? "Resident"}</td>
                    <td className={PORTAL_TABLE_TD}>
                      {[wo.propertyName, wo.unit].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={PORTAL_TABLE_TD}>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[wo.bucket] ?? "bg-accent/40 text-muted ring-border"}`}>
                        {STATUS_LABEL[wo.bucket] ?? wo.status}
                      </span>
                    </td>
                    <td className={PORTAL_TABLE_TD}>{wo.priority}</td>
                  </tr>
                  {isExpanded ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={6} className={PORTAL_TABLE_DETAIL_CELL}>
                        {wo.description ? (
                          <p className="mb-3 text-sm leading-relaxed text-muted">{wo.description}</p>
                        ) : null}
                      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Preferred arrival</p>
                          <p className="mt-1 text-foreground">{wo.preferredArrival?.trim() || "Anytime"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visit</p>
                          <p className="mt-1 text-foreground">{wo.scheduled && wo.scheduled !== "—" ? wo.scheduled : "Not scheduled"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cost</p>
                          <p className="mt-1 text-foreground">{wo.cost !== "—" && wo.cost?.trim() ? wo.cost : "—"}</p>
                        </div>
                      </div>
                      {wo.bucket !== "completed" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full text-xs"
                            onClick={() => {
                              updateManagerWorkOrder(wo.id, (r) => ({ ...r, bucket: "completed", status: "Completed" }));
                              setDataTick((t) => t + 1);
                              showToast("Work order marked complete.");
                            }}
                          >
                            Mark complete
                          </Button>
                        </div>
                      ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ManagerPortalPageShell>
  );
}

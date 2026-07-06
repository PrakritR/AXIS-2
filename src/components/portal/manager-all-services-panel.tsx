"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  ManagerPortalStatusPills,
  PORTAL_PAGE_ACTIONS_DESKTOP,
  PORTAL_HEADER_ACTION_BTN,
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
import {
  readServiceRequestsForManager,
  syncServiceRequestsFromServer,
  SERVICE_REQUESTS_EVENT,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import {
  ManagerServiceRequestDetail,
  managerServiceRequestBucket,
  managerServiceRequestPricingSummary,
  type ManagerServiceRequestBucket,
} from "@/components/portal/manager-service-request-detail";
import { ManagerCreateServiceRequestModal } from "@/components/portal/manager-create-service-request-modal";
import { ManagerCreateWorkOrderModal } from "@/components/portal/manager-create-work-order-modal";
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
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";

type FilterType = "requests" | "work-orders" | "vendors";

type RequestBucket = ManagerServiceRequestBucket;

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
  const [reqBucket, setReqBucket] = useState<RequestBucket>("pending");
  const [addRequestOpen, setAddRequestOpen] = useState(false);
  const [addWorkOrderOpen, setAddWorkOrderOpen] = useState(false);
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
    void syncServiceRequestsFromServer();
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

  const bucketedRequests = useMemo(
    () =>
      filteredRequests
        .filter((r) => managerServiceRequestBucket(r.status) === reqBucket)
        .slice()
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [filteredRequests, reqBucket],
  );

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
        label: id === "open" ? "Pending" : id === "scheduled" ? "Scheduled" : "Completed",
        count: woCounts[id],
      })),
    [woCounts],
  );
  const reqCounts = useMemo(() => {
    const c: Record<RequestBucket, number> = { pending: 0, approved: 0, completed: 0 };
    for (const r of filteredRequests) c[managerServiceRequestBucket(r.status)] += 1;
    return c;
  }, [filteredRequests]);
  const reqTabs = useMemo(
    () =>
      (["pending", "approved", "completed"] as const).map((id) => ({
        id,
        label: id === "pending" ? "Pending" : id === "approved" ? "Approved" : "Completed",
        count: reqCounts[id],
      })),
    [reqCounts],
  );

  const renderRequestDetail = (req: ServiceRequest) => {
    const propertyLabel =
      req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
        ? propertyOptions.find((p) => p.id === req.propertyId)!.label
        : "—";
    return (
      <ManagerServiceRequestDetail
        req={req}
        propertyLabel={propertyLabel}
        onUpdated={() => setDataTick((t) => t + 1)}
        onApproved={() => setReqBucket("approved")}
        onCollapsed={() => setExpandedId(null)}
      />
    );
  };

  return (
    <ManagerPortalPageShell
      title={typeFilter === "vendors" ? "Vendors" : "Services"}
      titleAside={
        <>
          <div className={`${PORTAL_PAGE_ACTIONS_DESKTOP} flex-wrap items-center justify-end gap-2`}>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300/60">
                {pendingCount} awaiting approval
              </span>
            )}
            {openCount > 0 && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 ring-1 ring-sky-300/60">
                {openCount} pending work orders
              </span>
            )}
          </div>
          {typeFilter === "vendors" ? (
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              onClick={() => vendorsPanelRef.current?.openAdd()}
            >
              Add vendor
            </Button>
          ) : null}
          {typeFilter === "requests" ? (
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              data-attr="manager-service-request-add"
              onClick={() => setAddRequestOpen(true)}
            >
              Add request
            </Button>
          ) : null}
          {typeFilter === "work-orders" ? (
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              data-attr="manager-work-order-add"
              onClick={() => setAddWorkOrderOpen(true)}
            >
              Add work order
            </Button>
          ) : null}
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav
            activeId={typeFilter}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests`, dataAttr: "manager-services-tab-requests" },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders`, dataAttr: "manager-services-tab-work-orders" },
              { id: "vendors", label: "Vendors", href: `${basePath}/services/vendors`, dataAttr: "manager-services-tab-vendors" },
            ]}
          />
          <PortalPropertyFilterPill
            propertyOptions={filterPropertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
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
        ) : (
          <>
            <div className="mb-4">
              <ManagerPortalStatusPills
                tabs={reqTabs}
                activeId={reqBucket}
                onChange={(id) => setReqBucket(id as RequestBucket)}
              />
            </div>
            {bucketedRequests.length === 0 ? (
              <PortalDataTableEmpty
                message={filteredRequests.length === 0 ? "No service requests yet." : "No requests in this bucket yet."}
                icon="service"
              />
            ) : (
          <>
          <div className="space-y-2 lg:hidden">
            {bucketedRequests.map((req) => {
              const id = `request-${req.id}`;
              const isExpanded = expandedId === id;
              const propertyLabel =
                req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
                  ? propertyOptions.find((p) => p.id === req.propertyId)!.label
                  : "—";
              const summary = managerServiceRequestPricingSummary(req);
              return (
                <div key={`req-mobile-${req.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <p className="truncate font-semibold text-foreground">{req.offerName}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[req.residentName || req.residentEmail, propertyLabel].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted/90">{summary}</p>
                  </button>
                  {isExpanded ? (
                    <div className="mt-3 border-t border-border pt-3">{renderRequestDetail(req)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  </tr>
                </thead>
                <tbody>
            {bucketedRequests.map((req) => {
              const id = `request-${req.id}`;
              const isExpanded = expandedId === id;
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
                      <td className={PORTAL_TABLE_TD}>{managerServiceRequestPricingSummary(req)}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                          {renderRequestDetail(req)}
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
          </>
            )}
          </>
        )}
      </div>

      <ManagerCreateServiceRequestModal
        open={addRequestOpen}
        onClose={() => setAddRequestOpen(false)}
        managerUserId={userId}
        defaultPropertyId={propertyFilter || undefined}
        onSubmitted={() => {
          setDataTick((t) => t + 1);
          setReqBucket("pending");
        }}
      />

      <ManagerCreateWorkOrderModal
        open={addWorkOrderOpen}
        onClose={() => setAddWorkOrderOpen(false)}
        managerUserId={userId}
        defaultPropertyId={propertyFilter || undefined}
        onSubmitted={(bucket) => {
          setDataTick((t) => t + 1);
          setWoBucket(bucket);
        }}
      />
    </ManagerPortalPageShell>
  );
}

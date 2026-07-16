"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  buildManagerPropertyFilterOptions,
  moduleRowVisibleToPortalUser,
  samePropertyId,
} from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  MANAGER_WORK_ORDERS_EVENT,
} from "@/lib/manager-work-orders-storage";
import {
  readAllServiceRequests,
  syncServiceRequestsFromServer,
  SERVICE_REQUESTS_EVENT,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import {
  ManagerServiceRequestDetail,
  managerServiceRequestBucket,
  type ManagerServiceRequestBucket,
} from "@/components/portal/manager-service-request-detail";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { ManagerCreateServiceRequestModal } from "@/components/portal/manager-create-service-request-modal";
import { ManagerCreateWorkOrderModal } from "@/components/portal/manager-create-work-order-modal";
import {
  ManagerVendorsPanel,
  type ManagerVendorsPanelHandle,
} from "@/components/portal/manager-vendors-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { TabNav, useShallowTabId } from "@/components/ui/tabs";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableColGroup,
  PortalDataTableEmpty,
  portalTableColumnPercents,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";

type FilterType = "requests" | "work-orders" | "vendors";

type RequestBucket = ManagerServiceRequestBucket;

const SERVICES_TAB_IDS = ["requests", "work-orders", "vendors"] as const;

export function ManagerAllServicesPanel({
  tabId: serverTabId,
  basePath,
}: {
  tabId: FilterType;
  basePath: string;
}) {
  // Tab switches are shallow (client-only) — see TabNav `shallow` below.
  const tabId = useShallowTabId<FilterType>(serverTabId, SERVICES_TAB_IDS);
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
    void syncManagerWorkOrdersFromServer({ force: true });
    void syncServiceRequestsFromServer({ force: true });
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
    // Owner rows + linked-property rows for co-managers with services access.
    return readManagerWorkOrderRows().filter((r) => moduleRowVisibleToPortalUser(r, userId, "services"));
  }, [userId, dataTick]);

  const serviceRequests = useMemo<ServiceRequest[]>(() => {
    void dataTick;
    if (!userId) return [];
    // Match work orders: owned manager id OR owned/linked property — not exact
    // managerUserId alone (stale/mis-stamped rows still show for property owners).
    return readAllServiceRequests().filter((r) => moduleRowVisibleToPortalUser(r, userId, "services"));
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
        const match = propertyOptions.find((p) => samePropertyId(p.id, r.propertyId));
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
    if (propertyFilter) {
      rows = rows.filter(
        (r) => samePropertyId(r.propertyId, propertyFilter) || !r.propertyId?.trim(),
      );
    }
    return rows;
  }, [serviceRequests, propertyFilter]);

  const residentUnitByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of readManagerApplicationRows()) {
      if (!applicationVisibleToPortalUser(row, userId)) continue;
      const email = row.email?.trim().toLowerCase();
      const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
      if (!email || !propertyId) continue;
      const roomLabel =
        row.manualResidentDetails?.roomNumber?.trim() ||
        getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "")
          .split(" · ")[0]
          ?.trim() ||
        "";
      if (roomLabel) map.set(`${email}|${propertyId}`, roomLabel);
    }
    return map;
  }, [userId, dataTick]);

  const resolveRequestPropertyLabel = (req: ServiceRequest) =>
    req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
      ? propertyOptions.find((p) => p.id === req.propertyId)!.label
      : "—";

  const resolveRequestUnit = (req: ServiceRequest) =>
    residentUnitByKey.get(`${req.residentEmail.trim().toLowerCase()}|${req.propertyId.trim()}`) ?? "";

  const bucketedRequests = useMemo(
    () =>
      filteredRequests
        .filter((r) => managerServiceRequestBucket(r.status) === reqBucket)
        .slice()
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [filteredRequests, reqBucket],
  );


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
    const c: Record<RequestBucket, number> = { pending: 0, approved: 0, denied: 0 };
    for (const r of filteredRequests) c[managerServiceRequestBucket(r.status)] += 1;
    return c;
  }, [filteredRequests]);
  const reqTabs = useMemo(
    () =>
      (["pending", "approved", "denied"] as const).map((id) => ({
        id,
        label: id === "pending" ? "Pending" : id === "approved" ? "Approved" : "Denied",
        count: reqCounts[id],
      })),
    [reqCounts],
  );

  const renderRequestDetail = (req: ServiceRequest) => {
    return (
      <ManagerServiceRequestDetail
        req={req}
        propertyLabel={resolveRequestPropertyLabel(req)}
        onUpdated={() => setDataTick((t) => t + 1)}
        onApproved={() => setReqBucket("approved")}
        onDenied={() => setReqBucket("denied")}
        onCollapsed={() => setExpandedId(null)}
      />
    );
  };

  return (
    <ManagerPortalPageShell
      title={typeFilter === "vendors" ? "Vendors" : "Services"}
      titleAside={
        <>
          {typeFilter === "vendors" ? (
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              onClick={() => vendorsPanelRef.current?.openSettings()}
              data-attr="manager-vendor-settings-open"
            >
              Vendor settings
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
            shallow
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
              const propertyLabel = resolveRequestPropertyLabel(req);
              const unit = resolveRequestUnit(req);
              return (
                <div key={`req-mobile-${req.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="flex w-full gap-2 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0 flex-1">
                      <PortalTableInlineExpand expanded={isExpanded} className="font-semibold text-foreground">
                        <span className="truncate">{req.offerName}</span>
                      </PortalTableInlineExpand>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[propertyLabel, unit].filter(Boolean).join(" · ")}
                      </p>
                    </div>
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
              <table className={PORTAL_DATA_TABLE}>
                <PortalDataTableColGroup percents={portalTableColumnPercents(2)} />
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property · Unit</th>
                  </tr>
                </thead>
                <tbody>
            {bucketedRequests.map((req) => {
              const id = `request-${req.id}`;
              const isExpanded = expandedId === id;
              const propertyLabel = resolveRequestPropertyLabel(req);
              const unit = resolveRequestUnit(req);
              return (
                  <Fragment key={`req-${req.id}`}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() => setExpandedId(isExpanded ? null : id))}
                      aria-expanded={isExpanded}
                    >
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        <PortalTableInlineExpand expanded={isExpanded}>{req.offerName}</PortalTableInlineExpand>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className="text-foreground">{propertyLabel}</span>
                        {unit ? <span className="text-muted"> · {unit}</span> : null}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={2} className={PORTAL_TABLE_DETAIL_CELL}>
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

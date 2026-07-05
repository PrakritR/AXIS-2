"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatPacificDate } from "@/lib/pacific-time";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalMobileSummaryCard,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PillTabs, TabNav } from "@/components/ui/tabs";
import type { DemoManagerWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  deleteManagerWorkOrderRow,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  writeManagerWorkOrderRows,
} from "@/lib/manager-work-orders-storage";
import { readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import {
  PROPERTY_PIPELINE_EVENT,
  loadResidentPropertyFromServer,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import type { ManagerListingServiceOption } from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { getPropertyById } from "@/lib/rental-application/data";
import { notifyManagerOfResidentSubmission } from "@/lib/resident-manager-notifications";
import { workOrderCategoryForResidentLabel } from "@/lib/work-order-taxonomy";
import {
  SERVICE_REQUESTS_EVENT,
  createServiceRequest,
  deleteServiceRequest,
  readServiceRequestsForResident,
  syncServiceRequestsFromServer,
  submitReturnPhoto,
  updateServiceRequest,
  hasDeposit,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";

export const STATUS_TABS: { id: ResidentWorkBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

export type RequestStatusBucket = "pending" | "approved" | "completed";

export const REQUEST_STATUS_TABS: { id: RequestStatusBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "completed", label: "Completed" },
];

/** Bucket a pill label with its count, e.g. "Open · 3" — omits the count when zero. */
export function pillLabelWithCount(label: string, count: number): string {
  return count > 0 ? `${label} ${count}` : label;
}

export type UnifiedItem =
  | { kind: "request"; req: ServiceRequest; sortKey: number }
  | { kind: "work-order"; row: DemoManagerWorkOrderRow; sortKey: number };

// Maps the resident's actual request/work-order statuses onto the shared
// Pending / Approved / Completed filter — denied and returned requests both
// read as closed-out, so they bucket under Completed alongside finished work orders.
export function unifiedItemStatusBucket(item: UnifiedItem): RequestStatusBucket {
  if (item.kind === "request") {
    if (item.req.status === "pending") return "pending";
    if (item.req.status === "approved") return "approved";
    return "completed";
  }
  if (item.row.bucket === "open") return "pending";
  if (item.row.bucket === "scheduled") return "approved";
  return "completed";
}

// Restrict photo links to http(s) or inline image data URLs before they reach an
// <a href> / <Image src> sink — inlined as a guard clause at each call site so
// CodeQL's xss-through-dom barrier recognition sees the check (see commit 924bd45
// for the same fix pattern elsewhere).
const SAFE_PHOTO_HREF_RE = /^(?:data:image\/|https?:\/\/)/;

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (x === "medium") return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-muted ring-1 ring-border";
}

export function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatPacificDate(d, { month: "short", day: "numeric", year: "numeric" });
}

export function ServiceStatusBadge({ status }: { status: ServiceRequest["status"] }) {
  if (status === "pending")
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
        Awaiting approval
      </span>
    );
  if (status === "approved")
    return (
      <span className="rounded-full portal-badge-info px-2.5 py-0.5 text-[10px] font-semibold">
        Approved
      </span>
    );
  if (status === "denied")
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
        Denied
      </span>
    );
  if (status === "returned")
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
        Return submitted
      </span>
    );
  return null;
}

const WORK_ORDER_BUCKET_LABEL: Record<ResidentWorkBucket, string> = {
  open: "Open",
  scheduled: "Scheduled",
  completed: "Completed",
};

export function WorkOrderStatusBadge({ bucket }: { bucket: ResidentWorkBucket }) {
  const cls =
    bucket === "completed"
      ? "portal-badge-success"
      : "portal-badge-info";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls} ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]`}>
      {WORK_ORDER_BUCKET_LABEL[bucket]}
    </span>
  );
}

/** "Service fee $45 · Paid · Deposit $100 · Pending" style summary for a request row. */
export function requestChargesSummary(req: ServiceRequest): string {
  const charged = req.status === "approved" || req.status === "returned";
  const parts: string[] = [];
  if (req.price) {
    parts.push(charged ? `Service fee ${req.price} · ${req.servicePaid ? "Paid" : "Pending"}` : `Service fee ${req.price}`);
  }
  if (hasDeposit(req.deposit)) {
    parts.push(charged ? `Deposit ${req.deposit} · ${req.depositPaid ? "Refunded" : "Pending"}` : `Deposit ${req.deposit}`);
  }
  return parts.join(" · ") || "—";
}

export function ServiceRequestCard({
  req,
  onReturnPhotoUploaded,
  onDelete,
  onEdit,
}: {
  req: ServiceRequest;
  onReturnPhotoUploaded: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { showToast } = useAppUi();
  const returnPhotoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const needsReturn = hasDeposit(req.deposit);
  // Show checkout procedure once service charge is paid (and item has deposit, so needs return)
  const showCheckout = req.status === "approved" && req.servicePaid && needsReturn && !req.returnPhotoDataUrl;

  async function handleReturnPhoto(files: FileList | null) {
    if (!files?.[0]) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) { showToast("Images only."); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Read error"));
        reader.readAsDataURL(file);
      });
      submitReturnPhoto(req.id, dataUrl);
      onReturnPhotoUploaded();
      showToast("Return photo submitted! Your manager will review it.");
    } catch {
      showToast("Could not upload photo.");
    } finally {
      setUploading(false);
      if (returnPhotoRef.current) returnPhotoRef.current.value = "";
    }
  }

  function removeRequest() {
    if (!window.confirm("Delete this service request? This cannot be undone.")) return;
    deleteServiceRequest(req.id);
    onDelete();
    showToast("Request deleted.");
  }

  return (
        <>
      <input
        ref={returnPhotoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => { void handleReturnPhoto(e.target.files); }}
      />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
      <ServiceStatusBadge status={req.status} />
      {req.price ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Service fee</p>
          <p className="mt-1 text-sm font-medium text-foreground">{req.price}</p>
        </>
      ) : null}
      {needsReturn ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Deposit</p>
          <p className="mt-1 text-sm font-medium text-foreground">{req.deposit}</p>
        </>
      ) : null}
      {req.returnByDate ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Return by</p>
          <p className="mt-1 text-sm font-medium text-foreground">{formatDate(req.returnByDate)}</p>
        </>
      ) : null}
      {req.offerDescription ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Description</p>
          <p className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed">{req.offerDescription}</p>
        </>
      ) : null}
      {req.notes ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Note</p>
          <p className="mt-1.5 text-sm text-muted italic">&ldquo;{req.notes}&rdquo;</p>
        </>
      ) : null}

      {/* Charges section (approved) */}
      {req.status === "approved" || req.status === "returned" ? (
        <div className="mt-3 rounded-xl bg-accent/30 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Charges</p>
          <div className="space-y-1.5">
            {req.price ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Request fee</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${req.servicePaid ? "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]" : "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"}`}>
                  {req.servicePaid ? `Paid · ${req.price}` : `Pending · ${req.price}`}
                </span>
              </div>
            ) : null}
            {needsReturn ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Deposit (refundable)</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${req.depositPaid ? "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]" : "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"}`}>
                  {req.depositPaid ? `Paid · ${req.deposit}` : `Pending · ${req.deposit}`}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Checkout procedure */}
      {showCheckout ? (
        <div className="mt-3 rounded-xl border border-border bg-accent/30 p-3">
          <p className="text-xs font-bold text-foreground">Return checklist</p>
          <ol className="mt-2 space-y-1 pl-4 text-xs text-muted list-decimal">
            <li>Clean and prepare the item for return{req.returnByDate ? ` by ${formatDate(req.returnByDate)}` : ""}.</li>
            <li>Take a clear photo showing the item&apos;s current condition.</li>
            <li>Upload the photo below — your manager will review it.</li>
            <li>Your deposit will be refunded once the return is confirmed.</li>
          </ol>
            <Button
              type="button"
              variant="outline"
              className="mt-3 rounded-full px-4 py-1.5 text-xs font-semibold"
              onClick={() => returnPhotoRef.current?.click()}
              disabled={uploading}
            >
            {uploading ? "Uploading…" : "Upload return photo"}
          </Button>
        </div>
      ) : null}

      {/* Return photo submitted */}
      {req.status === "returned" && req.returnPhotoDataUrl ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Return photo</p>
          <a href={req.returnPhotoDataUrl} target="_blank" rel="noreferrer" className="mt-2 block w-32 overflow-hidden rounded-xl border border-border">
            <Image
              src={req.returnPhotoDataUrl}
              alt="Return photo"
              width={128}
              height={96}
              className="h-24 w-full object-cover"
              unoptimized
            />
          </a>
          <p className="mt-1.5 text-xs text-muted">
            {req.depositPaid
              ? "Deposit refunded — return complete."
              : "Awaiting manager review to refund deposit."}
          </p>
        </div>
      ) : null}

      {/* Denied */}
      {req.status === "denied" ? (
        <div className="mt-3 rounded-xl border p-3 text-xs portal-banner-danger">
          {req.managerNote ? (
            <p>Manager note: <span className="font-medium">{req.managerNote}</span></p>
          ) : (
            <p>This request was not approved. Contact your property manager for details.</p>
          )}
        </div>
      ) : null}

      <PortalTableDetailActions>
        {req.status === "pending" || req.status === "approved" ? (
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-service-request-edit"
            onClick={onEdit}
          >
            Edit request
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          className={PORTAL_DETAIL_BTN}
          onClick={removeRequest}
        >
          Delete request
        </Button>
      </PortalTableDetailActions>
    </>
  );
}

export function WorkOrderDetail({
  row,
  onEdit,
  onCancel,
}: {
  row: DemoManagerWorkOrderRow;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const canModify = row.bucket === "open";
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Priority</p>
      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>{row.priority}</span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Preferred arrival</p>
      <p className="mt-1 text-sm font-medium text-foreground">{row.preferredArrival ?? "Anytime"}</p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Details</p>
      <p className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed">{row.description}</p>
      {row.scheduled && row.scheduled !== "—" ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Visit</p>
          <p className="mt-1 text-sm font-medium text-foreground">{row.scheduled}</p>
        </>
      ) : null}
      {row.cost && row.cost !== "—" ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Cost</p>
          <p className="mt-1 text-sm font-medium text-foreground">{row.cost}</p>
        </>
      ) : null}
      {row.photoDataUrls?.length ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Photos</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {row.photoDataUrls.map((src, i) => {
              const trimmed = src.trim();
              if (!SAFE_PHOTO_HREF_RE.test(trimmed)) return null;
              return (
                <a key={i} href={trimmed} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-accent/30">
                  <Image src={trimmed} alt={`Photo ${i + 1}`} width={240} height={180} className="h-28 w-full object-cover" unoptimized />
                </a>
              );
            })}
          </div>
        </>
      ) : null}
      {canModify ? (
        <PortalTableDetailActions>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-work-order-edit"
            onClick={onEdit}
          >
            Edit request
          </Button>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            onClick={onCancel}
          >
            Cancel work order
          </Button>
        </PortalTableDetailActions>
      ) : null}
    </>
  );
}

export function ResidentServicesPanel({
  tabId,
  basePath,
}: {
  tabId: "requests" | "work-orders";
  basePath: string;
}) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [bucket, setBucket] = useState<ResidentWorkBucket>("open");
  const [requestsFilter, setRequestsFilter] = useState<RequestStatusBucket>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeTab = tabId;

  // modal state
  const [modalMode, setModalMode] = useState<"none" | "maintenance" | "service">("none");

  // edit modals (resident edits their own items)
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null);
  const [eNotes, setENotes] = useState("");
  const [eReturnBy, setEReturnBy] = useState("");
  const [editingWorkOrder, setEditingWorkOrder] = useState<DemoManagerWorkOrderRow | null>(null);
  const [wTitle, setWTitle] = useState("");
  const [wPriority, setWPriority] = useState("Medium");
  const [wArrival, setWArrival] = useState("");
  const [wDetails, setWDetails] = useState("");

  // maintenance form
  const [mTitle, setMTitle] = useState("");
  const [mCategory, setMCategory] = useState("Plumbing");
  const [mPriority, setMPriority] = useState("Medium");
  const [mArrival, setMArrival] = useState("");
  const [mPhotos, setMPhotos] = useState<string[]>([]);

  // service request form
  const [selectedOffer, setSelectedOffer] = useState<ManagerListingServiceOption | null>(null);
  const [sNotes, setSNotes] = useState("");
  const [sReturnBy, setSReturnBy] = useState("");
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false);
  const [serviceSubmitting, setServiceSubmitting] = useState(false);

  const [allRows, setAllRows] = useState<DemoManagerWorkOrderRow[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [srTick, setSrTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [appTick, setAppTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);

  const residentEmail = session.email?.trim().toLowerCase() ?? "";

  function reloadServiceRequests() {
    if (!residentEmail) {
      setServiceRequests([]);
      return;
    }
    setServiceRequests(readServiceRequestsForResident(residentEmail));
  }

  // Memoize application lookup to avoid redundant scans
  const residentApplication = useMemo(() => {
    void allRows;
    void appTick;
    if (!residentEmail) return null;
    return readManagerApplicationRows().find(
      (r) => r.email?.trim().toLowerCase() === residentEmail,
    ) ?? null;
  }, [residentEmail, allRows, appTick]);

  // Memoize offer loading based on resident application data
  const offersForResident = useMemo(() => {
    void propertyTick;
    if (!residentApplication) return [];
    const propertyId =
      residentApplication.assignedPropertyId?.trim() ||
      residentApplication.propertyId?.trim() ||
      residentApplication.application?.propertyId?.trim() ||
      "";
    let managerUserId = residentApplication.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }

    const visibleToResident = (o: { available: boolean; residentEmails?: string[] }) => {
      if (!o.available) return false;
      if (!o.residentEmails?.length) return true;
      return o.residentEmails.some((e) => e.trim().toLowerCase() === residentEmail);
    };

    if (!propertyId) return [];

    if (!managerUserId) return [];
    const property = getPropertyById(propertyId);
    if (!property?.listingSubmission || property.listingSubmission.v !== 1) return [];
    const options = normalizeManagerListingSubmissionV1(property.listingSubmission).serviceRequestOptions ?? [];
    return options.filter(visibleToResident);
  }, [propertyTick, residentApplication, residentEmail]);

  const availableOffers = offersForResident;

  // Initial data sync — fire syncs sequentially to avoid overwhelming the server/browser
  useEffect(() => {
    const sync = () => setAllRows(readManagerWorkOrderRows());
    const onProperty = () => setPropertyTick((t) => t + 1);
    queueMicrotask(() => sync());
    void syncManagerWorkOrdersFromServer()
      .then(sync)
      .then(() => syncManagerApplicationsFromServer())
      .then(() => setAppTick((t) => t + 1))
      .then(() => syncPropertyPipelineFromServer())
      .then(() => setPropertyTick((t) => t + 1))
      .then(() => syncLeasePipelineFromServer())
      // The resident/admin-scoped sync above never returns a resident's own
      // property (it's scoped to properties the caller manages), so hydrate
      // it separately — needed for e.g. manager-offered service requests.
      .then(() => loadResidentPropertyFromServer())
      .then(() => setPropertyTick((t) => t + 1));
    
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProperty);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProperty);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => reloadServiceRequests());
    void syncServiceRequestsFromServer();
    const onSr = () => setSrTick((t) => t + 1);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    return () => {
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentEmail]);

  useEffect(() => {
    const onLease = () => setLeaseTick((t) => t + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => reloadServiceRequests());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srTick]);

  // Only show maintenance work orders (not old service type rows)
  const myRows = useMemo(() => {
    if (!residentEmail) return [];
    return allRows.filter(
      (r) =>
        r.residentEmail?.trim().toLowerCase() === residentEmail &&
        (r as DemoManagerWorkOrderRow & { requestType?: string }).requestType !== "service",
    );
  }, [allRows, residentEmail]);

  const rows = useMemo(() => myRows.filter((r) => r.bucket === bucket), [myRows, bucket]);

  const counts = useMemo(() => {
    const c: Record<ResidentWorkBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of myRows) c[r.bucket] += 1;
    return c;
  }, [myRows]);

  const statusTabs = useMemo(
    () => STATUS_TABS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  // Unified Services list: the resident's service requests AND maintenance
  // work orders together, labeled by type, newest first.
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    for (const req of serviceRequests) {
      const t = new Date(req.requestedAt).getTime();
      items.push({ kind: "request", req, sortKey: Number.isFinite(t) ? t : 0 });
    }
    for (const row of myRows) {
      // Resident work order ids are `REQ-<timestamp>`; fall back to the scheduled time.
      const fromId = Number(row.id.replace(/^\D*/, ""));
      const fromSchedule = row.scheduledAtIso ? new Date(row.scheduledAtIso).getTime() : 0;
      const t = Number.isFinite(fromId) && fromId > 0 ? fromId : fromSchedule;
      items.push({ kind: "work-order", row, sortKey: Number.isFinite(t) ? t : 0 });
    }
    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
  }, [serviceRequests, myRows]);

  const requestsCounts = useMemo(() => {
    const c: Record<RequestStatusBucket, number> = { pending: 0, approved: 0, completed: 0 };
    for (const item of unifiedItems) c[unifiedItemStatusBucket(item)] += 1;
    return c;
  }, [unifiedItems]);

  const filteredUnifiedItems = useMemo(
    () => unifiedItems.filter((item) => unifiedItemStatusBucket(item) === requestsFilter),
    [unifiedItems, requestsFilter],
  );

  function openRequestEdit(req: ServiceRequest) {
    setEditingRequest(req);
    setENotes(req.notes);
    setEReturnBy(req.returnByDate);
  }

  function saveRequestEdit() {
    if (!editingRequest) return;
    if (hasDeposit(editingRequest.deposit) && !eReturnBy.trim()) {
      showToast("Please enter a return-by date.");
      return;
    }
    updateServiceRequest(editingRequest.id, {
      notes: eNotes.trim(),
      returnByDate: eReturnBy.trim(),
    });
    setEditingRequest(null);
    reloadServiceRequests();
    showToast("Request updated.");
  }

  function openWorkOrderEdit(row: DemoManagerWorkOrderRow) {
    setEditingWorkOrder(row);
    setWTitle(row.title);
    setWPriority(row.priority || "Medium");
    setWArrival(row.preferredArrival && row.preferredArrival !== "Anytime" ? row.preferredArrival : "");
    setWDetails(row.description);
  }

  function saveWorkOrderEdit() {
    if (!editingWorkOrder) return;
    if (!wTitle.trim()) {
      showToast("Add a title first.");
      return;
    }
    updateManagerWorkOrder(editingWorkOrder.id, (r) => ({
      ...r,
      title: wTitle.trim(),
      priority: wPriority,
      preferredArrival: wArrival.trim() || "Anytime",
      description: wDetails.trim() || r.description,
    }));
    setAllRows(readManagerWorkOrderRows());
    setEditingWorkOrder(null);
    showToast("Work order updated.");
  }

  function cancelWorkOrder(id: string) {
    if (!window.confirm("Cancel this work order? This cannot be undone.")) return;
    deleteManagerWorkOrderRow(id);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(null);
    showToast("Work order removed.");
  }

  const residentLeaseRow = useMemo(() => {
    void leaseTick;
    if (!residentEmail) return null;
    return findLeaseForResidentEmail(residentEmail);
  }, [leaseTick, residentEmail]);

  const servicesUnlocked = Boolean(residentLeaseRow && hasBothLeaseSignatures(residentLeaseRow));

  if (!servicesUnlocked && modalMode !== "none") {
    setModalMode("none");
  }

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const onPickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 6 - mPhotos.length;
    if (remaining <= 0) { showToast("Up to 6 photos."); return; }
    const next = [...mPhotos];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file) continue;
      if (!file.type.startsWith("image/")) { showToast("Images only."); return; }
      next.push(await fileToDataUrl(file));
    }
    setMPhotos(next);
  };

  const resetMaintenance = () => {
    setMTitle(""); setMCategory("Plumbing"); setMPriority("Medium"); setMArrival(""); setMPhotos([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };
  const resetService = () => { setSelectedOffer(null); setSNotes(""); setSReturnBy(""); };

  function getApplication() {
    return residentApplication || readManagerApplicationRows().find((r) => r.email?.trim().toLowerCase() === residentEmail);
  }

  const submitMaintenance = async () => {
    if (maintenanceSubmitting) return;
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!mTitle.trim()) { showToast("Add a title first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    setMaintenanceSubmitting(true);
    try {
    const application = getApplication();
    const propertyId =
      application?.assignedPropertyId?.trim() ||
      application?.propertyId?.trim() ||
      application?.application?.propertyId?.trim() ||
      "";
    let managerUserId = application?.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }
    if (!managerUserId) {
      showToast("Could not find your property manager. Contact support.");
      return;
    }
    const propertyLabel =
      application?.property ||
      getPropertyById(propertyId)?.address.split(",")[0]?.trim() ||
      "Assigned house";
    const row: DemoManagerWorkOrderRow & { requestType: string } = {
      id: `REQ-${Date.now()}`,
      requestType: "maintenance",
      propertyName: propertyLabel,
      propertyId,
      assignedPropertyId: application?.assignedPropertyId,
      assignedRoomChoice: application?.assignedRoomChoice || application?.application?.roomChoice1,
      managerUserId,
      unit: application?.assignedRoomChoice || application?.application?.roomChoice1 || "—",
      title: mTitle.trim(),
      priority: mPriority,
      status: "Submitted",
      bucket: "open",
      category: workOrderCategoryForResidentLabel(mCategory),
      description: `${mCategory}: Your request is logged. Maintenance will review and update this thread.`,
      scheduled: "—",
      cost: "—",
      preferredArrival: mArrival.trim() || "Anytime",
      residentName: application?.name,
      residentEmail,
      photoDataUrls: mPhotos,
    };
    writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(row.id);
    const notifyResult = await notifyManagerOfResidentSubmission({
      managerUserId,
      residentName: application?.name || residentEmail,
      residentEmail,
      propertyName: propertyLabel,
      propertyId,
      title: row.title,
      kind: "work-order",
      details: [
        `Request ID: ${row.id}`,
        `Category: ${mCategory}`,
        `Priority: ${mPriority}`,
        `Preferred arrival: ${row.preferredArrival ?? "Anytime"}`,
        `Details: ${row.description}`,
        mPhotos.length > 0 ? `Attached photos: ${mPhotos.length}` : "",
      ],
    });
    showToast("Maintenance request submitted.");
    if (!notifyResult.ok) {
      showToast("Request submitted, but manager notification could not be sent.");
    }
    resetMaintenance();
    setModalMode("none");
    } finally {
      setMaintenanceSubmitting(false);
    }
  };

  const submitService = async () => {
    if (serviceSubmitting) return;
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!selectedOffer) { showToast("Select a service first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    if (hasDeposit(selectedOffer.deposit) && !sReturnBy.trim()) {
      showToast("Please enter a return-by date.");
      return;
    }
    setServiceSubmitting(true);
    try {
    const application = getApplication();
    const propertyId =
      application?.assignedPropertyId?.trim() ||
      application?.propertyId?.trim() ||
      application?.application?.propertyId?.trim() ||
      "";
    if (!propertyId) {
      showToast("No property assignment found. Contact support.");
      return;
    }
    const currentOffer = availableOffers.find((offer) => offer.id === selectedOffer.id) ?? null;
    if (!currentOffer) {
      showToast("That request option is no longer available. Please choose another.");
      setSelectedOffer(null);
      return;
    }
    // Resolve managerUserId — try application row, then property, then the selected offer's own field
    let managerUserId = application?.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }
    if (!managerUserId) { showToast("Could not find your property manager. Contact support."); return; }
    const createdRequest = createServiceRequest({
      offerId: currentOffer.id,
      offerName: currentOffer.name,
      offerDescription: currentOffer.description,
      price: currentOffer.price,
      deposit: currentOffer.deposit,
      residentEmail,
      residentName: application?.name || residentEmail,
      managerUserId,
      propertyId,
      returnByDate: sReturnBy.trim(),
      notes: sNotes.trim(),
    });
    const propertyLabel =
      application?.property ||
      getPropertyById(propertyId)?.address.split(",")[0]?.trim() ||
      "Assigned house";
    const notifyResult = await notifyManagerOfResidentSubmission({
      managerUserId,
      residentName: application?.name || residentEmail,
      residentEmail,
      propertyName: propertyLabel,
      propertyId,
      title: currentOffer.name,
      kind: "service-request",
      details: [
        `Request ID: ${createdRequest.id}`,
        `Offer: ${currentOffer.name}`,
        currentOffer.description ? `Offer details: ${currentOffer.description}` : "",
        currentOffer.price ? `Price: ${currentOffer.price}` : "",
        hasDeposit(currentOffer.deposit) ? `Deposit: ${currentOffer.deposit}` : "",
        sReturnBy.trim() ? `Return by: ${sReturnBy.trim()}` : "",
        sNotes.trim() ? `Resident notes: ${sNotes.trim()}` : "",
      ],
    });
    showToast(`${currentOffer.name} requested — awaiting manager approval.`);
    if (!notifyResult.ok) {
      showToast("Request submitted, but manager notification could not be sent.");
    }
    resetService();
    setModalMode("none");
    reloadServiceRequests();
    } finally {
      setServiceSubmitting(false);
    }
  };

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        activeTab === "work-orders" ? (
          <Button
            type="button"
            className={`rounded-full ${PORTAL_HEADER_ACTION_BTN}`}
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setModalMode("maintenance");
            }}
          >
            Report
          </Button>
        ) : (
          <Button
            type="button"
            className={`rounded-full ${PORTAL_HEADER_ACTION_BTN}`}
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setModalMode("service");
            }}
          >
            Submit request
          </Button>
        )
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav
            activeId={activeTab}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests` },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders` },
            ]}
          />
        </ManagerPortalFilterRow>
      }
    >
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onPickPhotos(e.target.files); }} />

      {!servicesUnlocked ? (
        <div className="glass-card mb-4 rounded-2xl px-4 py-4 text-sm text-muted [html[data-native]_&]:hidden">
          <p className="font-medium text-foreground">Services unlock after your lease is fully signed</p>
          <p className="mt-1">Maintenance and service requests become available once you and your manager have both signed.</p>
        </div>
      ) : null}

      {activeTab === "requests" ? (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <PillTabs
              items={REQUEST_STATUS_TABS.map(({ id, label }) => ({
                id,
                label: pillLabelWithCount(label, requestsCounts[id]),
              }))}
              activeId={requestsFilter}
              onChange={(id) => setRequestsFilter(id as RequestStatusBucket)}
            />
          </div>

          {unifiedItems.length === 0 ? (
            <PortalDataTableEmpty message="No service requests or work orders yet." icon="service" />
          ) : filteredUnifiedItems.length === 0 ? (
            <PortalDataTableEmpty message="No requests in this status yet." icon="service" />
          ) : (
        <>
        <div className="space-y-2 lg:hidden">
          {filteredUnifiedItems.map((item) => {
            const rowId = item.kind === "request" ? `request-${item.req.id}` : `work-order-${item.row.id}`;
            const expanded = expandedId === rowId;
            const title = item.kind === "request" ? item.req.offerName : item.row.title;
            const typeLabel = item.kind === "request" ? "Request" : "Work order";
            const chargesSummary =
              item.kind === "request"
                ? requestChargesSummary(item.req)
                : item.row.cost && item.row.cost !== "—"
                  ? item.row.cost
                  : "—";
            const returnBy =
              item.kind === "request" && item.req.returnByDate ? formatDate(item.req.returnByDate) : null;
            const badge =
              item.kind === "request" ? (
                <ServiceStatusBadge status={item.req.status} />
              ) : (
                <WorkOrderStatusBadge bucket={item.row.bucket} />
              );
            return (
              <PortalMobileSummaryCard
                key={rowId}
                title={title}
                subtitle={`${typeLabel} · ${chargesSummary}`}
                meta={returnBy ? `Return by ${returnBy}` : undefined}
                badge={badge}
                expanded={expanded}
                onClick={() => setExpandedId((c) => (c === rowId ? null : rowId))}
              >
                {expanded ? (
                  item.kind === "request" ? (
                    <ServiceRequestCard
                      req={item.req}
                      onReturnPhotoUploaded={reloadServiceRequests}
                      onDelete={reloadServiceRequests}
                      onEdit={() => openRequestEdit(item.req)}
                    />
                  ) : (
                    <WorkOrderDetail
                      row={item.row}
                      onEdit={() => openWorkOrderEdit(item.row)}
                      onCancel={() => cancelWorkOrder(item.row.id)}
                    />
                  )
                ) : null}
              </PortalMobileSummaryCard>
            );
          })}
        </div>
        <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="min-w-[860px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Item</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Charges</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Return by</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnifiedItems.map((item) => {
                    if (item.kind === "request") {
                      const req = item.req;
                      const rowId = `request-${req.id}`;
                      return (
                        <Fragment key={rowId}>
                          <tr
                            className={PORTAL_TABLE_TR_EXPANDABLE}
                            onClick={createPortalRowExpandClick(() =>
                              setExpandedId((c) => (c === rowId ? null : rowId)),
                            )}
                            aria-expanded={expandedId === rowId}
                          >
                            <td className={`${PORTAL_TABLE_TD} text-muted`}>Request</td>
                            <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{req.offerName}</td>
                            <td className={PORTAL_TABLE_TD}>
                              <ServiceStatusBadge status={req.status} />
                            </td>
                            <td className={PORTAL_TABLE_TD}>{requestChargesSummary(req)}</td>
                            <td className={PORTAL_TABLE_TD}>{req.returnByDate ? formatDate(req.returnByDate) : "—"}</td>
                          </tr>
                          {expandedId === rowId ? (
                            <tr className={PORTAL_TABLE_DETAIL_ROW}>
                              <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                                <ServiceRequestCard
                                  req={req}
                                  onReturnPhotoUploaded={reloadServiceRequests}
                                  onDelete={reloadServiceRequests}
                                  onEdit={() => openRequestEdit(req)}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    }
                    const row = item.row;
                    const rowId = `work-order-${row.id}`;
                    return (
                      <Fragment key={rowId}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedId((c) => (c === rowId ? null : rowId)),
                          )}
                          aria-expanded={expandedId === rowId}
                        >
                          <td className={`${PORTAL_TABLE_TD} text-muted`}>Work order</td>
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                          <td className={PORTAL_TABLE_TD}>
                            <WorkOrderStatusBadge bucket={row.bucket} />
                          </td>
                          <td className={PORTAL_TABLE_TD}>{row.cost && row.cost !== "—" ? row.cost : "—"}</td>
                          <td className={PORTAL_TABLE_TD}>—</td>
                        </tr>
                        {expandedId === rowId ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={5} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                              <WorkOrderDetail
                                row={row}
                                onEdit={() => openWorkOrderEdit(row)}
                                onCancel={() => cancelWorkOrder(row.id)}
                              />
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
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Work orders</p>
            <PillTabs
              items={statusTabs.map(({ id, label, count }) => ({ id, label: pillLabelWithCount(label, count) }))}
              activeId={bucket}
              onChange={(id) => setBucket(id as ResidentWorkBucket)}
            />
          </div>

          {rows.length === 0 ? (
            <PortalDataTableEmpty
              icon="work-order"
              message={
                myRows.length === 0 ? "No work orders yet." : "No work orders in this status yet."
              }
            />
          ) : (
            <>
            <div className="space-y-2 lg:hidden">
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <PortalMobileSummaryCard
                    key={row.id}
                    title={row.title}
                    subtitle={row.id}
                    badge={<WorkOrderStatusBadge bucket={row.bucket} />}
                    expanded={expanded}
                    onClick={() => setExpandedId((c) => (c === row.id ? null : row.id))}
                  >
                    {expanded ? (
                      <WorkOrderDetail
                        row={row}
                        onEdit={() => openWorkOrderEdit(row)}
                        onCancel={() => cancelWorkOrder(row.id)}
                      />
                    ) : null}
                  </PortalMobileSummaryCard>
                );
              })}
            </div>
            <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="min-w-[700px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedId((c) => (c === row.id ? null : row.id)),
                          )}
                          aria-expanded={expandedId === row.id}
                        >
                          <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-muted`}>{row.id}</td>
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                          <td className={PORTAL_TABLE_TD}>{row.status}</td>
                        </tr>
                        {expandedId === row.id ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={3} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                              <WorkOrderDetail
                                row={row}
                                onEdit={() => openWorkOrderEdit(row)}
                                onCancel={() => cancelWorkOrder(row.id)}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* Maintenance modal */}
      <Modal
        open={modalMode === "maintenance"}
        title="Report maintenance"
        onClose={() => { setModalMode("none"); resetMaintenance(); }}
        panelClassName="max-w-lg"
      >
        <p className="text-xs text-muted">Describe the issue — your property manager will be notified.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Title</p>
            <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Category</p>
              <Select value={mCategory} onChange={(e) => setMCategory(e.target.value)} className="bg-card">
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>HVAC</option>
                <option>Appliance</option>
                <option>Access / Locks</option>
                <option>General</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Priority</p>
              <Select value={mPriority} onChange={(e) => setMPriority(e.target.value)} className="bg-card">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Preferred arrival time</p>
            <Input value={mArrival} onChange={(e) => setMArrival(e.target.value)} placeholder='e.g. Weekdays after 5pm — or "anytime"' className="bg-card" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Photos (up to 6)</p>
            <Button type="button" variant="outline" className="w-fit rounded-full text-xs" onClick={() => photoInputRef.current?.click()}>
              Attach photos
            </Button>
          </div>
          {mPhotos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mPhotos.map((src, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-border bg-accent/30">
                  <Image src={src} alt={`Photo ${i + 1}`} width={240} height={180} className="h-24 w-full object-cover" unoptimized />
                  <div className="flex justify-start p-2">
                    <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={() => setMPhotos((p) => p.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { setModalMode("none"); resetMaintenance(); }}>Cancel</Button>
          <Button type="button" className="rounded-full" onClick={() => { void submitMaintenance(); }} disabled={maintenanceSubmitting}>
            {maintenanceSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </Modal>

      {/* Request modal */}
      <Modal
        open={modalMode === "service"}
        title="Submit request"
        onClose={() => { setModalMode("none"); resetService(); }}
        panelClassName="max-w-lg"
      >
        {availableOffers.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-muted">No request options available yet</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted">Select a request option from your manager&apos;s catalog. If a deposit is required, you&apos;ll also need to set a return date.</p>
            <div className="mt-4 space-y-2">
              {availableOffers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => { setSelectedOffer((cur) => (cur?.id === offer.id ? null : offer)); setSReturnBy(""); }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedOffer?.id === offer.id
                      ? "border-primary/30 bg-accent/30 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-border hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{offer.name}</p>
                      {offer.description ? <p className="mt-1 text-xs leading-relaxed text-muted">{offer.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {offer.price ? (
                        <span className="rounded-full bg-accent/30 px-2.5 py-0.5 text-xs font-semibold text-muted">{offer.price}</span>
                      ) : null}
                      {hasDeposit(offer.deposit) ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Deposit {offer.deposit}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedOffer ? (
              <div className="mt-4 space-y-3">
                {hasDeposit(selectedOffer.deposit) ? (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted">
                      Return by date <span className="text-rose-500">*</span>
                    </p>
                    <Input
                      type="date"
                      value={sReturnBy}
                      onChange={(e) => setSReturnBy(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="bg-card"
                    />
                    <p className="mt-1 text-[10px] text-muted">Required — your deposit is held until the item is returned.</p>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">Additional notes (optional)</p>
                  <Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Preferred timing, special instructions…" className="bg-card" />
                </div>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { setModalMode("none"); resetService(); }}>Cancel</Button>
          {availableOffers.length > 0 ? (
            <Button type="button" className="rounded-full" onClick={() => { void submitService(); }} disabled={!selectedOffer || serviceSubmitting}>
              {serviceSubmitting ? "Sending…" : "Send request"}
            </Button>
          ) : null}
        </div>
      </Modal>

      {/* Edit service request modal */}
      <Modal
        open={editingRequest !== null}
        title="Edit request"
        onClose={() => setEditingRequest(null)}
        panelClassName="max-w-lg"
      >
        {editingRequest ? (
          <>
            <p className="text-xs text-muted">
              Update the details of your <span className="font-semibold text-foreground">{editingRequest.offerName}</span> request.
              Pricing is set by your manager and can&apos;t be changed here.
            </p>
            <div className="mt-4 grid gap-3">
              {hasDeposit(editingRequest.deposit) ? (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">
                    Return by date <span className="text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={eReturnBy}
                    onChange={(e) => setEReturnBy(e.target.value)}
                    className="bg-card"
                  />
                  <p className="mt-1 text-[10px] text-muted">Required — your deposit is held until the item is returned.</p>
                </div>
              ) : null}
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Notes</p>
                <Textarea
                  value={eNotes}
                  onChange={(e) => setENotes(e.target.value)}
                  placeholder="Preferred timing, special instructions…"
                  rows={3}
                  className="bg-card"
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditingRequest(null)}>Cancel</Button>
          <Button type="button" className="rounded-full" data-attr="resident-service-request-edit-save" onClick={saveRequestEdit}>
            Save changes
          </Button>
        </div>
      </Modal>

      {/* Edit work order modal */}
      <Modal
        open={editingWorkOrder !== null}
        title="Edit work order"
        onClose={() => setEditingWorkOrder(null)}
        panelClassName="max-w-lg"
      >
        <p className="text-xs text-muted">Update your maintenance request — your property manager sees these changes.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Title</p>
            <Input value={wTitle} onChange={(e) => setWTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Priority</p>
              <Select value={wPriority} onChange={(e) => setWPriority(e.target.value)} className="bg-card">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Preferred arrival time</p>
              <Input value={wArrival} onChange={(e) => setWArrival(e.target.value)} placeholder='e.g. Weekdays after 5pm — or "anytime"' className="bg-card" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Details</p>
            <Textarea
              value={wDetails}
              onChange={(e) => setWDetails(e.target.value)}
              placeholder="Describe the issue"
              rows={4}
              className="bg-card"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditingWorkOrder(null)}>Cancel</Button>
          <Button type="button" className="rounded-full" data-attr="resident-work-order-edit-save" onClick={saveWorkOrderEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}

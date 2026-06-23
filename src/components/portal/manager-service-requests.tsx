"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { formatPacificDate } from "@/lib/pacific-time";
import {
  SERVICE_REQUESTS_EVENT,
  approveServiceRequest,
  denyServiceRequest,
  deleteServiceRequest,
  markServiceRequestServicePaid,
  markServiceRequestDepositPaid,
  readServiceRequestsForManager,
  hasDeposit,
  type ServiceRequest,
  type ServiceRequestStatus,
} from "@/lib/service-requests-storage";

type FilterTab = "pending" | "approved" | "returned" | "denied" | "all";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "returned", label: "Returned" },
  { id: "denied", label: "Denied" },
  { id: "all", label: "All" },
];

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatPacificDate(d, { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: ServiceRequestStatus }) {
  const map: Record<ServiceRequestStatus, string> = {
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-violet-50 text-violet-700 ring-violet-200",
    denied: "bg-rose-50 text-rose-700 ring-rose-200",
    returned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  const label: Record<ServiceRequestStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    denied: "Denied",
    returned: "Return submitted",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function ServiceRequestCard({
  req,
  onAction,
}: {
  req: ServiceRequest;
  onAction: () => void;
}) {
  const { showToast } = useAppUi();
  const [denyNote, setDenyNote] = useState("");
  const [showDenyInput, setShowDenyInput] = useState(false);

  const needsReturn = hasDeposit(req.deposit);

  function approve() {
    approveServiceRequest(req.id);
    onAction();
    showToast(`Approved "${req.offerName}" for ${req.residentName}.`);
  }

  function deny() {
    if (!showDenyInput) { setShowDenyInput(true); return; }
    denyServiceRequest(req.id, denyNote);
    setShowDenyInput(false);
    setDenyNote("");
    onAction();
    showToast("Request denied.");
  }

  function markServicePaid() {
    markServiceRequestServicePaid(req.id);
    onAction();
    showToast("Service charge marked as paid.");
  }

  function markDepositPaid() {
    markServiceRequestDepositPaid(req.id);
    onAction();
    showToast("Deposit marked as paid.");
  }

  function removeRequest() {
    if (!window.confirm("Delete this request? This cannot be undone.")) return;
    deleteServiceRequest(req.id);
    onAction();
    showToast("Request deleted.");
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{req.offerName}</p>
          <p className="mt-0.5 text-xs text-muted">{req.residentName} · {req.residentEmail}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* Badges */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {req.price ? (
          <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted">{req.price}</span>
        ) : null}
        {needsReturn ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">Deposit {req.deposit}</span>
        ) : null}
        {req.returnByDate ? (
          <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted ring-1 ring-border">
            Return by {formatDate(req.returnByDate)}
          </span>
        ) : null}
        <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted ring-1 ring-border">
          Requested {formatDate(req.requestedAt)}
        </span>
      </div>

      {req.offerDescription ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">{req.offerDescription}</p>
      ) : null}
      {req.notes ? (
        <p className="mt-1 text-xs text-muted italic">&ldquo;{req.notes}&rdquo;</p>
      ) : null}

      {/* Charges (approved) */}
      {(req.status === "approved" || req.status === "returned") ? (
        <div className="mt-3 rounded-xl bg-accent/30 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Charges</p>
          <div className="space-y-2">
            {req.price ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Service fee · {req.price}</span>
                {req.servicePaid ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Paid</span>
                ) : (
                  <Button type="button" className="h-6 rounded-full px-2.5 text-[10px] font-semibold" onClick={markServicePaid}>
                    Mark paid
                  </Button>
                )}
              </div>
            ) : null}
            {needsReturn ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Deposit · {req.deposit}</span>
                {req.depositPaid ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Refunded</span>
                ) : (
                  <Button type="button" className="h-6 rounded-full px-2.5 text-[10px] font-semibold" onClick={markDepositPaid}>
                    Mark refunded
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          {req.servicePaid && needsReturn && !req.returnPhotoDataUrl ? (
            <p className="mt-2 text-[10px] text-violet-600">Resident has been shown the return checklist.</p>
          ) : null}
        </div>
      ) : null}

      {/* Return photo */}
      {req.returnPhotoDataUrl ? (
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
          {req.returnedAt ? (
            <p className="mt-1 text-[10px] text-muted">Submitted {formatDate(req.returnedAt)}</p>
          ) : null}
        </div>
      ) : null}

      {/* Manager note (denied) */}
      {req.status === "denied" && req.managerNote ? (
        <p className="mt-2 text-xs text-rose-600">Note: {req.managerNote}</p>
      ) : null}

      {/* Actions */}
      {req.status === "pending" ? (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {showDenyInput ? (
            <div>
              <input
                type="text"
                value={denyNote}
                onChange={(e) => setDenyNote(e.target.value)}
                placeholder="Reason for denial (optional)"
                className="w-full rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-100"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700" onClick={approve}>
              Approve
            </Button>
            <Button type="button" variant="outline" className="rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={deny}>
              {showDenyInput ? "Confirm deny" : "Deny"}
            </Button>
            {showDenyInput ? (
              <Button type="button" variant="outline" className="rounded-full px-4 text-xs" onClick={() => { setShowDenyInput(false); setDenyNote(""); }}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          onClick={removeRequest}
        >
          Delete request
        </Button>
      </div>
    </div>
  );
}

export function ManagerServiceRequests() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [filterTab, setFilterTab] = useState<FilterTab>("pending");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [propertyTick, setPropertyTick] = useState(0);
  const [tick, setTick] = useState(0);

  void showToast; // keep reference for future use

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
  }, [authReady, userId]);

  useEffect(() => {
    const onEvent = () => setTick((t) => t + 1);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onEvent);
    window.addEventListener("storage", onEvent);
    return () => {
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onEvent);
      window.removeEventListener("storage", onEvent);
    };
  }, []);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  const allRequests = useMemo(() => {
    void tick;
    if (!userId) return [];
    return readServiceRequestsForManager(userId);
  }, [userId, tick]);

  const filteredByProperty = useMemo(() => {
    if (!propertyFilter.trim()) return allRequests;
    return allRequests.filter((r) => r.propertyId === propertyFilter);
  }, [allRequests, propertyFilter]);

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = { pending: 0, approved: 0, returned: 0, denied: 0, all: filteredByProperty.length };
    for (const r of filteredByProperty) {
      if (r.status in c) c[r.status as FilterTab] += 1;
    }
    return c;
  }, [filteredByProperty]);

  const visible = useMemo(() => {
    if (filterTab === "all") return filteredByProperty;
    return filteredByProperty.filter((r) => r.status === filterTab);
  }, [filteredByProperty, filterTab]);

  return (
    <div className="mt-1">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {propertyOptions.length > 1 ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted">Property</label>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All properties</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filterTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent/30 text-muted hover:bg-accent/40"
              }`}
            >
              {tab.label}
              {counts[tab.id] > 0 ? ` · ${counts[tab.id]}` : ""}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-accent/30 py-16 text-center">
          <p className="text-sm font-medium text-muted">No service requests</p>
          <p className="mt-1 text-xs text-muted">
            {filterTab === "pending"
              ? "No pending requests — residents haven't submitted any yet."
              : "No requests in this category."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((req) => (
            <ServiceRequestCard
              key={req.id}
              req={req}
              onAction={() => setTick((t) => t + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PROPERTY_PIPELINE_EVENT,
  approvePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  adminKpiCounts,
  approveFromRequestChange,
  declineFromRequestChange,
  listAdminRow,
  moveListedToRejected,
  moveListedToRequestChange,
  movePendingToRejected,
  movePendingToRequestChange,
  moveUnlistedToRejected,
  readAdminPropertyRows,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";

const KPI_LABELS = [
  "Pending review",
  "Request change",
  "Listed",
  "Unlisted",
  "Rejected",
] as const;

const EMPTY_COPY: Record<AdminPropertyBucketIndex, string> = {
  0: "No properties awaiting review.",
  1: "No properties awaiting edits.",
  2: "No listed properties.",
  3: "No unlisted properties.",
  4: "No rejected properties.",
};

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "amber" | "slate" | "rose";
}) {
  const styles = {
    green: "border-emerald-200/90 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200/90 bg-amber-50 text-amber-950",
    slate: "border-slate-200/90 bg-slate-50 text-slate-700",
    rose: "border-rose-200/90 bg-rose-50 text-rose-900",
  } as const;
  const dot = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
    rose: "bg-rose-500",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[variant]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function rowStatus(bucket: AdminPropertyBucketIndex): { label: string; variant: "green" | "amber" | "slate" | "rose" } {
  switch (bucket) {
    case 0:
      return { label: "Pending review", variant: "amber" };
    case 1:
      return { label: "Changes requested", variant: "amber" };
    case 2:
      return { label: "Listed", variant: "green" };
    case 3:
      return { label: "Unlisted", variant: "slate" };
    default:
      return { label: "Rejected", variant: "rose" };
  }
}

function PropertyDetailSheet({
  open,
  onClose,
  bucket,
  row,
  onUpdated,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  if (!open || !row) return null;

  const listingId = row.listingId;

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200/90 bg-white shadow-[0_0_48px_-12px_rgba(15,23,42,0.2)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-prop-detail-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="admin-prop-detail-title" className="text-lg font-semibold text-slate-900">
            Property details
          </h2>
          <Button type="button" variant="ghost" className="rounded-full px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-base font-semibold text-slate-900">
              {row.buildingName} · {row.unitLabel}
            </p>
            <p className="mt-1 text-sm text-slate-500">{row.address}</p>
            <p className="mt-2 text-xs text-slate-500">
              {row.neighborhood} · ZIP {row.zip} · {row.beds} bd / {row.baths} ba ·{" "}
              {row.petFriendly ? "Pet-friendly" : "No pets"}
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-800">${row.monthlyRent}/month</p>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Actions</p>
          <div className="flex flex-col gap-2">
            {bucket === 0 ? (
              <>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => {
                    const created = approvePendingManagerProperty(row.adminRefId);
                    run(
                      created ? `Approved and listed: ${created.title}` : "Approved.",
                      Boolean(created),
                    );
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => run("Moved to request change.", movePendingToRequestChange(row.adminRefId))}
                >
                  Request edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                  onClick={() => run("Declined submission.", movePendingToRejected(row.adminRefId))}
                >
                  Decline
                </Button>
              </>
            ) : null}

            {bucket === 1 ? (
              <>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => run("Published listing.", approveFromRequestChange(row.adminRefId))}
                >
                  Approve &amp; list
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => run("Returned to pending review.", returnRequestChangeToPending(row.adminRefId))}
                >
                  Move to pending review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                  onClick={() => run("Declined.", declineFromRequestChange(row.adminRefId))}
                >
                  Decline
                </Button>
              </>
            ) : null}

            {bucket === 2 && listingId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => run("Unlisted property.", unlistManagerListing(listingId))}
                >
                  Unlist
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => run("Moved to request change.", moveListedToRequestChange(listingId))}
                >
                  Request edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                  onClick={() => run("Rejected listing.", moveListedToRejected(listingId))}
                >
                  Decline
                </Button>
              </>
            ) : null}

            {bucket === 3 ? (
              <>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => {
                    const id = listAdminRow(row);
                    run(id ? "Property listed." : "Could not list property.", Boolean(id));
                  }}
                >
                  List
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                  onClick={() => run("Moved to rejected.", moveUnlistedToRejected(row.adminRefId))}
                >
                  Decline
                </Button>
              </>
            ) : null}

            {bucket === 4 ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => run("Restored to pending review.", restoreRejectedToPending(row.adminRefId))}
              >
                Move to pending review
              </Button>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}

export function AdminPropertiesClient() {
  const { showToast } = useAppUi();
  const [activeKpi, setActiveKpi] = useState<AdminPropertyBucketIndex>(0);
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState<AdminPropertyRow | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed property queue.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const kpiValues = useMemo(() => adminKpiCounts(), [tick]);
  const rows = useMemo(() => readAdminPropertyRows(activeKpi), [tick, activeKpi]);
  const status = rowStatus(activeKpi);

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Properties</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {KPI_LABELS.map((label, i) => {
          const idx = i as AdminPropertyBucketIndex;
          const active = idx === activeKpi;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setActiveKpi(idx)}
              className={`min-w-[7.5rem] rounded-2xl border px-4 py-3 text-left transition ${
                active
                  ? "border-slate-200/90 border-b-[3px] border-b-primary bg-white shadow-[0_8px_28px_-12px_rgba(15,23,42,0.18)]"
                  : "border-transparent bg-slate-50/80 hover:border-slate-200/60 hover:bg-slate-50"
              }`}
            >
              <p className="text-xl font-bold tabular-nums text-slate-900">{kpiValues[i]}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-400 shadow-sm">
              <HouseIcon className="h-7 w-7" />
            </div>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeKpi]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Property
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Rent
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {" "}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.adminRefId + (row.listingId ?? "")} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">
                        {row.buildingName} · {row.unitLabel}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{row.address}</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">${row.monthlyRent}/month</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <StatusPill label={status.label} variant={status.variant} />
                    </td>
                    <td className="px-5 py-4 text-right align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                        onClick={() => setDetailRow(row)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PropertyDetailSheet
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        bucket={activeKpi}
        row={detailRow}
        onUpdated={() => setTick((t) => t + 1)}
        showToast={showToast}
      />
    </div>
  );
}

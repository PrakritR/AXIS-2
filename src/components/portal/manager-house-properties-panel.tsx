"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { ListingPublicPreviewModal } from "@/components/portal/listing-public-preview-modal";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE_WRAP, PORTAL_TABLE_HEAD_ROW, PORTAL_TABLE_ROW_TOGGLE_CLASS, PORTAL_TABLE_TR, PORTAL_TABLE_TD } from "@/components/portal/portal-data-table";
import type { ManagerHouseBucket } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  adminKpiCounts,
  declineFromRequestChange,
  listAdminRow,
  moveListedToRejected,
  moveListedToRequestChange,
  movePendingToRejected,
  movePendingToRequestChange,
  moveUnlistedToRejected,
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import { PROPERTY_PIPELINE_EVENT, readPendingManagerPropertiesForUser } from "@/lib/demo-property-pipeline";

const BUCKET_ORDER: ManagerHouseBucket[] = ["pending", "change", "listed", "unlisted", "rejected"];

const BUCKET_LABELS: Record<ManagerHouseBucket, string> = {
  pending: "Pending approval",
  change: "Request change",
  listed: "Listed",
  unlisted: "Unlisted",
  rejected: "Rejected",
};

const EMPTY_COPY: Record<ManagerHouseBucket, string> = {
  pending: "No properties awaiting approval.",
  change: "No properties in request change.",
  listed: "No listed properties.",
  unlisted: "No unlisted properties.",
  rejected: "No rejected properties.",
};

function managerBucketToIndex(b: ManagerHouseBucket): AdminPropertyBucketIndex {
  return BUCKET_ORDER.indexOf(b) as AdminPropertyBucketIndex;
}

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
      return { label: "Pending approval", variant: "amber" };
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

function ManagerPropertyPreviewModal({
  open,
  onClose,
  bucket,
  row,
  onUpdated,
  showToast,
  managerUserId,
}: {
  open: boolean;
  onClose: () => void;
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
}) {
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
  const listingId = row?.listingId;

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
    onClose();
  };

  if (!open || !row || !mock) return null;

  const footer = (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Actions</p>
      <p className="text-xs text-slate-500">Listing approval is handled by Axis admin.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {bucket === 0 ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Moved to request change.", movePendingToRequestChange(row.adminRefId, managerUserId))}
            >
              Request edit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Declined submission.", movePendingToRejected(row.adminRefId, managerUserId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 1 ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Returned to pending approval.", returnRequestChangeToPending(row.adminRefId, managerUserId))}
            >
              Move to pending approval
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Declined.", declineFromRequestChange(row.adminRefId, managerUserId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 2 && listingId ? (
          <>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => run("Unlisted property.", unlistManagerListing(listingId, managerUserId))}>
              Unlist
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Moved to request change.", moveListedToRequestChange(listingId, managerUserId))}
            >
              Request edit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Rejected listing.", moveListedToRejected(listingId, managerUserId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 3 ? (
          <>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                const id = listAdminRow(row, managerUserId);
                run(id ? "Property listed." : "Could not list property.", Boolean(id));
              }}
            >
              List
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Moved to rejected.", moveUnlistedToRejected(row.adminRefId, managerUserId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 4 ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => run("Restored to pending approval.", restoreRejectedToPending(row.adminRefId, managerUserId))}
          >
            Move to pending approval
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <ListingPublicPreviewModal
      open={open}
      onClose={onClose}
      property={mock}
      publicHref={publicListingHrefForPropertyRow(row)}
      footer={footer}
    />
  );
}

export function ManagerHousePropertiesPanel({ showToast }: { showToast: (m: string) => void }) {
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerHouseBucket>("listed");
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState<AdminPropertyRow | null>(null);
  const prevPendingCount = useRef(0);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  useEffect(() => {
    if (!managerUserId) return;
    const n = readPendingManagerPropertiesForUser(managerUserId).length;
    if (n > prevPendingCount.current) {
      setBucket("pending");
    }
    prevPendingCount.current = n;
  }, [tick, managerUserId]);

  const activeIndex = managerBucketToIndex(bucket);
  const kpiValues = useMemo(() => (managerUserId ? adminKpiCounts(managerUserId) : [0, 0, 0, 0, 0]), [tick, managerUserId]);
  const rows = useMemo(
    () => (managerUserId ? readAdminPropertyRows(activeIndex, managerUserId) : []),
    [tick, activeIndex, managerUserId],
  );
  const status = rowStatus(activeIndex);

  if (!authReady) {
    return <p className="text-sm text-slate-500">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-slate-600">Sign in to view and manage your properties.</p>;
  }

  return (
    <>
      <div>
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {BUCKET_ORDER.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setBucket(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                bucket === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {BUCKET_LABELS[id]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  bucket === id ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
                }`}
              >
                {kpiValues[i]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[bucket]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const publicHref = publicListingHrefForPropertyRow(row);
                  return (
                    <tr key={row.adminRefId + (row.listingId ?? "")} className={PORTAL_TABLE_TR}>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-slate-900">
                          {row.buildingName} · {row.unitLabel}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {row.address}
                          {row.zip ? `, ${row.zip}` : ""}
                        </p>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium text-slate-800">${row.monthlyRent}</span>/mo · {row.beds} bd / {row.baths} ba ·{" "}
                          {row.neighborhood}
                        </p>
                        {row.tagline.trim() ? <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{row.tagline}</p> : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <StatusPill label={status.label} variant={status.variant} />
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {publicHref ? (
                            <Link
                              href={publicHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center justify-center ${PORTAL_TABLE_ROW_TOGGLE_CLASS}`}
                            >
                              View listing
                            </Link>
                          ) : null}
                          <Button type="button" variant="outline" className={PORTAL_TABLE_ROW_TOGGLE_CLASS} onClick={() => setDetailRow(row)}>
                            More details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ManagerPropertyPreviewModal
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        bucket={activeIndex}
        row={detailRow}
        onUpdated={() => setTick((t) => t + 1)}
        showToast={showToast}
        managerUserId={managerUserId}
      />
    </>
  );
}

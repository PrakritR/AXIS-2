"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { ListingPublicPreviewModal } from "@/components/portal/listing-public-preview-modal";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

/** Managers only inventory admin-approved listings that are live (`adminPublishLive`). */
const LISTED_BUCKET = 2 as AdminPropertyBucketIndex;

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

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      {label}
    </span>
  );
}

function ManagerPropertyPreviewModal({
  open,
  onClose,
  row,
  onUpdated,
  showToast,
  managerUserId,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
}) {
  const router = useRouter();
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
        {listingId ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Unlisted property.", unlistManagerListing(listingId, managerUserId))}
            >
              Unlist
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                onClose();
                router.push(`/manager/properties?editListing=${encodeURIComponent(listingId)}`);
              }}
            >
              Edit listing
            </Button>
          </>
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
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState<AdminPropertyRow | null>(null);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const rows = useMemo(
    () => (managerUserId ? readAdminPropertyRows(LISTED_BUCKET, managerUserId) : []),
    [tick, managerUserId],
  );

  if (!authReady) {
    return <p className="text-sm text-slate-500">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-slate-600">Sign in to view and manage your properties.</p>;
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        Showing <span className="font-semibold text-slate-800">live listings</span> approved by Axis admin and published on
        Rent with Axis.
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">
              No approved listings yet. Submit a property for admin review; after approval it appears here.
            </p>
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
                          <span className="font-medium text-slate-800">${row.monthlyRent}</span>/mo · {row.beds} bd / {row.baths}{" "}
                          ba · {row.neighborhood}
                        </p>
                        {row.tagline.trim() ? <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{row.tagline}</p> : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <StatusPill label="Listed" />
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
        row={detailRow}
        onUpdated={() => setTick((t) => t + 1)}
        showToast={showToast}
        managerUserId={managerUserId}
      />
    </>
  );
}

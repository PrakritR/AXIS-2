"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import {
  PROPERTY_PIPELINE_EVENT,
  approvePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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

const LISTING_PHOTO_IDS = [
  "1522708323590-d24dbb6b0267",
  "1560448204-e02f11c3d0e2",
  "1502672260266-1c1ef2d93688",
] as const;

function listingPhotoSrc(photoId: string) {
  return `https://images.unsplash.com/photo-${photoId}?w=800&q=80&auto=format&fit=crop`;
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" aria-hidden>
      {dir === "left" ? (
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function ApplyDocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminPropertyListingCard({
  row,
  statusLabel,
  statusVariant,
  onOpenDetails,
}: {
  row: AdminPropertyRow;
  statusLabel: string;
  statusVariant: "green" | "amber" | "slate" | "rose";
  onOpenDetails: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const slideCount = LISTING_PHOTO_IDS.length;
  const sharedHousing =
    /\bshared\b/i.test(row.tagline) || row.beds >= 5 || /\bco-?living\b/i.test(row.tagline);
  const title = `${row.buildingName} · ${row.unitLabel}`;
  const fullAddress = `${row.address}${row.zip ? `, ${row.zip}` : ""}`;
  const desc =
    row.tagline.trim().length > 0
      ? row.tagline.length > 140
        ? `${row.tagline.slice(0, 140)}…`
        : row.tagline
      : `${row.neighborhood} housing with flexible lease options. Pet policy: ${row.petFriendly ? "pet-friendly." : "no pets."}`;
  const rentLow = Math.max(400, row.monthlyRent - 75);
  const rentHigh = row.monthlyRent + 75;
  const listingHref = row.listingId ? `/rent/listings/${row.listingId}` : null;
  const applyHref = row.listingId ? buildRentalApplyHref({ propertyId: row.listingId }) : null;

  const tags = [
    sharedHousing ? "Shared housing" : null,
    row.neighborhood,
    "Seattle",
    row.petFriendly ? "Pet-friendly" : null,
  ].filter(Boolean) as string[];

  const go = (d: number) => setSlide((s) => (s + d + slideCount) % slideCount);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.12)] transition duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_20px_50px_-28px_rgba(15,23,42,0.16)]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl bg-gradient-to-br from-slate-200 to-slate-400">
        <img
          src={listingPhotoSrc(LISTING_PHOTO_IDS[slide]!)}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3">
          <span className="inline-block rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-900 shadow-sm">
            {sharedHousing ? "Shared housing" : row.neighborhood}
          </span>
        </div>
        <button
          type="button"
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
          onClick={() => go(-1)}
        >
          <ChevronIcon dir="left" />
        </button>
        <button
          type="button"
          aria-label="Next photo"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
          onClick={() => go(1)}
        >
          <ChevronIcon dir="right" />
        </button>
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {LISTING_PHOTO_IDS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1}`}
              className={`h-1.5 w-1.5 rounded-full transition ${i === slide ? "bg-white" : "bg-white/40"}`}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
        <div className="absolute bottom-3 right-3 text-right text-white drop-shadow-sm">
          <span className="text-[11px] font-medium opacity-90">from </span>
          <span className="text-lg font-bold">
            ${rentLow}–${rentHigh}
          </span>
          <span className="text-[11px] font-semibold">/mo</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={statusLabel} variant={statusVariant} />
        </div>
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{fullAddress}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12h16v8H4v-8Zm2-4h12v4H6V8Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="font-medium">{row.beds} bedrooms</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 4h12v16H6V4Zm3 4h6M9 14h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="font-medium">{row.baths} bathrooms</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-sky-100 bg-sky-50/90 px-2.5 py-1 text-xs font-semibold text-sky-900"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {listingHref ? (
            <Link href={listingHref} className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:brightness-[1.05]" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}>
              View listing
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <Button type="button" className="w-full gap-2 rounded-xl py-3 text-[14px]" onClick={onOpenDetails}>
              View listing
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          )}
          {applyHref ? (
            <Link
              href={applyHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <ApplyDocIcon className="h-4 w-4 shrink-0" />
              Apply
            </Link>
          ) : (
            <Button type="button" variant="outline" className="w-full gap-2 rounded-xl py-2.5 text-[14px]" onClick={onOpenDetails}>
              <ApplyDocIcon className="h-4 w-4 shrink-0" />
              Apply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
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
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Properties</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="mt-5">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {KPI_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveKpi(i as AdminPropertyBucketIndex)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                activeKpi === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  activeKpi === i ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
                }`}
              >
                {kpiValues[i]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeKpi]}</p>
          </div>
        ) : (
          <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
            {rows.map((row) => (
              <AdminPropertyListingCard
                key={row.adminRefId + (row.listingId ?? "")}
                row={row}
                statusLabel={status.label}
                statusVariant={status.variant}
                onOpenDetails={() => setDetailRow(row)}
              />
            ))}
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

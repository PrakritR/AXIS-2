"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ListingPublicPreviewModal } from "@/components/portal/listing-public-preview-modal";
import { PropertyRequestEditForm } from "@/components/portal/property-request-edit-form";
import { PROPERTY_PIPELINE_EVENT, approvePendingManagerProperty } from "@/lib/demo-property-pipeline";
import { logDemoOutboundEmail } from "@/lib/demo-outbound-mail";
import { MANAGER_TABLE_TH, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";

const KPI_LABELS = [
  "Pending approval",
  "Request change",
  "Listed",
  "Unlisted",
  "Rejected",
] as const;

const EMPTY_COPY: Record<AdminPropertyBucketIndex, string> = {
  0: "No properties awaiting approval.",
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

function AdminPropertyPreviewModal({
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
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
  const listingId = row?.listingId;
  const [composeEdit, setComposeEdit] = useState<null | "pending" | "listed">(null);

  useEffect(() => {
    setComposeEdit(null);
  }, [row?.adminRefId, open]);

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
      {bucket === 1 && row.editRequestNote?.trim() ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Requested changes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{row.editRequestNote.trim()}</p>
        </div>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Actions</p>
      {composeEdit === "pending" && bucket === 0 ? (
        <PropertyRequestEditForm
          recipientHint="manager / owner who submitted this listing"
          onCancel={() => setComposeEdit(null)}
          onSend={(note) => {
            const t = note.trim();
            if (!t) {
              showToast("Enter a message describing the requested edits.");
              return;
            }
            const ok = movePendingToRequestChange(row.adminRefId, undefined, t);
            if (!ok) {
              showToast("Action could not be completed.");
              return;
            }
            logDemoOutboundEmail(
              `listing-submit-${row.adminRefId}@portal.axis.demo`,
              `Edits requested: ${row.buildingName} · ${row.unitLabel}`,
              `${t}\n\nProperty: ${row.address}${row.zip ? `, ${row.zip}` : ""}`,
            );
            showToast("Edit request sent (demo: check sessionStorage axis_demo_outbound_mail_v1).");
            setComposeEdit(null);
            onUpdated();
            onClose();
          }}
        />
      ) : null}
      {composeEdit === "listed" && bucket === 2 && listingId ? (
        <PropertyRequestEditForm
          recipientHint="manager / owner who listed this property"
          onCancel={() => setComposeEdit(null)}
          onSend={(note) => {
            const t = note.trim();
            if (!t) {
              showToast("Enter a message describing the requested edits.");
              return;
            }
            const ok = moveListedToRequestChange(listingId, undefined, t);
            if (!ok) {
              showToast("Action could not be completed.");
              return;
            }
            logDemoOutboundEmail(
              `listing-listed-${listingId}@portal.axis.demo`,
              `Edits requested (listed): ${row.buildingName} · ${row.unitLabel}`,
              `${t}\n\nListing ID: ${listingId}\n${row.address}${row.zip ? `, ${row.zip}` : ""}`,
            );
            showToast("Edit request sent (demo: check sessionStorage axis_demo_outbound_mail_v1).");
            setComposeEdit(null);
            onUpdated();
            onClose();
          }}
        />
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {bucket === 0 && composeEdit !== "pending" ? (
          <>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                const created = approvePendingManagerProperty(row.adminRefId);
                run(created ? `Approved and listed: ${created.title}` : "Approved.", Boolean(created));
              }}
            >
              Approve
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setComposeEdit("pending")}>
              Request edit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Declined submission.", movePendingToRejected(row.adminRefId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 1 ? (
          <>
            <Button type="button" className="rounded-full" onClick={() => run("Published listing.", approveFromRequestChange(row.adminRefId))}>
              Approve &amp; list
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Returned to pending approval.", returnRequestChangeToPending(row.adminRefId))}
            >
              Move to pending approval
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Declined.", declineFromRequestChange(row.adminRefId))}
            >
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 2 && listingId && composeEdit !== "listed" ? (
          <>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => run("Unlisted property.", unlistManagerListing(listingId))}>
              Unlist
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setComposeEdit("listed")}>
              Request edit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Rejected listing.", moveListedToRejected(listingId))}
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
              REJECT
            </Button>
          </>
        ) : null}

        {bucket === 4 ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => run("Restored to pending approval.", restoreRejectedToPending(row.adminRefId))}
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
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
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
                    <tr key={row.adminRefId + (row.listingId ?? "")} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {row.buildingName} · {row.unitLabel}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {row.address}
                          {row.zip ? `, ${row.zip}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">${row.monthlyRent}</span>/mo · {row.beds} bd / {row.baths} ba ·{" "}
                          {row.neighborhood}
                        </p>
                        {row.tagline.trim() ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{row.tagline}</p> : null}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill label={status.label} variant={status.variant} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {publicHref ? (
                            <Link
                              href={publicHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              View listing
                            </Link>
                          ) : null}
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setDetailRow(row)}>
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

      <AdminPropertyPreviewModal
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

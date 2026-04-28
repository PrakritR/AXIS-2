"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PropertyRequestEditForm } from "@/components/portal/property-request-edit-form";
import { getListingRichContent } from "@/data/listing-rich-content";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH, ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import {
  mirrorLocalPropertyPipelineToServer,
  PROPERTY_PIPELINE_EVENT,
  approvePendingManagerProperty,
  republishManagerListingAfterReview,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import { logDemoOutboundEmail } from "@/lib/demo-outbound-mail";
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
  removeRejectedProperty,
  resolveAdminPropertyRowPreview,
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

const ADMIN_TAB_BANNER: Record<AdminPropertyBucketIndex, string> = {
  0: "New manager submissions and edited live listings re-enter the queue here until you approve, request changes, or reject them.",
  1: "Managers should revise and resubmit. When ready, you can return items to the pending review queue or close them out from the property detail view.",
  2: "These listings are on the public Rent with Axis catalog. Unlist, request edits, or open the detail view for full review actions.",
  3: "Listings the manager took off the public site. You can request changes, reject, or work from the detail view if needed.",
  4: "Declined or removed from the catalog. Use the detail view to move back to pending or clear from the queue.",
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
      return { label: "Approved · edits requested", variant: "amber" };
    case 2:
      return { label: "Listed", variant: "green" };
    case 3:
      return { label: "Unlisted", variant: "slate" };
    default:
      return { label: "Rejected", variant: "rose" };
  }
}

function AdminPropertyInlineDetails({
  bucket,
  row,
  onUpdated,
  onDismiss,
  showToast,
}: {
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow;
  onUpdated: () => void;
  onDismiss: () => void;
  showToast: (m: string) => void;
}) {
  const mock = useMemo(() => resolveAdminPropertyRowPreview(row), [row]);
  const listingId = row.listingId;
  const [composeEdit, setComposeEdit] = useState<null | "pending" | "listed">(null);
  const rich = useMemo(() => getListingRichContent(mock), [mock]);
  const publicHref = publicListingHrefForPropertyRow(row);

  useEffect(() => {
    setComposeEdit(null);
  }, [row.adminRefId]);

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
    onDismiss();
  };

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
            onDismiss();
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
            onDismiss();
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
                if (row.adminRefId.startsWith("mgr-")) {
                  const id = row.listingId ?? row.adminRefId;
                  const ok = republishManagerListingAfterReview(id);
                  run(ok ? "Listing approved — live on Rent with Axis again." : "Could not publish listing.", ok);
                  return;
                }
                const created = approvePendingManagerProperty(row.adminRefId);
                run(created ? `Approved and listed: ${created.title}` : "Approved.", Boolean(created));
              }}
            >
              Approve
            </Button>
            {row.adminRefId.startsWith("mgr-") ? null : (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setComposeEdit("pending")}>
                Request edit
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() =>
                row.adminRefId.startsWith("mgr-")
                  ? run("Listing removed from catalog.", moveListedToRejected(row.listingId ?? row.adminRefId))
                  : run("Declined submission.", movePendingToRejected(row.adminRefId))
              }
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
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => run("Restored to pending approval.", restoreRejectedToPending(row.adminRefId))}
            >
              Move to pending approval
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => run("Property deleted from rejected queue.", removeRejectedProperty(row.adminRefId))}
            >
              Delete property
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Public listing preview</p>
        {publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            Open public page
          </Link>
        ) : null}
      </div>
      <div
        data-listing-preview-scroll
        className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white"
      >
        <ListingDetailSections property={mock} rich={rich} previewModal />
      </div>
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-4 sm:px-5">{footer}</div>
    </div>
  );
}

export function AdminPropertiesClient() {
  const { showToast } = useAppUi();
  const [activeKpi, setActiveKpi] = useState<AdminPropertyBucketIndex>(0);
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed property queue.");
  }, [showToast]);

  useEffect(() => {
    void syncPropertyPipelineFromServer().then(() => {
      setTick((t) => t + 1);
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  useEffect(() => {
    setExpandedRowKey(null);
  }, [activeKpi]);

  const kpiValues = useMemo(() => adminKpiCounts(), [tick]);
  const rows = useMemo(() => readAdminPropertyRows(activeKpi), [tick, activeKpi]);
  const status = rowStatus(activeKpi);

  return (
    <ManagerPortalPageShell
      title="Properties"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      }
    >
      <div className="mt-1 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {KPI_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveKpi(i as AdminPropertyBucketIndex)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 sm:px-4 sm:text-sm ${
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

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        {ADMIN_TAB_BANNER[activeKpi]}
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeKpi]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowKey = row.adminRefId + (row.listingId ?? "");
                  const expanded = expandedRowKey === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr className={PORTAL_TABLE_TR}>
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
                          {String(row.tagline ?? "").trim() ? (
                            <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{row.tagline}</p>
                          ) : null}
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <StatusPill label={status.label} variant={status.variant} />
                        </td>
                        <td className={`${PORTAL_TABLE_TD} text-right`}>
                          <Button
                            type="button"
                            variant="outline"
                            className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                            onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                            aria-expanded={expanded}
                          >
                            {expanded ? "Hide details" : "Details"}
                          </Button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={4} className="bg-slate-50/50 px-4 py-4">
                            <AdminPropertyInlineDetails
                              bucket={activeKpi}
                              row={row}
                              onUpdated={() => setTick((t) => t + 1)}
                              onDismiss={() => setExpandedRowKey(null)}
                              showToast={showToast}
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
        )}
      </div>
    </ManagerPortalPageShell>
  );
}

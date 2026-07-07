"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PropertyRequestEditForm } from "@/components/portal/property-request-edit-form";
import { getListingRichContent } from "@/data/listing-rich-content";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_EXPAND_TH,
  PORTAL_TABLE_TD,
  PortalTableExpandCell,
  PortalTableExpandChevron,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import {
  PROPERTY_PIPELINE_EVENT,
  approvePendingManagerProperty,
  republishManagerListingAfterReview,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import { logDemoOutboundEmail } from "@/lib/demo-outbound-mail";
import {
  adminKpiCounts,
  adminPropertyRentDisplayLabel,
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

/** Admin property tabs — pending review (bucket 0) is handled outside this queue. */
const KPI_TABS: { bucket: AdminPropertyBucketIndex; label: string }[] = [
  { bucket: 1, label: "Request change" },
  { bucket: 2, label: "Listed" },
  { bucket: 3, label: "Unlisted" },
  { bucket: 4, label: "Rejected" },
];

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
        <div className="rounded-xl border border-border bg-accent/30 px-4 py-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Requested changes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-muted">{row.editRequestNote.trim()}</p>
        </div>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Actions</p>
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
              variant="danger"
              className="rounded-full"
              onClick={() =>
                row.adminRefId.startsWith("mgr-")
                  ? run("Listing removed from catalog.", moveListedToRejected(row.listingId ?? row.adminRefId))
                  : run("Declined submission.", movePendingToRejected(row.adminRefId))
              }
            >
              Reject
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
              variant="danger"
              className="rounded-full"
              onClick={() => run("Declined.", declineFromRequestChange(row.adminRefId))}
            >
              Reject
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
              variant="danger"
              className="rounded-full"
              onClick={() => run("Rejected listing.", moveListedToRejected(listingId))}
            >
              Reject
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
              variant="danger"
              className="rounded-full"
              onClick={() => run("Moved to rejected.", moveUnlistedToRejected(row.adminRefId))}
            >
              Reject
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
              variant="danger"
              className="rounded-full"
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
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Public listing preview</p>
        {publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            Open public page
          </Link>
        ) : null}
      </div>
      <div
        data-listing-preview-scroll
        className="portal-desktop-scroll-panel overscroll-contain rounded-2xl border border-border bg-background"
      >
        <ListingDetailSections property={mock} rich={rich} previewModal />
      </div>
      <div className="rounded-2xl border border-border bg-accent/30 px-4 py-4 sm:px-5">{footer}</div>
    </div>
  );
}

export function AdminPropertiesClient() {
  const { showToast } = useAppUi();
  const [activeKpi, setActiveKpi] = useState<AdminPropertyBucketIndex>(2);
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  useEffect(() => {
    // No mirror-back here: the sync just overwrote the local pipeline with the
    // server snapshot, so re-uploading it is one redundant POST per property row
    // across every manager. Admin actions mirror individually at write time.
    void syncPropertyPipelineFromServer().then(() => {
      setTick((t) => t + 1);
    });
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const kpiValues = useMemo(() => {
    void tick;
    return adminKpiCounts();
  }, [tick]);
  const rows = useMemo(() => {
    void tick;
    return readAdminPropertyRows(activeKpi);
  }, [tick, activeKpi]);
  const kpiTabs = useMemo(
    () => KPI_TABS.map(({ bucket, label }) => ({ id: String(bucket), label, count: kpiValues[bucket] })),
    [kpiValues],
  );

  return (
    <ManagerPortalPageShell
      title="Properties"
      filterRow={
        <ManagerPortalFilterRow>
          <div className="min-w-0 max-w-full">
            <ManagerPortalStatusPills
              tabs={kpiTabs}
              activeId={String(activeKpi)}
              onChange={(id) => {
                setActiveKpi(Number(id) as AdminPropertyBucketIndex);
                setExpandedRowKey(null);
              }}
            />
          </div>
        </ManagerPortalFilterRow>
      }
    >
      {rows.length === 0 ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className="flex flex-col items-center justify-center bg-accent/30/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-muted">{EMPTY_COPY[activeKpi]}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rows.map((row) => {
              const rowKey = row.adminRefId + (row.listingId ?? "");
              const expanded = expandedRowKey === rowKey;
              return (
                <div key={rowKey} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-foreground">
                        {row.buildingName} · {row.unitLabel}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-muted">
                        <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths} ba ·{" "}
                        {row.neighborhood}
                      </p>
                      <p className="mt-0.5 break-words text-[11px] text-muted/90">
                        {row.address}
                        {row.zip ? `, ${row.zip}` : ""}
                      </p>
                    </div>
                    <PortalTableExpandChevron expanded={expanded} />
                  </button>
                  {expanded ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <AdminPropertyInlineDetails
                        key={rowKey}
                        bucket={activeKpi}
                        row={row}
                        onUpdated={() => setTick((t) => t + 1)}
                        onDismiss={() => setExpandedRowKey(null)}
                        showToast={showToast}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className={PORTAL_DATA_TABLE}>
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} w-[45%] text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                    <th className={PORTAL_TABLE_EXPAND_TH}>
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowKey = row.adminRefId + (row.listingId ?? "");
                    const expanded = expandedRowKey === rowKey;
                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedRowKey(expanded ? null : rowKey),
                          )}
                          aria-expanded={expanded}
                        >
                          <td className={PORTAL_TABLE_TD}>
                            <p className="break-words font-medium text-foreground">
                              {row.buildingName} · {row.unitLabel}
                            </p>
                            <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
                              {row.address}
                              {row.zip ? `, ${row.zip}` : ""}
                            </p>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <p className="break-words text-xs text-muted">
                              <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths} ba ·{" "}
                              {row.neighborhood}
                            </p>
                          </td>
                          <PortalTableExpandCell expanded={expanded} />
                        </tr>
                        {expanded ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                              <AdminPropertyInlineDetails
                                key={rowKey}
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
          </div>
        </>
      )}
    </ManagerPortalPageShell>
  );
}

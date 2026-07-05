"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MockProperty } from "@/data/types";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { getListingRichContent } from "@/data/listing-rich-content";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { ManagerPropertyApplicationQuestionsPanel } from "@/components/portal/manager-property-application-questions-panel";
import { ManagerPropertyHouseDetailsPanel } from "@/components/portal/manager-property-house-details-panel";
import { ManagerPropertyServiceOptionsPanel } from "@/components/portal/manager-property-service-options-panel";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PORTAL_MOBILE_CARD_CLASS,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  adminKpiCounts,
  adminPropertyRentDisplayLabel,
  deleteManagerLiveListing,
  deleteUnlistedManagerProperty,
  listAdminRow,
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  removeRejectedProperty,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import { parseMonthlyRent } from "@/lib/listings-search";
import {
  PROPERTY_PIPELINE_EVENT,
  deletePendingSubmissionForManager,
  mirrorLocalPropertyPipelineToServer,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import { syncManagerPortfolioFromServer } from "@/lib/manager-portfolio-access";
import { resolvePropertySaveTarget } from "@/lib/manager-property-save-target";
import {
  legacyAdminFieldsToSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  buildManagerApplyUrl,
  buildManagerListingUrl,
  buildManagerTourUrl,
  copyTextToClipboard,
} from "@/lib/manager-property-links";

function submissionForPendingEdit(row: ManagerPendingPropertyRow): ManagerListingSubmissionV1 {
  const raw = row.submission ? row.submission : legacyAdminFieldsToSubmission(row);
  return normalizeManagerListingSubmissionV1(raw);
}

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = parseMonthlyRent(String(p.rentLabel ?? "")) ?? 0;
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: p.buildingName,
      address: p.address,
      zip: p.zip,
      neighborhood: p.neighborhood,
      unitLabel: p.unitLabel,
      beds: p.beds,
      baths: p.baths,
      monthlyRent: rentNum,
      petFriendly: p.petFriendly,
      tagline: p.tagline,
    }),
  );
}

function submissionForAdminRow(row: AdminPropertyRow): ManagerListingSubmissionV1 {
  if (row.submission) return normalizeManagerListingSubmissionV1(row.submission);
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: row.buildingName,
      address: row.address,
      zip: row.zip,
      neighborhood: row.neighborhood,
      unitLabel: row.unitLabel,
      beds: row.beds,
      baths: row.baths,
      monthlyRent: row.monthlyRent,
      petFriendly: row.petFriendly,
      tagline: row.tagline,
    }),
  );
}

/** Lets the browser paint after click before heavy localStorage writes (better INP on delete/unlist). */
function deferCatalogMutation(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

const MANAGER_STAGES = [
  { key: "pending", label: "Pending", buckets: [0, 1] as AdminPropertyBucketIndex[] },
  { key: "listed", label: "Listed", buckets: [2] as AdminPropertyBucketIndex[] },
  { key: "unlisted", label: "Unlisted", buckets: [3] as AdminPropertyBucketIndex[] },
  { key: "rejected", label: "Rejected", buckets: [4] as AdminPropertyBucketIndex[] },
] as const;

export type ManagerStageKey = (typeof MANAGER_STAGES)[number]["key"];

export const MANAGER_PROPERTY_EMPTY_COPY: Record<ManagerStageKey, string> = {
  pending: "Nothing awaiting review.",
  listed: "No listed properties.",
  unlisted: "No unlisted properties.",
  rejected: "No rejected properties.",
};

export function managerStageFromParam(raw: string | null): ManagerStageKey {
  return MANAGER_STAGES.some((stage) => stage.key === raw) ? (raw as ManagerStageKey) : "pending";
}

export { MANAGER_STAGES };

function ManagerPropertyInlineDetails({
  bucket,
  row,
  onUpdated,
  showToast,
  managerUserId,
  onSendToProspect,
}: {
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
  onSendToProspect?: (listingId: string) => void;
}) {
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
  const rich = useMemo(() => (mock ? getListingRichContent(mock) : null), [mock]);
  const listingId = row?.listingId;
  const stablePropertyId = row?.listingId?.trim() || row?.adminRefId?.trim() || null;

  const portalSub = useMemo<
    | { sub: ManagerListingSubmissionV1; saveMode: "pending" | "listing" | "requestChange"; saveId: string; listingId?: string }
    | null
  >(() => {
    if (!managerUserId || !row) return null;

    const listingId = row.listingId?.trim() || undefined;
    if (listingId) {
      const p = readExtraListingsForUser(managerUserId).find((x) => x.id === listingId);
      if (p) return { sub: submissionForListedEdit(p), saveMode: "listing", saveId: listingId, listingId };
      if (bucket === 1) {
        return { sub: submissionForAdminRow(row), saveMode: "requestChange", saveId: row.adminRefId, listingId };
      }
      if (bucket === 0 && row.adminRefId.startsWith("mgr-")) {
        return { sub: submissionForAdminRow(row), saveMode: "listing", saveId: row.adminRefId, listingId };
      }
    }

    if (bucket === 0) {
      const p = readPendingManagerPropertiesForUser(managerUserId).find((r) => r.id === row.adminRefId);
      return p ? { sub: submissionForPendingEdit(p), saveMode: "pending", saveId: row.adminRefId } : null;
    }

    return null;
  }, [managerUserId, row, bucket]);

  // noteKey is stable per listing — derived from row identifiers so it doesn't depend on portalSub.
  const noteKey = useMemo(
    () => (managerUserId && stablePropertyId ? `${managerUserId}:${stablePropertyId}` : null),
    [managerUserId, stablePropertyId],
  );

  const displaySub = portalSub?.sub ?? null;
  const [editorOpen, setEditorOpen] = useState(false);

  const managerSubmission = useMemo(
    () => (row ? displaySub ?? submissionForAdminRow(row) : null),
    [displaySub, row],
  );

  const houseSaveTarget = useMemo(() => {
    if (!row) return null;
    return resolvePropertySaveTarget({
      portalSaveMode: portalSub?.saveMode,
      portalSaveId: portalSub?.saveId,
      bucket,
      adminRefId: row.adminRefId,
      listingId,
    });
  }, [portalSub, bucket, row, listingId]);

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
  };

  if (!row || !mock || !managerSubmission) return null;
  const publicHref = publicListingHrefForPropertyRow(row);

  const actionBtnClass = "w-full rounded-full";

  const footer = (
    <div className="flex flex-col gap-3">
      {bucket === 1 && row.editRequestNote?.trim() ? (
        <div className="rounded-xl border border-border bg-accent/30 px-4 py-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Requested changes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-muted">{row.editRequestNote.trim()}</p>
        </div>
      ) : null}

      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Actions</p>

      {bucket === 0 ? (
        <>
          {row.adminRefId.startsWith("mgr-") ? (
            <p className="text-xs text-muted">
              This listing was edited and is pending admin re-approval. Edit sections below.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              className={`${actionBtnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
              onClick={() => {
                if (row.adminRefId.startsWith("mgr-")) {
                  if (!window.confirm("Permanently delete this listing from your catalog?")) return;
                  deferCatalogMutation(() => run("Listing deleted.", deleteManagerLiveListing(row.adminRefId, managerUserId)));
                  return;
                }
                if (!window.confirm("Delete this pending submission? You can create a new listing later.")) return;
                deferCatalogMutation(() =>
                  run("Submission deleted.", deletePendingSubmissionForManager(row.adminRefId, managerUserId)),
                );
              }}
            >
              {row.adminRefId.startsWith("mgr-") ? "Delete listing" : "Delete submission"}
            </Button>
          </div>
        </>
      ) : null}

      {bucket === 1 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() =>
              deferCatalogMutation(() =>
                run("Returned to pending — you can edit and resubmit.", returnRequestChangeToPending(row.adminRefId, managerUserId)),
              )
            }
          >
            Move to pending & revise
          </Button>
        </div>
      ) : null}

      {bucket === 2 && listingId ? (
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() => onSendToProspect?.(listingId)}
          >
            Send to prospect
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() => {
              void (async () => {
                const url = buildManagerApplyUrl(window.location.origin, { propertyId: listingId });
                const ok = await copyTextToClipboard(url);
                showToast(ok ? "Apply link copied." : "Could not copy link.");
              })();
            }}
          >
            Copy apply link
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() => {
              void (async () => {
                const url = buildManagerTourUrl(window.location.origin, listingId);
                const ok = await copyTextToClipboard(url);
                showToast(ok ? "Tour link copied." : "Could not copy link.");
              })();
            }}
          >
            Copy tour link
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() =>
              deferCatalogMutation(() => run("Listing unlisted.", unlistManagerListing(listingId, managerUserId)))
            }
          >
            Unlist
          </Button>
          {displaySub && portalSub ? (
            <Button type="button" variant="outline" className={actionBtnClass} onClick={() => setEditorOpen(true)}>
              Edit listing
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={`${actionBtnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            onClick={() => {
              if (!window.confirm("Permanently delete this listing? It will be removed from your catalog.")) return;
              deferCatalogMutation(() => run("Listing deleted.", deleteManagerLiveListing(listingId, managerUserId)));
            }}
          >
            Delete listing
          </Button>
        </div>
      ) : null}

      {bucket === 3 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() => {
              deferCatalogMutation(() => {
                const id = listAdminRow(row, managerUserId);
                if (!id) {
                  showToast("Could not relist.");
                  return;
                }
                showToast("Listing is live again.");
                onUpdated();
              });
            }}
          >
            Relist property
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`${actionBtnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            onClick={() => {
              if (!window.confirm("Remove this unlisted property from your queue permanently?")) return;
              deferCatalogMutation(() =>
                run("Removed from queue.", deleteUnlistedManagerProperty(row.adminRefId, managerUserId)),
              );
            }}
          >
            Delete from queue
          </Button>
        </div>
      ) : null}

      {bucket === 4 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className={actionBtnClass}
            onClick={() =>
              deferCatalogMutation(() =>
                run("Restored to pending approval.", restoreRejectedToPending(row.adminRefId, managerUserId)),
              )
            }
          >
            Move to pending approval
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`${actionBtnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            onClick={() =>
              deferCatalogMutation(() => run("Property removed.", removeRejectedProperty(row.adminRefId, managerUserId)))
            }
          >
            Delete property
          </Button>
        </div>
      ) : null}

      {displaySub && portalSub && !(bucket === 2 && listingId) ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" className={actionBtnClass} onClick={() => setEditorOpen(true)}>
            Edit listing
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      {row.tagline.trim() ? <p className="text-sm text-muted">{row.tagline}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Preview</p>
        {publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            data-attr="listing-open-public-page"
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            Open public page
          </Link>
        ) : (
          <span className="text-xs text-muted">Exact layout renters see once approved</span>
        )}
      </div>
      {mock && rich ? (
        <div
          data-listing-preview-scroll
          className="portal-desktop-scroll-panel overscroll-contain rounded-2xl border border-border bg-background"
        >
          <ListingDetailSections property={mock} rich={rich} previewModal />
        </div>
      ) : null}

      <ManagerPropertyHouseDetailsPanel
        noteKey={noteKey}
        sub={managerSubmission}
        saveTarget={houseSaveTarget}
        managerUserId={managerUserId}
        onUpdated={onUpdated}
        showToast={showToast}
      />

      <ManagerPropertyApplicationQuestionsPanel
        sub={managerSubmission}
        saveTarget={houseSaveTarget}
        managerUserId={managerUserId}
        onUpdated={onUpdated}
        showToast={showToast}
      />

      <ManagerPropertyServiceOptionsPanel
        sub={managerSubmission}
        saveTarget={houseSaveTarget}
        managerUserId={managerUserId}
        onUpdated={onUpdated}
        showToast={showToast}
      />

      <div className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 [html[data-theme=dark]_&]:portal-surface-muted">{footer}</div>

      {editorOpen && portalSub ? (
        <ManagerAddListingForm
          onClose={() => setEditorOpen(false)}
          onSubmitted={() => {
            setEditorOpen(false);
            onUpdated();
          }}
          showToast={showToast}
          skuTier={null}
          propCountBeforeSubmit={0}
          initialSubmission={portalSub.sub}
          noteKey={noteKey}
          editPendingId={portalSub.saveMode === "pending" ? portalSub.saveId : null}
          editListingId={portalSub.saveMode === "listing" ? portalSub.saveId : null}
          editRequestChangeId={portalSub.saveMode === "requestChange" ? portalSub.saveId : null}
        />
      ) : null}
    </div>
  );
}

export function ManagerHousePropertiesPanel({
  showToast,
  activeStage,
  onStageChange,
  onSendToProspect,
}: {
  showToast: (m: string) => void;
  activeStage: ManagerStageKey;
  onStageChange: (stage: ManagerStageKey) => void;
  onSendToProspect?: (listingId: string) => void;
}) {
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  useEffect(() => {
    if (!managerUserId) return;
    void syncManagerPortfolioFromServer(managerUserId, { force: true }).then(() => {
      setTick((t) => t + 1);
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => {
      void syncManagerPortfolioFromServer(managerUserId, { force: true }).then(() => setTick((t) => t + 1));
    };
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("axis-pro-relationships", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("axis-pro-relationships", on);
    };
  }, [managerUserId]);

  const kpiValues = useMemo(() => {
    void tick;
    return adminKpiCounts(managerUserId);
  }, [tick, managerUserId]);

  const stageCounts = useMemo(
    () => ({
      pending: kpiValues[0] + kpiValues[1],
      listed: kpiValues[2],
      unlisted: kpiValues[3],
      rejected: kpiValues[4],
    }),
    [kpiValues],
  );

  const rows = useMemo(() => {
    void tick;
    if (!managerUserId) return [] as Array<{ sourceBucket: AdminPropertyBucketIndex; row: AdminPropertyRow }>;
    const stage = MANAGER_STAGES.find((item) => item.key === activeStage);
    if (!stage) return [];
    return stage.buckets.flatMap((bucket) =>
      readAdminPropertyRows(bucket, managerUserId).map((row) => ({ sourceBucket: bucket, row })),
    );
  }, [tick, managerUserId, activeStage]);

  useEffect(() => {
    if (activeStage !== "pending") return;
    if ((stageCounts.pending ?? 0) === 0 && (stageCounts.listed ?? 0) > 0) {
      onStageChange("listed");
    }
  }, [activeStage, stageCounts, onStageChange]);

  if (!authReady) {
    return <p className="text-sm text-muted">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-muted">Sign in to view and manage your properties.</p>;
  }

  const renderRowDetail = (sourceBucket: AdminPropertyBucketIndex, row: AdminPropertyRow, rowKey: string) => (
    <ManagerPropertyInlineDetails
      key={rowKey}
      bucket={sourceBucket}
      row={row}
      onUpdated={() => setTick((t) => t + 1)}
      showToast={showToast}
      managerUserId={managerUserId}
      onSendToProspect={onSendToProspect}
    />
  );

  return (
    <>
      {rows.length === 0 ? (
        <PortalDataTableEmpty message={MANAGER_PROPERTY_EMPTY_COPY[activeStage]} icon="default" />
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rows.map(({ sourceBucket, row }) => {
              const rowKey = row.adminRefId + (row.listingId ?? "");
              const expanded = expandedRowKey === rowKey;

              return (
                <div key={rowKey} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                  >
                    <p className="font-medium text-foreground">{row.buildingName}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      {row.address}
                      {row.zip ? `, ${row.zip}` : ""}
                    </p>
                    <p className="mt-1.5 text-xs text-muted">
                      <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths}{" "}
                      ba · {row.neighborhood}
                    </p>
                  </button>
                  {expanded ? (
                    <div className="mt-3 border-t border-border pt-3">
                      {renderRowDetail(sourceBucket, row, rowKey)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sourceBucket, row }) => {
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
                            <p className="font-medium text-foreground">
                              {row.buildingName}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">
                              {row.address}
                              {row.zip ? `, ${row.zip}` : ""}
                            </p>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <p className="text-xs text-muted">
                              <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths}{" "}
                              ba · {row.neighborhood}
                            </p>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr key={`${rowKey}-details`} className="border-b border-border">
                            <td colSpan={2} className="bg-accent/30/40 px-4 py-4">
                              {renderRowDetail(sourceBucket, row, rowKey)}
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
  );
}

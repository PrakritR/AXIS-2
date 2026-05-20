"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import type { MockProperty } from "@/data/types";
import { ManagerListingInlineEditor } from "@/components/portal/manager-listing-inline-editor";
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
  adminKpiCounts,
  deleteManagerLiveListing,
  deleteUnlistedManagerProperty,
  listAdminRow,
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  removeRejectedProperty,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  updateRequestChangeProperty,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import {
  PROPERTY_PIPELINE_EVENT,
  deletePendingSubmissionForManager,
  mirrorLocalPropertyPipelineToServer,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  updateExtraListingFromSubmissionOnServer,
  updatePendingManagerPropertyOnServer,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import {
  legacyAdminFieldsToSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

function submissionForPendingEdit(row: ManagerPendingPropertyRow): ManagerListingSubmissionV1 {
  const raw = row.submission ? row.submission : legacyAdminFieldsToSubmission(row);
  return normalizeManagerListingSubmissionV1(raw);
}

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = Number.parseFloat(String(p.rentLabel).replace(/[^\d.]/g, "")) || 0;
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
  { key: "pending", label: "Pending review", buckets: [0, 1] as AdminPropertyBucketIndex[] },
  { key: "listed", label: "Listed", buckets: [2] as AdminPropertyBucketIndex[] },
  { key: "unlisted", label: "Unlisted", buckets: [3] as AdminPropertyBucketIndex[] },
  { key: "rejected", label: "Rejected", buckets: [4] as AdminPropertyBucketIndex[] },
] as const;

type ManagerStageKey = (typeof MANAGER_STAGES)[number]["key"];

const EMPTY_COPY: Record<ManagerStageKey, string> = {
  pending: "Nothing awaiting review.",
  listed: "No listed properties.",
  unlisted: "No unlisted properties.",
  rejected: "No rejected properties.",
};

const BANNER_COPY: Record<ManagerStageKey, string> = {
  pending: "New submissions and listings that need updates appear here until prakritramachandran@gmail.com clears them to go live.",
  listed: "Live on Rent with Axis — published listings you can unlist or remove.",
  unlisted: "These listings are off the public site. You can relist or delete them from your queue.",
  rejected: "Rejected submissions stay here until you restore them to pending or delete them permanently.",
};

function managerStageFromParam(raw: string | null): ManagerStageKey {
  return MANAGER_STAGES.some((stage) => stage.key === raw) ? (raw as ManagerStageKey) : "pending";
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

function ManagerPropertyInlineDetails({
  bucket,
  row,
  onUpdated,
  showToast,
  managerUserId,
}: {
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
}) {
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
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

  // Keep a local copy of the submission so inline edits show immediately.
  const [localSub, setLocalSub] = useState<ManagerListingSubmissionV1 | null>(null);
  const displaySub = localSub ?? portalSub?.sub ?? null;

  // Reset local copy when the underlying row changes.
  useEffect(() => {
    setLocalSub(null);
  }, [row?.adminRefId, row?.listingId]);

  const handleSaveSub = useCallback(
    (updated: ManagerListingSubmissionV1) => {
      setLocalSub(updated);
      if (!managerUserId || !portalSub) return;
      void (async () => {
        let ok = false;
        if (portalSub.saveMode === "pending") {
          ok = await updatePendingManagerPropertyOnServer(portalSub.saveId, updated, managerUserId);
        } else if (portalSub.saveMode === "requestChange") {
          ok = updateRequestChangeProperty(portalSub.saveId, managerUserId, updated);
        } else {
          ok = await updateExtraListingFromSubmissionOnServer(portalSub.saveId, managerUserId, updated);
        }
        if (!ok) {
          showToast("Could not save property changes.");
          return;
        }
        onUpdated();
      })();
    },
    [managerUserId, onUpdated, portalSub, showToast],
  );

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
  };

  if (!row || !mock) return null;
  const publicHref = publicListingHrefForPropertyRow(row);

  const footer = (
    <div className="flex flex-col gap-2">
      {bucket === 1 && row.editRequestNote?.trim() ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Requested changes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{row.editRequestNote.trim()}</p>
        </div>
      ) : null}

      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Actions</p>

      {bucket === 0 ? (
        <>
          <p className="text-xs text-slate-500">
            {row.adminRefId.startsWith("mgr-")
              ? "This listing was edited and is pending admin re-approval. Edit sections below."
              : "Listing approval is handled by prakritramachandran@gmail.com. Edit sections below while your submission is reviewed."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
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
        <>
          <p className="text-xs text-slate-500">
            Return this to your pending queue to edit and resubmit — it will appear under Pending again.
          </p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              deferCatalogMutation(() =>
                run("Returned to pending — you can edit and resubmit.", returnRequestChangeToPending(row.adminRefId, managerUserId)),
              )
            }
          >
            Move to pending & revise
          </Button>
        </>
      ) : null}

      {bucket === 2 && listingId ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              deferCatalogMutation(() => run("Listing unlisted.", unlistManagerListing(listingId, managerUserId)))
            }
          >
            Unlist
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() => {
              if (!window.confirm("Permanently delete this listing? It will be removed from your catalog.")) return;
              deferCatalogMutation(() => run("Listing deleted.", deleteManagerLiveListing(listingId, managerUserId)));
            }}
          >
            Delete listing
          </Button>
          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              View listing
            </Link>
          ) : null}
        </>
      ) : null}

      {bucket === 3 ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
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
            Relist on Rent with Axis
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() => {
              if (!window.confirm("Remove this unlisted property from your queue permanently?")) return;
              deferCatalogMutation(() =>
                run("Removed from queue.", deleteUnlistedManagerProperty(row.adminRefId, managerUserId)),
              );
            }}
          >
            Delete from queue
          </Button>
        </>
      ) : null}

      {bucket === 4 ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
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
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() =>
              deferCatalogMutation(() => run("Property removed.", removeRejectedProperty(row.adminRefId, managerUserId)))
            }
          >
            Delete property
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-32px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Details</p>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{mock.buildingName || mock.title.replace(/\s*·\s*\d+\s*rooms?\s*$/i, "")}</h3>
          <p className="mt-1 text-sm text-slate-600">{mock.address}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{mock.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.rentLabel}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {mock.beds} bd / {mock.baths} ba
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.available}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.neighborhood}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">{footer}</div>
      </div>

      {displaySub ? (
        <div className="mt-5">
          <ManagerListingInlineEditor
            sub={displaySub}
            noteKey={noteKey}
            onSaveSub={handleSaveSub}
            showToast={showToast}
            isListed={bucket === 2}
            listingId={portalSub?.listingId ?? portalSub?.saveId ?? null}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ManagerHousePropertiesPanel({ showToast }: { showToast: (m: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const activeStage = managerStageFromParam(searchParams.get("status"));

  const setActiveStage = useCallback((stage: ManagerStageKey) => {
    const next = new URLSearchParams(searchParams.toString());
    if (stage === "pending") next.delete("status");
    else next.set("status", stage);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    void syncPropertyPipelineFromServer().then(() => {
      setTick((t) => t + 1);
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, []);

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
    const timer = window.setTimeout(() => setExpandedRowKey(null), 0);
    return () => window.clearTimeout(timer);
  }, [activeStage]);

  useEffect(() => {
    if (activeStage !== "pending") return;
    if ((stageCounts.pending ?? 0) === 0 && (stageCounts.listed ?? 0) > 0) {
      setActiveStage("listed");
    }
  }, [activeStage, stageCounts, setActiveStage]);

  if (!authReady) {
    return <p className="text-sm text-slate-500">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-slate-600">Sign in to view and manage your properties.</p>;
  }

  return (
    <>
      <div className="mt-1 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {MANAGER_STAGES.map((stage) => (
          <button
            key={stage.key}
            type="button"
            onClick={() => setActiveStage(stage.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 sm:px-4 sm:text-sm ${
              activeStage === stage.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {stage.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeStage === stage.key ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
              }`}
            >
              {stageCounts[stage.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">{BANNER_COPY[activeStage]}</div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeStage]}</p>
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
                {rows.map(({ sourceBucket, row }) => {
                  const rowKey = row.adminRefId + (row.listingId ?? "");
                  const expanded = expandedRowKey === rowKey;
                  const status = rowStatus(sourceBucket);

                  return (
                    <Fragment key={rowKey}>
                      <tr className={PORTAL_TABLE_TR}>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-medium text-slate-900">
                            {row.buildingName}
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
                            {expanded ? "Hide details" : "More details"}
                          </Button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${rowKey}-details`} className="border-b border-slate-100">
                          <td colSpan={4} className="bg-slate-50/40 px-4 py-4">
                            <ManagerPropertyInlineDetails
                              bucket={sourceBucket}
                              row={row}
                              onUpdated={() => setTick((t) => t + 1)}
                              showToast={showToast}
                              managerUserId={managerUserId}
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
    </>
  );
}

"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import type { MockProperty } from "@/data/types";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
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
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import {
  PROPERTY_PIPELINE_EVENT,
  countManagerManagedPropertiesForUser,
  deletePendingSubmissionForManager,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
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

/** Lets the browser paint after click before heavy localStorage writes (better INP on delete/unlist). */
function deferCatalogMutation(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

/** Matches manager-facing stages: bucket 1 is admin “request change” / pre-list work (shown as Approved). */
const MANAGER_TAB_LABELS = ["Pending review", "Approved", "Listed", "Unlisted", "Rejected"] as const;

const EMPTY_COPY: Record<AdminPropertyBucketIndex, string> = {
  0: "Nothing awaiting review.",
  1: "Nothing in this stage.",
  2: "No listed properties.",
  3: "No unlisted properties.",
  4: "No rejected properties.",
};

const BANNER_COPY: Record<AdminPropertyBucketIndex, string> = {
  0: "New submissions and edited live listings appear here until Axis admin approves them. The public Rent with Axis catalog only shows listings after approval.",
  1: "Axis admin has approved moving forward but requested changes before the listing goes live. Revise and resubmit from here.",
  2: "Live on Rent with Axis — published listings you can unlist or remove.",
  3: "These listings are off the public site. You can relist or delete them from your queue.",
  4: "Rejected submissions stay here until you restore them to pending or delete them permanently.",
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
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);

  useEffect(() => {
    if (!row) {
      setListingEditorOpen(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/manager/subscription", { credentials: "include" });
        const body = (await res.json()) as { tier?: string | null };
        if (!cancelled && res.ok) setSkuTier(body.tier ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const editorInitial = useMemo(() => {
    if (!listingEditorOpen || !managerUserId || !row) return null;
    if (bucket === 0) {
      if (row.adminRefId.startsWith("mgr-")) {
        const p = readExtraListingsForUser(managerUserId).find((x) => x.id === row.adminRefId);
        return p ? submissionForListedEdit(p) : null;
      }
      const p = readPendingManagerPropertiesForUser(managerUserId).find((r) => r.id === row.adminRefId);
      return p ? submissionForPendingEdit(p) : null;
    }
    if (bucket === 2 && row.listingId) {
      const p = readExtraListingsForUser(managerUserId).find((x) => x.id === row.listingId);
      return p ? submissionForListedEdit(p) : null;
    }
    return null;
  }, [listingEditorOpen, managerUserId, row, bucket]);

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

  const openInlineEditor = () => {
    if (!managerUserId) {
      showToast("Sign in to edit.");
      return;
    }
    if (bucket === 0) {
      if (row.adminRefId.startsWith("mgr-")) {
        const hit = readExtraListingsForUser(managerUserId).find((x) => x.id === row.adminRefId);
        if (!hit) {
          showToast("Could not load this listing.");
          return;
        }
      } else {
        const hit = readPendingManagerPropertiesForUser(managerUserId).find((r) => r.id === row.adminRefId);
        if (!hit) {
          showToast("Could not load this submission.");
          return;
        }
      }
    }
    if (bucket === 2 && row.listingId) {
      const hit = readExtraListingsForUser(managerUserId).find((x) => x.id === row.listingId);
      if (!hit) {
        showToast("Could not load this listing.");
        return;
      }
    }
    setListingEditorOpen(true);
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

      {bucket === 0 ? (
        <>
          <p className="text-xs text-slate-500">
            {row.adminRefId.startsWith("mgr-")
              ? "This listing was edited and is off the public site until Axis admin approves it again. You can keep editing here."
              : "Listing approval is handled by Axis admin. Edit below without leaving this preview; only admin can approve, request changes, or reject a listing."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={openInlineEditor}>
              {row.adminRefId.startsWith("mgr-") ? "Edit listing" : "Edit submission"}
            </Button>
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
          <Button type="button" variant="outline" className="rounded-full" onClick={openInlineEditor}>
            Edit listing
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
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-32px_rgba(15,23,42,0.45)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Details</p>
            <h3 className="mt-2 text-base font-semibold text-slate-950">{mock.title}</h3>
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
      </div>
      {listingEditorOpen && editorInitial && managerUserId ? (
        <ManagerAddListingForm
          key={`preview-edit-${bucket}-${row.adminRefId}-${row.listingId ?? "pending"}`}
          showToast={showToast}
          skuTier={skuTier}
          propCountBeforeSubmit={countManagerManagedPropertiesForUser(managerUserId)}
          editPendingId={bucket === 0 && !row.adminRefId.startsWith("mgr-") ? row.adminRefId : null}
          editListingId={
            bucket === 2 && row.listingId
              ? row.listingId
              : bucket === 0 && row.adminRefId.startsWith("mgr-")
                ? (row.listingId ?? row.adminRefId)
                : null
          }
          initialSubmission={editorInitial}
          onClose={() => setListingEditorOpen(false)}
          onSubmitted={() => {
            setListingEditorOpen(false);
            onUpdated();
          }}
        />
      ) : null}
    </>
  );
}

export function ManagerHousePropertiesPanel({ showToast }: { showToast: (m: string) => void }) {
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<AdminPropertyBucketIndex>(0);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const kpiValues = useMemo(() => adminKpiCounts(managerUserId), [tick, managerUserId]);

  const rows = useMemo(
    () => (managerUserId ? readAdminPropertyRows(activeBucket, managerUserId) : []),
    [tick, managerUserId, activeBucket],
  );

  useEffect(() => {
    setExpandedRowKey(null);
  }, [activeBucket]);

  const status = rowStatus(activeBucket);

  if (!authReady) {
    return <p className="text-sm text-slate-500">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-slate-600">Sign in to view and manage your properties.</p>;
  }

  return (
    <>
      <div className="mt-1 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {MANAGER_TAB_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveBucket(i as AdminPropertyBucketIndex)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 sm:px-4 sm:text-sm ${
              activeBucket === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeBucket === i ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
              }`}
            >
              {kpiValues[i]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">{BANNER_COPY[activeBucket]}</div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeBucket]}</p>
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
                              bucket={activeBucket}
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

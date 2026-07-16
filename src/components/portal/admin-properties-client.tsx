"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { ListingPreviewScrollShell } from "@/components/marketing/listing-preview-scroll-shell";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { getListingRichContent } from "@/data/listing-rich-content";
import { useListingContactSmsPhone } from "@/hooks/use-listing-contact-sms-phone";
import { withListingContactSmsPhone } from "@/lib/listing-contact-sms";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { PROPERTY_PIPELINE_EVENT, syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  adminKpiCounts,
  adminPropertyRentDisplayLabel,
  listAdminRow,
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";

/** Admin inventory tabs — listed ↔ unlisted only (no approval queue). */
const KPI_TABS: { bucket: AdminPropertyBucketIndex; label: string }[] = [
  { bucket: 2, label: "Listed" },
  { bucket: 3, label: "Unlisted" },
];

const TAB_PARAM_BY_BUCKET: Partial<Record<AdminPropertyBucketIndex, string>> = {
  2: "listed",
  3: "unlisted",
};

function bucketFromTabParam(tab: string | null): AdminPropertyBucketIndex | null {
  if (!tab) return null;
  if (tab === "pending" || tab === "request-change" || tab === "rejected") return 2;
  const entry = Object.entries(TAB_PARAM_BY_BUCKET).find(([, value]) => value === tab);
  return entry ? (Number(entry[0]) as AdminPropertyBucketIndex) : null;
}

const EMPTY_COPY: Partial<Record<AdminPropertyBucketIndex, string>> = {
  2: "No listed properties.",
  3: "No unlisted properties.",
};

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
  const contactSmsPhone = useListingContactSmsPhone({
    listingId,
    ownerManagerUserId: row.managerUserId,
  });
  const previewProperty = useMemo(
    () => withListingContactSmsPhone(mock, contactSmsPhone),
    [mock, contactSmsPhone],
  );
  const rich = useMemo(() => getListingRichContent(previewProperty), [previewProperty]);
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
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Actions</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {bucket === 2 && listingId ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            data-attr="admin-property-unlist"
            onClick={() => run("Unlisted property.", unlistManagerListing(listingId))}
          >
            Unlist
          </Button>
        ) : null}

        {bucket === 3 ? (
          <Button
            type="button"
            className="rounded-full"
            data-attr="admin-property-list"
            onClick={() => {
              const id = listAdminRow(row);
              run(id ? "Property listed." : "Could not list property.", Boolean(id));
            }}
          >
            List
          </Button>
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
      <ListingPreviewScrollShell className="portal-desktop-scroll-panel max-h-[min(70vh,640px)] rounded-2xl border border-border">
        <ListingDetailSections property={previewProperty} rich={rich} previewModal hidePreviewSubnav />
      </ListingPreviewScrollShell>
      <div className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">{footer}</div>
    </div>
  );
}

export function AdminPropertiesClient() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const [activeKpi, setActiveKpi] = useState<AdminPropertyBucketIndex>(2);
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = bucketFromTabParam(searchParams.get("tab"));
    if (fromUrl != null) setActiveKpi(fromUrl);
  }, [searchParams]);

  useEffect(() => {
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
      subtitle="Listed properties appear on Rent with PropLane. Unlist to take a property off the public catalog."
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={kpiTabs}
            activeId={String(activeKpi)}
            onChange={(id) => {
              setActiveKpi(Number(id) as AdminPropertyBucketIndex);
              setExpandedRowKey(null);
            }}
          />
        </ManagerPortalFilterRow>
      }
    >
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden md:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} w-[45%] text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className={`${PORTAL_TABLE_TD} text-muted`}>
                    {EMPTY_COPY[activeKpi] ?? "No properties."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
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
                          <PortalTableInlineExpand expanded={expanded} className="break-words font-medium text-foreground">
                            {row.buildingName} · {row.unitLabel}
                          </PortalTableInlineExpand>
                          <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
                            {row.address}
                            {row.zip ? `, ${row.zip}` : ""}
                          </p>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="break-words text-xs text-muted">
                            <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> ·{" "}
                            {row.beds} bd / {row.baths} ba · {row.neighborhood}
                          </p>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={2} className={PORTAL_TABLE_DETAIL_CELL}>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY_COPY[activeKpi] ?? "No properties."}</p>
        ) : (
          rows.map((row) => {
            const rowKey = row.adminRefId + (row.listingId ?? "");
            const expanded = expandedRowKey === rowKey;
            return (
              <div key={rowKey} className={PORTAL_MOBILE_CARD_CLASS}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                >
                  <PortalTableInlineExpand expanded={expanded} className="font-medium text-foreground">
                    {row.buildingName} · {row.unitLabel}
                  </PortalTableInlineExpand>
                </button>
                <p className="mt-1 text-xs text-muted">{row.address || "—"}</p>
                {expanded ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <AdminPropertyInlineDetails
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
          })
        )}
      </div>
    </ManagerPortalPageShell>
  );
}

"use client";

import { Calendar } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell, PORTAL_HEADER_PRIMARY_ACTION_BTN } from "@/components/portal/portal-metrics";
import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { PortalListAddRow, PORTAL_LIST_ADD_ROW_WRAP_CLASS } from "@/components/portal/portal-list-add-row";
import { PortalPropertyRecordRow } from "@/components/portal/portal-record-row";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";
import { ResidentScheduleTourModal } from "@/components/portal/resident-schedule-tour-modal";
import { PORTAL_LIST_PAGE_BODY } from "@/components/portal/portal-inbox-ui";
import { LocalDestinationNav } from "@/components/ui/destination-nav";
import { formatRangeLabel } from "@/lib/demo-admin-scheduling";
import { formatTourContactPhoneDisplay } from "@/lib/tour-contact-quality";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  residentTourDetailHref,
  residentTourListHref,
  type ResidentTourBucketId,
} from "@/lib/portal-detail-routes";
import { stripPropertyRoomCountSuffix } from "@/lib/portal-mobile-preview";
import {
  countResidentToursByBucket,
  residentTourBucketForView,
  sortResidentTourViews,
} from "@/lib/resident-tour-list";
import type { ResidentTourView } from "@/lib/tour-resident-link.server";

const TOUR_DETAIL_TABS = [
  { id: "details", label: "Tour details" },
  { id: "updates", label: "Updates" },
] as const;

type TourDetailTabId = (typeof TOUR_DETAIL_TABS)[number]["id"];

function statusLabel(tour: ResidentTourView): string {
  if (tour.confirmed) return "Confirmed";
  const status = tour.status.trim().toLowerCase();
  if (status === "pending") return "Pending approval";
  if (status === "declined") return "Declined";
  return tour.status || "Pending";
}

function statusBadgeClass(tour: ResidentTourView): string {
  if (tour.confirmed) return "portal-badge-success";
  if (tour.status.trim().toLowerCase() === "declined") return "portal-badge-danger";
  return "portal-badge-pending";
}

function tourWhenLabel(tour: ResidentTourView): string {
  const whenStart = tour.confirmedStart ?? tour.proposedStart;
  const whenEnd = tour.confirmedEnd ?? tour.proposedEnd;
  return whenStart && whenEnd ? formatRangeLabel(whenStart, whenEnd) : "Time to be confirmed";
}

function TourStatusBadge({ tour }: { tour: ResidentTourView }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)] ${statusBadgeClass(tour)}`}
    >
      {statusLabel(tour)}
    </span>
  );
}

function TourOutcomeBanner({ tour }: { tour: ResidentTourView }) {
  if (tour.confirmed) {
    return (
      <div className="rounded-2xl border px-4 py-4 text-sm portal-banner-success">
        <p className="font-semibold text-foreground">Tour confirmed</p>
        <p className="mt-1.5 text-muted">
          Your tour{tour.propertyTitle ? ` at ${tour.propertyTitle}` : ""} is confirmed for{" "}
          <span className="font-medium text-foreground">{tourWhenLabel(tour)}</span>. Check Communication for any
          last-minute updates from your property manager.
        </p>
      </div>
    );
  }
  if (tour.status.trim().toLowerCase() === "declined") {
    return (
      <div className="rounded-2xl border px-4 py-4 text-sm portal-banner-danger">
        <p className="font-semibold text-foreground">Tour request declined</p>
        <p className="mt-1.5 text-muted">
          This tour request{tour.propertyTitle ? ` for ${tour.propertyTitle}` : ""} was not approved. You can schedule
          another time or browse other homes.
        </p>
      </div>
    );
  }
  return null;
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function TourDetailBody({
  tour,
  basePath,
  detailTab,
  onDetailTabChange,
}: {
  tour: ResidentTourView;
  basePath: string;
  detailTab: TourDetailTabId;
  onDetailTabChange: (tab: TourDetailTabId) => void;
}) {
  const applyHref = tour.propertyId
    ? buildRentalApplyHref({
        propertyId: tour.propertyId,
        listingRoomName: tour.roomLabel?.trim() || undefined,
      })
    : "/resident/applications/apply";

  return (
    <div className="space-y-5 px-1 pb-8">
      <TourOutcomeBanner tour={tour} />

      <PortalListControlStack
        destinationRow={
          <LocalDestinationNav
            items={TOUR_DETAIL_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
            activeId={detailTab}
            onChange={(id) => onDetailTabChange(id as TourDetailTabId)}
            ariaLabel="Tour detail sections"
          />
        }
      />

      {detailTab === "details" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-accent/25 px-4 py-4 text-sm">
            <p className="font-semibold text-foreground">{tourWhenLabel(tour)}</p>
            <div className="mt-2">
              <TourStatusBadge tour={tour} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Property" value={tour.propertyTitle} />
            <DetailField label="Room" value={tour.roomLabel} />
            <DetailField label="Host" value={tour.managerLabel} />
            <DetailField label="Name" value={tour.guestName} />
            <DetailField label="Email" value={tour.guestEmail} />
            <DetailField
              label="Phone"
              value={tour.guestPhone ? formatTourContactPhoneDisplay(tour.guestPhone) : null}
            />
          </div>

          {tour.notes?.trim() ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm shadow-[var(--shadow-sm)]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Notes</p>
              <p className="mt-1.5 whitespace-pre-wrap text-muted">{tour.notes}</p>
            </div>
          ) : null}

          {tour.instructions?.trim() ? (
            <div className="rounded-2xl border px-4 py-4 text-sm portal-banner-info">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Before you arrive</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sky-950">{tour.instructions}</p>
            </div>
          ) : null}

          <PortalSectionActionRow variant="header">
            <Button type="button" variant="primary" className="rounded-full" asChild>
              <Link href={applyHref} data-attr="resident-tour-apply">
                Apply for this property
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-full" asChild>
              <Link href={`${basePath}/communication/active`} data-attr="resident-tour-message-manager">
                Message your manager
              </Link>
            </Button>
          </PortalSectionActionRow>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm shadow-[var(--shadow-sm)]">
            <p className="font-semibold text-foreground">What happens next</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>Your property manager reviews the requested time.</li>
              <li>You receive a confirmation email and inbox message once the tour is approved.</li>
              <li>Check Communication for replies from your property team.</li>
            </ul>
          </div>
          {tour.requestedWindows.length > 1 ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm shadow-[var(--shadow-sm)]">
              <p className="font-semibold text-foreground">Requested windows</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {tour.requestedWindows.map((window) => (
                  <li key={`${window.start}-${window.end}`}>{formatRangeLabel(window.start, window.end)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResidentScheduleTourAddRow({ onSchedule }: { onSchedule: () => void }) {
  return (
    <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
      <PortalListAddRow
        label="Schedule tour"
        hint="Browse homes"
        icon={Calendar}
        onClick={onSchedule}
        dataAttr="resident-tour-schedule-add"
      />
    </div>
  );
}

export function ResidentTourPanel({
  basePath = "/resident",
  bucket: bucketProp = "pending",
  inquiryId,
}: {
  basePath?: string;
  bucket?: ResidentTourBucketId;
  inquiryId?: string;
}) {
  const navigate = usePortalNavigate();
  const [tours, setTours] = useState<ResidentTourView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TourDetailTabId>("details");
  const [bucket, setBucket] = useState<ResidentTourBucketId>(bucketProp);
  const [prevBucketProp, setPrevBucketProp] = useState(bucketProp);
  const [scheduleTourOpen, setScheduleTourOpen] = useState(false);

  if (bucketProp !== prevBucketProp) {
    setPrevBucketProp(bucketProp);
    setBucket(bucketProp);
  }

  const openScheduleTour = () => setScheduleTourOpen(true);

  const loadTours = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/portal-resident-tours", { credentials: "include" });
      if (res.status === 401) {
        setTours([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        tours?: ResidentTourView[];
        error?: string;
        degraded?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load tours.");
      setTours(sortResidentTourViews(Array.isArray(data.tours) ? data.tours : []));
      if (data.degraded) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tours.");
      setTours([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTours();
  }, [loadTours]);

  useEffect(() => {
    if (!inquiryId) return;
    const refresh = () => void loadTours();
    const interval = window.setInterval(refresh, 30_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [inquiryId, loadTours]);

  const detailTour = useMemo(
    () => (inquiryId ? tours.find((tour) => tour.inquiryId === inquiryId) ?? null : null),
    [inquiryId, tours],
  );

  useEffect(() => {
    if (!inquiryId || loading) return;
    if (!detailTour) {
      navigate(residentTourListHref(basePath, bucket));
      return;
    }
    const actualBucket = residentTourBucketForView(detailTour);
    if (actualBucket !== bucket) {
      navigate(residentTourDetailHref(basePath, actualBucket, detailTour.inquiryId));
    }
  }, [basePath, bucket, detailTour, inquiryId, loading, navigate]);

  const counts = useMemo(() => countResidentToursByBucket(tours), [tours]);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "confirmed" as const, label: "Confirmed", count: counts.confirmed },
        { id: "declined" as const, label: "Declined", count: counts.declined },
      ] as const,
    [counts],
  );

  const toursForBucket = useMemo(
    () => tours.filter((tour) => residentTourBucketForView(tour) === bucket),
    [bucket, tours],
  );

  const scheduleTourButton = (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_PRIMARY_ACTION_BTN}`}
      data-attr="resident-tour-schedule"
      onClick={openScheduleTour}
    >
      Schedule a tour
    </Button>
  );

  const filterRow = (
    <LocalDestinationNav
      items={tabs.map((t) => ({
        id: t.id,
        label: t.label,
        count: t.count,
        dataAttr: `resident-tour-bucket-${t.id}`,
      }))}
      activeId={bucket}
      onChange={(id) => {
        const next = id as ResidentTourBucketId;
        setBucket(next);
        navigate(residentTourListHref(basePath, next));
      }}
      ariaLabel="Tour status"
    />
  );

  const scheduleTourAddRow = <ResidentScheduleTourAddRow onSchedule={openScheduleTour} />;

  const renderTourList = () => (
    <>
      <PortalListControlStack className="mb-2 max-lg:mb-2" destinationRow={filterRow} />

      {loading ? (
        <PortalEmptyState title="Loading your tours…" icon={<Calendar className="h-[26px] w-[26px]" strokeWidth={1.75} />} />
      ) : (
        <>
          {error ? (
            <p className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>
          ) : null}
          {toursForBucket.length > 0 ? (
            <div className={PORTAL_LIST_PAGE_BODY} data-attr="resident-tour-list">
              {toursForBucket.map((tour) => {
                const address = [
                  tour.roomLabel ? `Room ${tour.roomLabel}` : null,
                  tour.managerLabel ? `Host ${tour.managerLabel}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <PortalPropertyRecordRow
                    key={tour.inquiryId}
                    title={stripPropertyRoomCountSuffix(tour.propertyTitle ?? "Property tour")}
                    address={address || tourWhenLabel(tour)}
                    summary={tourWhenLabel(tour)}
                    badge={<TourStatusBadge tour={tour} />}
                    onOpen={() =>
                      navigate(residentTourDetailHref(basePath, residentTourBucketForView(tour), tour.inquiryId))
                    }
                    dataAttr="resident-tour-list-row"
                  />
                );
              })}
            </div>
          ) : null}
          {scheduleTourAddRow}
        </>
      )}
    </>
  );

  if (inquiryId) {
    if (loading) {
      return (
        <ManagerPortalPageShell title="Tour" hideTitleOnMobileNav>
          <PortalEmptyState title="Loading your tour…" icon={<Calendar className="h-[26px] w-[26px]" strokeWidth={1.75} />} />
        </ManagerPortalPageShell>
      );
    }
    if (!detailTour) return null;
    return (
      <PortalRecordDetailPage
        pageTitle="Tour"
        title={stripPropertyRoomCountSuffix(detailTour.propertyTitle ?? "Property tour")}
        subtitle={tourWhenLabel(detailTour)}
        backHref={residentTourListHref(basePath, residentTourBucketForView(detailTour))}
        hideBackText
        bareHeader
        dataAttrBack="resident-tour-detail-back"
        inlineActions
        actions={<TourStatusBadge tour={detailTour} />}
      >
        <TourDetailBody
          tour={detailTour}
          basePath={basePath}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
        />
      </PortalRecordDetailPage>
    );
  }

  return (
    <>
      <ResidentScheduleTourModal
        open={scheduleTourOpen}
        onClose={() => setScheduleTourOpen(false)}
        onScheduled={() => void loadTours()}
      />
      <ManagerPortalPageShell
      title="Tour"
      hideTitleOnMobileNav
      titleAside={scheduleTourButton}
      compactFilterRow
    >
      {renderTourList()}
    </ManagerPortalPageShell>
    </>
  );
}

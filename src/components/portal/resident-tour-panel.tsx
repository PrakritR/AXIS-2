"use client";

import { Calendar } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { ManagerPortalPageShell, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";
import { LocalDestinationNav } from "@/components/ui/destination-nav";
import { formatRangeLabel } from "@/lib/demo-admin-scheduling";
import { formatTourContactPhoneDisplay } from "@/lib/tour-contact-quality";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { residentBrowseForTourHref } from "@/lib/resident-public-nav";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import type { ResidentTourView } from "@/lib/tour-resident-link.server";

const TOUR_DETAIL_TABS = [
  { id: "details", label: "Tour details" },
  { id: "updates", label: "Updates" },
] as const;

type TourDetailTabId = (typeof TOUR_DETAIL_TABS)[number]["id"];

function statusLabel(tour: ResidentTourView): string {
  if (tour.confirmed) return "Confirmed";
  const status = tour.status.trim().toLowerCase();
  if (status === "pending") return "Pending manager approval";
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

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ResidentTourDetail({
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
    <PortalRecordDetailPage
      title={tour.propertyTitle ?? "Property tour"}
      subtitle={tourWhenLabel(tour)}
      backHref={`${basePath}/tour`}
      backLabel="All tours"
      dataAttrBack="resident-tour-detail-back"
      actions={<TourStatusBadge tour={tour} />}
    >
      <div className="space-y-5 px-1 pb-8">
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
                <Link
                  href={`${basePath}/communication/inbox/unopened`}
                  data-attr="resident-tour-message-manager"
                >
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
    </PortalRecordDetailPage>
  );
}

function ResidentTourEmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="space-y-4">
      <PortalDataTableEmpty
        icon={<Calendar className="h-[26px] w-[26px]" strokeWidth={1.75} aria-hidden />}
        message="No tours yet. Browse homes and schedule a visit — your requests will show up here."
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          data-attr="resident-tour-browse-homes"
          onClick={onBrowse}
        >
          Browse homes
        </Button>
      </div>
    </div>
  );
}

export function ResidentTourPanel({
  basePath = "/resident",
  inquiryId,
}: {
  basePath?: string;
  inquiryId?: string;
}) {
  const navigate = usePortalNavigate();
  const [tours, setTours] = useState<ResidentTourView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TourDetailTabId>("details");

  const browseHref = residentBrowseForTourHref();

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
      setTours(Array.isArray(data.tours) ? data.tours : []);
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

  const detailTour = useMemo(
    () => (inquiryId ? tours.find((tour) => tour.inquiryId === inquiryId) ?? null : null),
    [inquiryId, tours],
  );

  useEffect(() => {
    if (!inquiryId || loading) return;
    if (!detailTour) {
      navigate(`${basePath}/tour`);
    }
  }, [basePath, detailTour, inquiryId, loading, navigate]);

  const scheduleTourButton = (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
      data-attr="resident-tour-schedule"
      onClick={() => navigate(browseHref)}
    >
      Schedule a tour
    </Button>
  );

  const tourList = (
    <DataList
      rows={tours.map((tour) => {
        const subtitle = [tour.roomLabel ? `Room ${tour.roomLabel}` : null, tour.managerLabel ? `Host ${tour.managerLabel}` : null]
          .filter(Boolean)
          .join(" · ");
        return {
          id: tour.inquiryId,
          data: tour,
          primary: tour.propertyTitle ?? "Property tour",
          meta: subtitle || tourWhenLabel(tour),
          trailing: <TourStatusBadge tour={tour} />,
          onClick: () => navigate(`${basePath}/tour/${encodeURIComponent(tour.inquiryId)}`),
        };
      })}
      columns={[
        { id: "property", header: "Property", cell: (tour) => tour.propertyTitle ?? "Property tour" },
        { id: "when", header: "When", cell: (tour) => tourWhenLabel(tour) },
        { id: "room", header: "Room", cell: (tour) => tour.roomLabel || "—" },
        { id: "status", header: "Status", cell: (tour) => <TourStatusBadge tour={tour} /> },
      ]}
      emptyState={<ResidentTourEmptyState onBrowse={() => navigate(browseHref)} />}
    />
  );

  if (inquiryId) {
    if (loading) {
      return (
        <ManagerPortalPageShell title="Tour details" subtitle="Loading your tour…" hideTitleOnMobileNav>
          <PortalEmptyState title="Loading your tour…" icon={<Calendar className="h-[26px] w-[26px]" strokeWidth={1.75} />} />
        </ManagerPortalPageShell>
      );
    }
    if (!detailTour) return null;
    return (
      <ManagerPortalPageShell title="Tour details" hideTitleOnMobileNav>
        <ResidentTourDetail
          tour={detailTour}
          basePath={basePath}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
        />
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell
      title="Tour"
      subtitle="Your scheduled property tours and requested times."
      hideTitleOnMobileNav
      titleTrailing={scheduleTourButton}
    >
      <div className="mb-3 md:hidden [&_button]:w-full" data-slot="resident-tour-mobile-actions">
        {scheduleTourButton}
      </div>

      {loading ? (
        <PortalEmptyState title="Loading your tours…" icon={<Calendar className="h-[26px] w-[26px]" strokeWidth={1.75} />} />
      ) : error ? (
        <div className="space-y-4">
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>
          <ResidentTourEmptyState onBrowse={() => navigate(browseHref)} />
        </div>
      ) : tours.length === 0 ? (
        <ResidentTourEmptyState onBrowse={() => navigate(browseHref)} />
      ) : (
        <div data-attr="resident-tour-list">{tourList}</div>
      )}
    </ManagerPortalPageShell>
  );
}

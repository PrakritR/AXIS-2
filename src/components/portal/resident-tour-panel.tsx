"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { LocalDestinationNav } from "@/components/ui/destination-nav";
import { formatRangeLabel } from "@/lib/demo-admin-scheduling";
import { formatTourContactPhoneDisplay } from "@/lib/tour-contact-quality";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
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

function statusClass(tour: ResidentTourView): string {
  if (tour.confirmed) return "bg-emerald-100 text-emerald-800";
  if (tour.status.trim().toLowerCase() === "declined") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

function tourWhenLabel(tour: ResidentTourView): string {
  const whenStart = tour.confirmedStart ?? tour.proposedStart;
  const whenEnd = tour.confirmedEnd ?? tour.proposedEnd;
  return whenStart && whenEnd ? formatRangeLabel(whenStart, whenEnd) : "Time to be confirmed";
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
      actions={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tour)}`}>
          {statusLabel(tour)}
        </span>
      }
    >
      <div className="space-y-5 px-1 pb-8">
        <PortalListControlStack>
          <LocalDestinationNav
            items={TOUR_DETAIL_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
            activeId={detailTab}
            onChange={(id) => onDetailTabChange(id as TourDetailTabId)}
            ariaLabel="Tour detail sections"
          />
        </PortalListControlStack>

        {detailTab === "details" ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-accent/30 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">{tourWhenLabel(tour)}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {statusLabel(tour)}
              </p>
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
              <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Notes</p>
                <p className="mt-1.5 whitespace-pre-wrap text-muted">{tour.notes}</p>
              </div>
            ) : null}

            {tour.instructions?.trim() ? (
              <div className="rounded-2xl border px-4 py-3 text-sm portal-banner-info">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Before you arrive</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sky-950">{tour.instructions}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Link
                href={applyHref}
                data-attr="resident-tour-apply"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
              >
                Apply for this property
              </Link>
              <Link
                href={`${basePath}/communication/inbox/unopened`}
                data-attr="resident-tour-message-manager"
                className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-accent/30"
              >
                Message your manager
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm">
              <p className="font-semibold text-foreground">What happens next</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
                <li>Your property manager reviews the requested time.</li>
                <li>You receive a confirmation email and inbox message once the tour is approved.</li>
                <li>Check Communication for replies from your property team.</li>
              </ul>
            </div>
            {tour.requestedWindows.length > 1 ? (
              <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm">
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

  const loadTours = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/portal-resident-tours", { credentials: "include" });
      if (res.status === 401) {
        setTours([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { tours?: ResidentTourView[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load tours.");
      setTours(Array.isArray(data.tours) ? data.tours : []);
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

  if (inquiryId) {
    if (loading) {
      return (
        <ManagerPortalPageShell title="Tour details" subtitle="Loading your tour…" hideTitleOnMobileNav>
          <p className="text-sm text-muted">Loading your tour…</p>
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
    >
      {loading ? (
        <p className="text-sm text-muted">Loading your tours…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : tours.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No tours linked yet</p>
          <p className="mt-2 text-sm text-muted">
            When you book a tour and link it to your account, it will appear here with status updates and confirmed
            times.
          </p>
        </div>
      ) : (
        <ul className="space-y-4" data-attr="resident-tour-list">
          {tours.map((tour) => (
            <li key={tour.inquiryId}>
              <button
                type="button"
                data-attr="resident-tour-row"
                onClick={() => navigate(`${basePath}/tour/${encodeURIComponent(tour.inquiryId)}`)}
                className="w-full rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{tour.propertyTitle ?? "Property tour"}</p>
                    {tour.roomLabel ? <p className="mt-0.5 text-sm text-muted">Room: {tour.roomLabel}</p> : null}
                    {tour.managerLabel ? <p className="mt-0.5 text-sm text-muted">Host: {tour.managerLabel}</p> : null}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tour)}`}>
                    {statusLabel(tour)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-medium">When:</span> {tourWhenLabel(tour)}
                </p>
                <p className="mt-2 text-sm font-semibold text-primary">View tour details</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ManagerPortalPageShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { formatRangeLabel } from "@/lib/demo-admin-scheduling";

type ResidentTourView = {
  inquiryId: string;
  tourGroupId: string | null;
  status: string;
  propertyId: string | null;
  propertyTitle: string | null;
  roomLabel: string | null;
  managerLabel: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  requestedWindows: Array<{ start: string; end: string }>;
  createdAt: string | null;
  confirmed: boolean;
  confirmedStart: string | null;
  confirmedEnd: string | null;
};

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

export function ResidentTourPanel() {
  const [tours, setTours] = useState<ResidentTourView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ManagerPortalPageShell title="Tour" subtitle="Your scheduled property tours and requested times.">
      {loading ? (
        <p className="text-sm text-muted">Loading your tours…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : tours.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No tours linked yet</p>
          <p className="mt-2 text-sm text-muted">
            When you book a tour and link it to your account, it will appear here with status updates and confirmed times.
          </p>
        </div>
      ) : (
        <ul className="space-y-4" data-attr="resident-tour-list">
          {tours.map((tour) => {
            const whenStart = tour.confirmedStart ?? tour.proposedStart;
            const whenEnd = tour.confirmedEnd ?? tour.proposedEnd;
            const whenLabel =
              whenStart && whenEnd ? formatRangeLabel(whenStart, whenEnd) : "Time to be confirmed";
            return (
              <li
                key={tour.inquiryId}
                className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                data-attr="resident-tour-row"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {tour.propertyTitle ?? "Property tour"}
                    </p>
                    {tour.roomLabel ? (
                      <p className="mt-0.5 text-sm text-muted">Room: {tour.roomLabel}</p>
                    ) : null}
                    {tour.managerLabel ? (
                      <p className="mt-0.5 text-sm text-muted">Host: {tour.managerLabel}</p>
                    ) : null}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tour)}`}>
                    {statusLabel(tour)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-medium">When:</span> {whenLabel}
                </p>
                {tour.requestedWindows.length > 1 ? (
                  <div className="mt-2 text-sm text-muted">
                    <p className="font-medium text-foreground">Requested windows</p>
                    <ul className="mt-1 list-disc pl-5">
                      {tour.requestedWindows.map((window) => (
                        <li key={`${window.start}-${window.end}`}>
                          {formatRangeLabel(window.start, window.end)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </ManagerPortalPageShell>
  );
}

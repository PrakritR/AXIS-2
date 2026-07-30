"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { managerPropertyAvailabilityStorageKey } from "@/lib/demo-admin-scheduling";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";

export function ManagerPropertyTourPanel({
  listingId,
  managerUserId,
  propertyLabel,
}: {
  listingId: string;
  managerUserId: string | null;
  propertyLabel: string;
  showToast?: (message: string) => void;
}) {
  const [sendTourOpen, setSendTourOpen] = useState(false);

  const storageKey = useMemo(() => {
    if (!managerUserId || !listingId) return null;
    return managerPropertyAvailabilityStorageKey(managerUserId, listingId);
  }, [managerUserId, listingId]);

  const shareProperties = useMemo<ManagerPropertyFilterOption[]>(
    () => [{ id: listingId, label: propertyLabel }],
    [listingId, propertyLabel],
  );

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-accent/30 px-4 py-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="listing-send-tour-link"
            onClick={() => setSendTourOpen(true)}
          >
            Send tour link
          </Button>
        </div>
        <div className="px-4 py-2">
          <PortalCalendarPanels
            key={storageKey ?? "property-calendar-unavailable"}
            storageKey={storageKey}
            compactAvailability
            defaultViewMode="week"
            availabilityHeading="Your availability"
            tourScopeLabel={propertyLabel}
            unavailableMessage="Sign in to manage tour availability for this property."
            scheduledTourFilter={
              managerUserId
                ? {
                    viewerUserId: managerUserId,
                    propertyId: listingId,
                    peers: [],
                  }
                : undefined
            }
          />
        </div>
      </div>

      <ShareLeadLinkModal
        open={sendTourOpen}
        onClose={() => setSendTourOpen(false)}
        kind="tour"
        properties={shareProperties}
        preselectedPropertyId={listingId}
      />
    </>
  );
}

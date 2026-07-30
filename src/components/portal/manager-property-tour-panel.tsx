"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
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
      <PortalPropertyDetailSection
        actions={
          <Button
            type="button"
            variant="outline"
            className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
            data-attr="listing-send-tour-link"
            onClick={() => setSendTourOpen(true)}
          >
            Send tour link
          </Button>
        }
        contentClassName="px-4 py-2"
      >
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
      </PortalPropertyDetailSection>

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

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
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
  const [expanded, setExpanded] = useState(true);
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
      <PortalCollapsibleSection
        title="Calendar"
        expanded={expanded}
        onExpandedChange={setExpanded}
        collapsible
        headerActionsInline
        toggleDataAttr="property-calendar-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="listing-send-tour-link"
            onClick={(e) => {
              e.stopPropagation();
              setSendTourOpen(true);
            }}
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
      </PortalCollapsibleSection>

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

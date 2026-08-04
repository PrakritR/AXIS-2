"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import { PortalPropertyDetailSection } from "@/components/portal/portal-property-detail-section";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { managerPropertyAvailabilityStorageKey } from "@/lib/demo-admin-scheduling";
import { useGoogleCalendarBusyMeetings } from "@/hooks/use-google-calendar-busy";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";

export function ManagerPropertyTourPanel({
  listingId,
  managerUserId,
  propertyLabel,
  onRegisterSendTour,
}: {
  listingId: string;
  managerUserId: string | null;
  propertyLabel: string;
  showToast?: (message: string) => void;
  /** Parent header "Send tour link" — same handler as the former section footer button. */
  onRegisterSendTour?: (openSendTour: (() => void) | null) => void;
}) {
  const [sendTourOpen, setSendTourOpen] = useState(false);

  const openSendTour = useCallback(() => setSendTourOpen(true), []);

  useEffect(() => {
    onRegisterSendTour?.(openSendTour);
    return () => onRegisterSendTour?.(null);
  }, [onRegisterSendTour, openSendTour]);

  const storageKey = useMemo(() => {
    if (!managerUserId || !listingId) return null;
    return managerPropertyAvailabilityStorageKey(managerUserId, listingId);
  }, [managerUserId, listingId]);

  const shareProperties = useMemo<ManagerPropertyFilterOption[]>(
    () => [{ id: listingId, label: propertyLabel }],
    [listingId, propertyLabel],
  );

  // This is the screen where a manager PUBLISHES tour availability, so it has to
  // show the conflicts that availability would collide with. It used to render
  // no busy overlay at all while /portal/calendar showed the same half hour as
  // "Blocked" — a slot you could publish straight on top of (F-CAL-6). No toast
  // here: the portfolio calendar already surfaces connection warnings.
  const googleBusyMeetings = useGoogleCalendarBusyMeetings({ enabled: Boolean(managerUserId) });

  return (
    <>
      <PortalPropertyDetailSection>
        <PortalCalendarPanels
          key={storageKey ?? "property-calendar-unavailable"}
          storageKey={storageKey}
          bareSurface
          compactAvailability
          defaultViewMode="week"
          availabilityHeading="Your availability"
          tourScopeLabel={propertyLabel}
          unavailableMessage="Sign in to manage tour availability for this property."
          externalMeetings={googleBusyMeetings}
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

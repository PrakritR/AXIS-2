"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PORTAL_LIST_ADD_ICONS,
  PORTAL_LIST_ADD_ROW_WRAP_CLASS,
  PortalListAddRow,
} from "@/components/portal/portal-list-add-row";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
import { ServiceOfferingEditModal } from "@/components/portal/service-offering-edit-modal";
import {
  createManagerListingServiceOption,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

type RequestsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function requestOfferSubtitle(offer: ManagerListingServiceOption): string {
  const parts = [
    offer.price?.trim() || null,
    offer.deposit?.trim() ? `Deposit ${offer.deposit.trim()}` : null,
    !offer.available ? "Unavailable" : null,
  ].filter(Boolean);
  return parts.join(" · ") || "No price set";
}

/**
 * Per-property request catalog — offerings residents can request (parking, storage, etc.).
 * Same list chrome as the lease and promotion tabs; stored on `serviceRequestOptions`.
 */
export function ManagerPropertyRequestsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
  onRegisterAddRequest,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: RequestsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  /** Parent header "Add request" — same handler as the dashed list footer row. */
  onRegisterAddRequest?: (openAdd: (() => void) | null) => void;
}) {
  const offers = sub.serviceRequestOptions ?? [];
  const [editOpen, setEditOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ManagerListingServiceOption | null>(null);
  const [isNewOffer, setIsNewOffer] = useState(false);

  const openAdd = useCallback(() => {
    setEditingOffer(createManagerListingServiceOption());
    setIsNewOffer(true);
    setEditOpen(true);
  }, []);

  useEffect(() => {
    onRegisterAddRequest?.(openAdd);
    return () => onRegisterAddRequest?.(null);
  }, [onRegisterAddRequest, openAdd]);

  const openEdit = (offer: ManagerListingServiceOption) => {
    setEditingOffer(offer);
    setIsNewOffer(false);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingOffer(null);
    setIsNewOffer(false);
  };

  if (!saveTarget || !managerUserId) return null;

  return (
    <>
      <PortalPropertyDetailSection contentClassName="space-y-0">
        {offers.map((offer) => (
          <div key={offer.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{offer.name.trim() || "Untitled request"}</p>
              <p className="mt-0.5 text-xs text-muted">
                {offer.description?.trim()
                  ? `${offer.description.trim()} · ${requestOfferSubtitle(offer)}`
                  : requestOfferSubtitle(offer)}
              </p>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`property-request-edit-${offer.id}`}
                onClick={() => openEdit(offer)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </PortalPropertyDetailSection>

      <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
        <PortalListAddRow
          label="Add request"
          icon={PORTAL_LIST_ADD_ICONS.request}
          onClick={openAdd}
          dataAttr="manager-service-request-add"
        />
      </div>

      <ServiceOfferingEditModal
        open={editOpen}
        offering={editingOffer}
        isNew={isNewOffer}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={closeEdit}
        onSaved={onUpdated}
        showToast={showToast}
        entityLabel="request"
      />
    </>
  );
}

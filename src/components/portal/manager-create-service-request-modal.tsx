"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getRoomChoiceLabel, getPropertyById } from "@/lib/rental-application/data";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  createManagerListingServiceOption,
  LISTING_SERVICE_QUICK_ADDS,
  normalizeManagerListingSubmissionV1,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { resolvePropertySaveTargetById } from "@/lib/manager-property-save-target";
import { createServiceRequest, hasDeposit } from "@/lib/service-requests-storage";

type PropertyOption = { propertyId: string; propertyLabel: string };

type ResidentOption = {
  residentName: string;
  residentEmail: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
};

function displayPropertyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(" · ")[0]!
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

function buildPropertyOptions(managerUserId: string | null): PropertyOption[] {
  if (!managerUserId) return [];
  const seen = new Map<string, PropertyOption>();
  for (const property of readExtraListingsForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel(property.buildingName.trim() || property.title);
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }
  for (const property of readPendingManagerPropertiesForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel(property.buildingName.trim());
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }
  return [...seen.values()].sort((a, b) =>
    a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" }),
  );
}

function buildResidentOptions(managerUserId: string | null): ResidentOption[] {
  return readManagerApplicationRows()
    .filter(
      (row) =>
        isCurrentResidentApplicationRow(row) &&
        applicationVisibleToPortalUser(row, managerUserId) &&
        row.name?.trim() &&
        row.email?.trim().includes("@"),
    )
    .map((row) => {
      const propertyLabel = displayPropertyLabel(row.property?.trim() || "");
      const propertyId =
        row.assignedPropertyId?.trim() ||
        row.propertyId?.trim() ||
        row.application?.propertyId?.trim() ||
        "";
      const roomLabel =
        getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "")
          .split(" · ")[0]
          ?.trim() ||
        row.manualResidentDetails?.roomNumber?.trim() ||
        "";
      return {
        residentName: row.name.trim(),
        residentEmail: row.email!.trim().toLowerCase(),
        propertyId,
        propertyLabel: propertyLabel || "Property",
        roomLabel,
      };
    })
    .sort((a, b) => {
      const byProperty = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (byProperty !== 0) return byProperty;
      return a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
    });
}

function residentMatchesProperty(resident: ResidentOption, property: PropertyOption): boolean {
  if (resident.propertyId && resident.propertyId === property.propertyId) return true;
  return resident.propertyLabel.toLowerCase() === property.propertyLabel.toLowerCase();
}

export function ManagerCreateServiceRequestModal({
  open,
  onClose,
  onSubmitted,
  managerUserId,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  managerUserId: string | null;
  defaultPropertyId?: string;
}) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [offerId, setOfferId] = useState("");
  const [returnByDate, setReturnByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [addingOffer, setAddingOffer] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferPrice, setNewOfferPrice] = useState("");
  const [newOfferDeposit, setNewOfferDeposit] = useState("");

  useEffect(() => {
    if (!open) return;
    void syncPropertyPipelineFromServer().then(() => setTick((t) => t + 1));
    void syncManagerApplicationsFromServer().then(() => setTick((t) => t + 1));
    const onProps = () => setTick((t) => t + 1);
    const onApps = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProps);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProps);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setPropertyId(defaultPropertyId?.trim() || "");
      setResidentEmail("");
      setOfferId("");
      setReturnByDate("");
      setNotes("");
      setAddingOffer(false);
      setNewOfferName("");
      setNewOfferPrice("");
      setNewOfferDeposit("");
    });
  }, [open, defaultPropertyId]);

  const propertyOptions = useMemo(() => {
    void tick;
    return buildPropertyOptions(managerUserId);
  }, [managerUserId, tick]);

  const residentOptions = useMemo(() => {
    void tick;
    return buildResidentOptions(managerUserId);
  }, [managerUserId, tick]);

  const residentsForProperty = useMemo(() => {
    const property = propertyOptions.find((p) => p.propertyId === propertyId);
    if (!property) return residentOptions;
    return residentOptions.filter((r) => residentMatchesProperty(r, property));
  }, [propertyId, propertyOptions, residentOptions]);

  const selectedResident = useMemo(
    () => residentOptions.find((r) => r.residentEmail === residentEmail) ?? null,
    [residentEmail, residentOptions],
  );

  const selectedProperty = useMemo(
    () => propertyOptions.find((p) => p.propertyId === propertyId) ?? null,
    [propertyId, propertyOptions],
  );

  const propertySubmission = useMemo<ManagerListingSubmissionV1 | null>(() => {
    void tick;
    if (!propertyId) return null;
    const property = getPropertyById(propertyId);
    if (!property?.listingSubmission || property.listingSubmission.v !== 1) return null;
    return normalizeManagerListingSubmissionV1(property.listingSubmission);
  }, [propertyId, tick]);

  const offersForProperty = useMemo<ManagerListingServiceOption[]>(() => {
    const options = propertySubmission?.serviceRequestOptions ?? [];
    return options.filter((o) => {
      if (!o.available) return false;
      if (!o.residentEmails?.length) return true;
      if (!residentEmail) return true;
      return o.residentEmails.some((e) => e.trim().toLowerCase() === residentEmail);
    });
  }, [propertySubmission, residentEmail]);

  const selectedOffer = useMemo(
    () => offersForProperty.find((o) => o.id === offerId) ?? null,
    [offerId, offersForProperty],
  );

  const propertySaveTarget = useMemo(
    () => resolvePropertySaveTargetById(managerUserId, propertyId),
    [managerUserId, propertyId],
  );

  const addOffer = (preset?: { name: string; description: string }) => {
    if (savingOffer) return;
    if (!managerUserId) {
      showToast("Could not identify your manager account.");
      return;
    }
    if (!propertyId) {
      showToast("Choose a property first.");
      return;
    }
    const name = (preset?.name ?? newOfferName).trim();
    if (!name) {
      showToast("Enter a name for the request type.");
      return;
    }
    if (!propertySaveTarget || !propertySubmission) {
      showToast("Could not update this property's offerings.");
      return;
    }
    setSavingOffer(true);
    try {
      const offer: ManagerListingServiceOption = {
        ...createManagerListingServiceOption(name, preset?.description ?? ""),
        price: preset ? "" : newOfferPrice.trim(),
        deposit: preset ? "" : newOfferDeposit.trim(),
      };
      const nextSubmission: ManagerListingSubmissionV1 = {
        ...propertySubmission,
        serviceRequestOptions: [...(propertySubmission.serviceRequestOptions ?? []), offer],
      };
      const ok =
        propertySaveTarget.mode === "pending"
          ? updatePendingManagerProperty(propertySaveTarget.saveId, nextSubmission, managerUserId)
          : propertySaveTarget.mode === "listing"
            ? updateExtraListingFromSubmission(propertySaveTarget.saveId, managerUserId, nextSubmission)
            : false;
      if (!ok) {
        showToast("Could not add the request type.");
        return;
      }
      showToast(`${offer.name} added to this property's offerings.`);
      setOfferId(offer.id);
      setAddingOffer(false);
      setNewOfferName("");
      setNewOfferPrice("");
      setNewOfferDeposit("");
    } finally {
      setSavingOffer(false);
    }
  };

  const submit = () => {
    if (busy) return;
    if (!managerUserId) {
      showToast("Could not identify your manager account.");
      return;
    }
    if (!propertyId || !selectedProperty) {
      showToast("Choose a property.");
      return;
    }
    if (!residentEmail || !selectedResident) {
      showToast("Choose a resident.");
      return;
    }
    if (!offerId || !selectedOffer) {
      showToast("Choose a request type.");
      return;
    }
    if (hasDeposit(selectedOffer.deposit) && !returnByDate.trim()) {
      showToast("Please enter a return-by date.");
      return;
    }
    setBusy(true);
    try {
      createServiceRequest({
        offerId: selectedOffer.id,
        offerName: selectedOffer.name,
        offerDescription: selectedOffer.description,
        price: selectedOffer.price,
        deposit: selectedOffer.deposit,
        residentEmail: selectedResident.residentEmail,
        residentName: selectedResident.residentName,
        managerUserId,
        propertyId,
        returnByDate: returnByDate.trim(),
        notes: notes.trim(),
      });
      showToast(`${selectedOffer.name} request created for ${selectedResident.residentName}.`);
      onSubmitted();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add request">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Log a service request on behalf of a resident. Only offerings the property makes available appear below.
        </p>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Property *
          <Select
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setResidentEmail("");
              setOfferId("");
              setAddingOffer(false);
            }}
            disabled={busy}
          >
            <option value="">Select property</option>
            {propertyOptions.map((p) => (
              <option key={p.propertyId} value={p.propertyId}>
                {p.propertyLabel}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Resident *
          <Select
            value={residentEmail}
            onChange={(e) => {
              setResidentEmail(e.target.value);
              setOfferId("");
            }}
            disabled={busy || !propertyId}
          >
            <option value="">{propertyId ? "Select resident" : "Choose a property first"}</option>
            {residentsForProperty.map((r) => (
              <option key={r.residentEmail} value={r.residentEmail}>
                {r.residentName}
                {r.roomLabel ? ` · ${r.roomLabel}` : ""}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Request type *
          <Select value={offerId} onChange={(e) => setOfferId(e.target.value)} disabled={busy || !propertyId}>
            <option value="">
              {!propertyId
                ? "Choose a property first"
                : offersForProperty.length === 0
                  ? "No offered requests for this property"
                  : "Select request type"}
            </option>
            {offersForProperty.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.price ? ` · ${o.price}` : ""}
              </option>
            ))}
          </Select>
          {propertyId && offersForProperty.length === 0 ? (
            <span className="text-[11px] font-normal normal-case text-muted">
              This property has no offered requests yet — add one below.
            </span>
          ) : null}
        </label>

        {propertyId ? (
          <div className="rounded-xl border border-dashed border-border p-3">
            {!addingOffer ? (
              <button
                type="button"
                data-attr="add-request-modal-add-offer-toggle"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => setAddingOffer(true)}
                disabled={busy}
              >
                + Add a request type
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  New request type for {selectedProperty?.propertyLabel ?? "this property"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {LISTING_SERVICE_QUICK_ADDS.map((preset) => (
                    <Button
                      key={preset.name}
                      type="button"
                      variant="outline"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      data-attr="add-request-modal-quick-add"
                      onClick={() => addOffer(preset)}
                      disabled={savingOffer}
                    >
                      + {preset.name}
                    </Button>
                  ))}
                </div>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                  Name
                  <Input
                    value={newOfferName}
                    onChange={(e) => setNewOfferName(e.target.value)}
                    placeholder="e.g. Parking spot"
                    disabled={savingOffer}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Price
                    <Input
                      value={newOfferPrice}
                      onChange={(e) => setNewOfferPrice(e.target.value)}
                      placeholder="e.g. $25/mo"
                      disabled={savingOffer}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Deposit
                    <Input
                      value={newOfferDeposit}
                      onChange={(e) => setNewOfferDeposit(e.target.value)}
                      placeholder="e.g. $100"
                      disabled={savingOffer}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setAddingOffer(false)}
                    disabled={savingOffer}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="rounded-full"
                    data-attr="add-request-modal-save-offer"
                    onClick={() => addOffer()}
                    disabled={savingOffer}
                  >
                    {savingOffer ? "Adding…" : "Add to property"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted">
                  Every resident at this property will see it — this is not specific to the resident selected above.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {selectedOffer && hasDeposit(selectedOffer.deposit) ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Return by date *
            <Input
              type="date"
              value={returnByDate}
              onChange={(e) => setReturnByDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              disabled={busy}
            />
            <span className="text-[11px] font-normal normal-case text-muted">
              Required — the deposit is held until the item is returned.
            </span>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Notes (optional)
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Preferred timing, special instructions…"
            disabled={busy}
          />
        </label>

        <div className="flex justify-start gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Create request"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  createManagerListingServiceOption,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  persistManagerListingSubmission,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";

export function ServiceOfferingFields({
  row,
  onPatch,
}: {
  row: ManagerListingServiceOption;
  onPatch: (patch: Partial<ManagerListingServiceOption>) => void;
}) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border text-primary"
          checked={row.available}
          onChange={(e) => onPatch({ available: e.target.checked })}
        />
        <span className="text-sm font-medium text-foreground">Available to residents</span>
      </label>
      <div>
        <p className="text-sm font-medium text-foreground">Name</p>
        <Input
          value={row.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="e.g. Parking spot"
          className="mt-1"
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Description</p>
        <Input
          value={row.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="What the resident gets"
          className="mt-1"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-foreground">Price</p>
          <Input
            value={row.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            placeholder="e.g. $25/mo"
            className="mt-1"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Deposit</p>
          <Input
            value={row.deposit}
            onChange={(e) => onPatch({ deposit: e.target.value })}
            placeholder="e.g. $100"
            className="mt-1"
          />
        </div>
      </div>
    </>
  );
}

function normalizeOffering(row: ManagerListingServiceOption): ManagerListingServiceOption {
  return {
    ...row,
    name: row.name.trim(),
    description: row.description.trim(),
    price: row.price.trim(),
    deposit: row.deposit.trim(),
  };
}

/** Edit a single service offering — saves listing submission on Save. */
export function ServiceOfferingEditModal({
  open,
  offering,
  isNew = false,
  sub,
  saveTarget,
  managerUserId,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  offering: ManagerListingServiceOption | null;
  isNew?: boolean;
  sub: ManagerListingSubmissionV1;
  saveTarget: ManagerPropertySaveTarget;
  managerUserId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<ManagerListingServiceOption>(() =>
    offering ? { ...offering } : createManagerListingServiceOption(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(offering ? { ...offering } : createManagerListingServiceOption());
    setError(null);
  }, [open, offering]);

  const patch = (patchRow: Partial<ManagerListingServiceOption>) =>
    setDraft((prev) => ({ ...prev, ...patchRow }));

  const save = () => {
    const normalized = normalizeOffering(draft);
    if (!normalized.name) {
      setError("Service name is required.");
      return;
    }

    const offers = sub.serviceRequestOptions ?? [];
    const nextOffers = isNew
      ? [normalized, ...offers]
      : offers.map((o) => (o.id === normalized.id ? normalized : o));

    const next: ManagerListingSubmissionV1 = { ...sub, serviceRequestOptions: nextOffers };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save service.");
      return;
    }
    showToast(isNew ? "Service added." : "Service saved.");
    onClose();
    onSaved();
  };

  return (
    <Modal
      open={open}
      title={isNew ? "Add service" : "Edit service"}
      onClose={onClose}
      panelClassName="max-w-lg"
      stackClassName="fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
    >
      <div className="space-y-3">
        <ServiceOfferingFields row={draft} onPatch={patch} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          data-attr="service-offering-save"
          onClick={save}
        >
          Save
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

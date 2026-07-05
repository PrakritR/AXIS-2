"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import {
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  createManagerListingServiceOption,
  LISTING_SERVICE_QUICK_ADDS,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

type ServiceOptionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function persistSubmission(
  saveTarget: NonNullable<ServiceOptionsSaveTarget>,
  managerUserId: string,
  next: ManagerListingSubmissionV1,
): boolean {
  if (saveTarget.mode === "pending") {
    return updatePendingManagerProperty(saveTarget.saveId, next, managerUserId);
  }
  if (saveTarget.mode === "listing") {
    return updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, next);
  }
  return updateRequestChangeProperty(saveTarget.saveId, managerUserId, next);
}

/**
 * Per-property services editor — the amenity/add-on catalog (parking, storage,
 * cleaning package, etc.) residents can request. Stored on the listing submission
 * (`serviceRequestOptions`) so it persists with the property record.
 */
export function ManagerPropertyServiceOptionsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: ServiceOptionsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [rows, setRows] = useState<ManagerListingServiceOption[]>([]);

  const offers = sub.serviceRequestOptions ?? [];
  if (!saveTarget || !managerUserId) return null;

  const removeSingleOffer = (offerId: string) => {
    const nextOffers = offers.filter((o) => o.id !== offerId);
    const next: ManagerListingSubmissionV1 = { ...sub, serviceRequestOptions: nextOffers };
    if (!persistSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not remove service.");
      return;
    }
    showToast("Service removed.");
    onUpdated();
  };

  const openModal = () => {
    setRows(offers.map((o) => ({ ...o })));
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const patchRow = (id: string, patch: Partial<ManagerListingServiceOption>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = () => setRows((prev) => [createManagerListingServiceOption(), ...prev]);

  const addQuickAdd = (preset: { name: string; description: string }) => {
    setRows((prev) => {
      if (prev.some((r) => r.name.trim().toLowerCase() === preset.name.toLowerCase())) return prev;
      return [createManagerListingServiceOption(preset.name, preset.description), ...prev];
    });
  };

  const save = () => {
    const nextOffers = rows
      .map((r) => ({
        ...r,
        name: r.name.trim(),
        description: r.description.trim(),
        price: r.price.trim(),
        deposit: r.deposit.trim(),
      }))
      .filter((r) => r.name);
    const next: ManagerListingSubmissionV1 = { ...sub, serviceRequestOptions: nextOffers };
    if (!persistSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save services.");
      return;
    }
    showToast("Services saved.");
    closeModal();
    onUpdated();
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card [html[data-theme=dark]_&]:portal-surface-muted">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/30 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Services</p>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="service-options-add"
            onClick={openModal}
          >
            Add
          </Button>
        </div>

        {offers.length > 0 ? (
          <div>
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="flex items-start justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{offer.name}</p>
                  {offer.description ? <p className="mt-0.5 text-xs text-muted">{offer.description}</p> : null}
                  <p className="mt-0.5 text-xs text-muted">
                    {[offer.price, offer.deposit ? `Deposit ${offer.deposit}` : null].filter(Boolean).join(" · ") ||
                      "No price set"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      offer.available ? "portal-badge-success" : "bg-accent/30 text-muted"
                    }`}
                  >
                    {offer.available ? "Available" : "Hidden"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs border-rose-200 text-rose-800 portal-danger-outline"
                    data-attr="service-option-remove-one"
                    title={`Remove ${offer.name}`}
                    onClick={() => removeSingleOffer(offer.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Modal open={modalOpen} title="Services" onClose={closeModal} panelClassName="max-w-2xl">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {LISTING_SERVICE_QUICK_ADDS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => addQuickAdd(preset)}
              >
                + {preset.name}
              </Button>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-border bg-accent/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Offering</p>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border text-primary"
                      checked={row.available}
                      onChange={(e) => patchRow(row.id, { available: e.target.checked })}
                    />
                    Available
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-full px-2 text-xs border-rose-200 text-rose-800 portal-danger-outline"
                    title="Remove offering"
                    onClick={() => removeRow(row.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Name</p>
                <Input
                  value={row.name}
                  onChange={(e) => patchRow(row.id, { name: e.target.value })}
                  placeholder="e.g. Parking spot"
                  className="mt-1"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Description</p>
                <Input
                  value={row.description}
                  onChange={(e) => patchRow(row.id, { description: e.target.value })}
                  placeholder="What the resident gets"
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Price</p>
                  <Input
                    value={row.price}
                    onChange={(e) => patchRow(row.id, { price: e.target.value })}
                    placeholder="e.g. $25/mo"
                    className="mt-1"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Deposit</p>
                  <Input
                    value={row.deposit}
                    onChange={(e) => patchRow(row.id, { deposit: e.target.value })}
                    placeholder="e.g. $100"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={addRow}>
              + Add offering
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            data-attr="service-options-save"
            onClick={save}
          >
            Save
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={closeModal}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import {
  createManagerListingServiceOption,
  LISTING_SERVICE_QUICK_ADDS,
  resolveServiceOfferPricing,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { persistManagerListingSubmission } from "@/lib/manager-property-save-target";

type ServiceOptionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

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
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [rows, setRows] = useState<ManagerListingServiceOption[]>([]);
  const [previewExpanded, setPreviewExpanded] = useState(true);

  const offers = sub.serviceRequestOptions ?? [];
  const hasPreview = offers.length > 0;

  useEffect(() => {
    setPreviewExpanded(true);
  }, [offers.length]);

  if (!saveTarget || !managerUserId) return null;

  const removeSingleOffer = (offerId: string) => {
    const nextOffers = offers.filter((o) => o.id !== offerId);
    const next: ManagerListingSubmissionV1 = { ...sub, serviceRequestOptions: nextOffers };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not remove service.");
      return;
    }
    showToast("Service removed.");
    onUpdated();
  };

  const openModal = () => {
    setEditingOfferId(null);
    setRows(offers.map((o) => ({ ...o })));
    setModalOpen(true);
  };

  const openEditModal = (offer: ManagerListingServiceOption) => {
    setEditingOfferId(offer.id);
    setRows([{ ...offer }]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingOfferId(null);
  };

  const patchRow = (id: string, patch: Partial<ManagerListingServiceOption>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = () => setRows((prev) => [createManagerListingServiceOption(), ...prev]);

  const addQuickAdd = (preset: (typeof LISTING_SERVICE_QUICK_ADDS)[number]) => {
    setRows((prev) => {
      if (prev.some((r) => r.name.trim().toLowerCase() === preset.name.toLowerCase())) return prev;
      const pricing = resolveServiceOfferPricing({ name: preset.name, price: preset.price, deposit: preset.deposit });
      return [
        {
          ...createManagerListingServiceOption(preset.name, preset.description),
          price: pricing.price,
          deposit: pricing.deposit,
        },
        ...prev,
      ];
    });
  };

  const save = () => {
    const normalized = rows.map((r) => ({
      ...r,
      name: r.name.trim(),
      description: r.description.trim(),
      price: r.price.trim(),
      deposit: r.deposit.trim(),
    }));
    const nextOffers = editingOfferId
      ? (() => {
          const updated = normalized[0];
          if (!updated?.name) return null;
          return offers.map((o) => (o.id === editingOfferId ? updated : o));
        })()
      : normalized.filter((r) => r.name);
    if (!nextOffers) {
      showToast("Service name is required.");
      return;
    }
    const next: ManagerListingSubmissionV1 = { ...sub, serviceRequestOptions: nextOffers };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save services.");
      return;
    }
    showToast(editingOfferId ? "Service updated." : "Services saved.");
    closeModal();
    onUpdated();
  };

  return (
    <>
      <PortalCollapsibleSection
        title="Services"
        expanded={previewExpanded}
        onExpandedChange={setPreviewExpanded}
        collapsible={hasPreview}
        toggleDataAttr="services-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="service-options-add"
            onClick={openModal}
          >
            {hasPreview ? "Edit services" : "Add"}
          </Button>
        }
        contentClassName="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain"
      >
        {hasPreview
          ? offers.map((offer) => (
              <div
                key={offer.id}
                className="flex items-start justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-accent/20"
                  data-attr="service-option-edit"
                  onClick={() => openEditModal(offer)}
                >
                  <p className="text-sm font-medium text-foreground">{offer.name}</p>
                  {offer.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{offer.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted">
                    {[offer.price, offer.deposit ? `Deposit ${offer.deposit}` : null].filter(Boolean).join(" · ") ||
                      "No price set"}
                  </p>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 shrink-0 rounded-full px-3 text-xs border-rose-200 text-rose-800 portal-danger-outline"
                  data-attr="service-option-remove-one"
                  title={`Remove ${offer.name}`}
                  onClick={() => removeSingleOffer(offer.id)}
                >
                  Remove
                </Button>
              </div>
            ))
          : null}
      </PortalCollapsibleSection>

      <Modal
        open={modalOpen}
        title={editingOfferId ? "Edit service" : "Services"}
        onClose={closeModal}
        panelClassName="max-w-2xl"
      >
        <div className="space-y-4">
          {!editingOfferId ? (
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
          ) : null}
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
          {!editingOfferId ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={addRow}>
                + Add offering
              </Button>
            </div>
          ) : null}
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

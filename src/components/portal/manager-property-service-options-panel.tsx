"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import {
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  LISTING_SERVICE_QUICK_ADDS,
  type ManagerListingServiceOption,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

type ServiceOptionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function newOfferRow(name = "", description = ""): ManagerListingServiceOption {
  return {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    price: "",
    deposit: "",
    available: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Per-property "offered service requests" editor — the amenity/add-on catalog
 * (parking, storage, cleaning package, etc.) residents can request. Stored on
 * the listing submission (`serviceRequestOptions`) so it persists with the
 * property record and drives the resident's "Submit request" dropdown.
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
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ManagerListingServiceOption[]>([]);

  const offers = sub.serviceRequestOptions ?? [];
  if (!saveTarget || !managerUserId) return null;

  const startEdit = () => {
    setRows(offers.map((o) => ({ ...o })));
    setEditing(true);
  };

  const patchRow = (id: string, patch: Partial<ManagerListingServiceOption>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = () => setRows((prev) => [newOfferRow(), ...prev]);

  const addQuickAdd = (preset: { name: string; description: string }) => {
    setRows((prev) => {
      if (prev.some((r) => r.name.trim().toLowerCase() === preset.name.toLowerCase())) return prev;
      return [newOfferRow(preset.name, preset.description), ...prev];
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
    let ok = false;
    if (saveTarget.mode === "pending") {
      ok = updatePendingManagerProperty(saveTarget.saveId, next, managerUserId);
    } else if (saveTarget.mode === "listing") {
      ok = updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, next);
    } else {
      ok = updateRequestChangeProperty(saveTarget.saveId, managerUserId, next);
    }
    if (!ok) {
      showToast("Could not save offered requests.");
      return;
    }
    showToast("Offered requests saved.");
    setEditing(false);
    onUpdated();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card [html[data-theme=dark]_&]:portal-surface-muted">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Offered service requests</p>
          <span className="portal-badge-info rounded-full px-2 py-0.5 text-[10px] font-semibold">Residents</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full px-3 text-xs"
          data-attr="service-options-edit"
          onClick={() => (editing ? setEditing(false) : startEdit())}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-4 px-4 py-4">
          <p className="text-xs leading-relaxed text-muted">
            Add-ons residents at this property can request (e.g. parking, storage, cleaning). Only
            offerings marked Available appear in the resident&apos;s request form.
          </p>
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
          {rows.length === 0 ? (
            <p className="text-sm text-muted">No offerings yet — add your first one below.</p>
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={addRow}>
              + Add offering
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              data-attr="service-options-save"
              onClick={save}
            >
              Save offerings
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {offers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">
              No offerings yet — click Edit to add requestable add-ons (parking, storage, cleaning, etc.) for this
              property.
            </p>
          ) : (
            offers.map((offer) => (
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
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    offer.available ? "portal-badge-success" : "bg-accent/30 text-muted"
                  }`}
                >
                  {offer.available ? "Available" : "Hidden"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

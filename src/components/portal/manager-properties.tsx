"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoPropertyCards } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PROPERTY_PIPELINE_EVENT, readPendingManagerProperties, submitManagerPendingProperty } from "@/lib/demo-property-pipeline";
import type { ManagerPropertyDraftInput } from "@/lib/demo-property-pipeline";

export function ManagerProperties() {
  const { showToast } = useAppUi();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(() => {
    setPendingCount(readPendingManagerProperties().length);
  }, []);

  useEffect(() => {
    refreshPending();
    const on = () => refreshPending();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, [refreshPending]);

  return (
    <>
      {formOpen ? (
        <AddHouseOverlay
          showToast={showToast}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => {
            showToast("Property submitted for admin approval. It will appear on public listings after approval.");
            refreshPending();
            setFormOpen(false);
          }}
        />
      ) : null}

      <ManagerSectionShell
        title="Properties"
        filters={<PortalPropertyFilter />}
        actions={[
          {
            label: "+ Add property",
            variant: "primary",
            onClick: () => setFormOpen(true),
          },
          {
            label: "Refresh",
            variant: "outline",
            onClick: refreshPending,
          },
        ]}
      >
        {pendingCount > 0 ? (
          <p className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <span className="font-semibold">{pendingCount}</span> propert{pendingCount === 1 ? "y" : "ies"} awaiting admin
            approval before they go live on Axis listings.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {demoPropertyCards.map((p) => (
            <Card key={p.name} className="border-slate-200/80 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{p.status}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">{p.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{p.address}</p>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Units</dt>
                  <dd className="font-semibold text-slate-900">{p.units}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Occupancy</dt>
                  <dd className="font-semibold text-slate-900">{p.occupancy}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </ManagerSectionShell>
    </>
  );
}

function AddHouseOverlay({
  onClose,
  onSubmitted,
  showToast,
}: {
  onClose: () => void;
  onSubmitted: () => void;
  showToast: (msg: string) => void;
}) {
  const [buildingName, setBuildingName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [beds, setBeds] = useState("1");
  const [baths, setBaths] = useState("1");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [tagline, setTagline] = useState("");
  const [petFriendly, setPetFriendly] = useState(true);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const rentN = Number(monthlyRent);
    if (!buildingName.trim() || !address.trim() || !zip.trim() || !neighborhood.trim() || !unitLabel.trim()) {
      showToast("Please fill in all required fields.");
      return;
    }
    if (!Number.isFinite(rentN) || rentN <= 0) {
      showToast("Enter a valid monthly rent.");
      return;
    }
    const b = Math.max(0, Math.min(20, Math.floor(Number(beds)) || 0));
    const ba = Math.max(0, Math.min(20, Math.floor(Number(baths)) || 0));
    const draft: ManagerPropertyDraftInput = {
      buildingName: buildingName.trim(),
      address: address.trim(),
      zip: zip.trim(),
      neighborhood: neighborhood.trim(),
      unitLabel: unitLabel.trim(),
      beds: b,
      baths: ba,
      monthlyRent: rentN,
      petFriendly,
      tagline: tagline.trim() || "New shared housing listing",
    };
    submitManagerPendingProperty(draft);
    onSubmitted();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Add a house</h2>
            <p className="mt-1 text-sm text-slate-600">
              Submit a new property for Axis admin review. When approved, it appears on public listings (demo).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Building name" required>
            <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Pioneer Collective" />
          </Field>
          <Field label="Street address" required>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1201 E Union St" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ZIP" required>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="98122" maxLength={10} />
            </Field>
            <Field label="Neighborhood" required>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Capitol Hill" />
            </Field>
          </div>
          <Field label="Unit / room label" required>
            <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="Room 12A" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Beds" required>
              <Input inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value)} />
            </Field>
            <Field label="Baths" required>
              <Input inputMode="numeric" value={baths} onChange={(e) => setBaths(e.target.value)} />
            </Field>
            <Field label="Rent $/mo" required>
              <Input inputMode="decimal" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} placeholder="950" />
            </Field>
          </div>
          <Field label="Tagline (optional)">
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Bright room near transit" />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={petFriendly} onChange={(e) => setPetFriendly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Pet-friendly
          </label>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="rounded-full">
            Submit for approval
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

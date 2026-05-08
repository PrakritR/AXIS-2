"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { ManagerWorkOrders } from "@/components/portal/manager-work-orders";
import {
  deleteAmenityOffer,
  readAmenityOffersForManager,
  saveAmenityOffer,
  toggleAmenityOfferAvailability,
  type ManagerAmenityOffer,
} from "@/lib/manager-amenity-catalog-storage";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

type Tab = "requests" | "catalog";
const TABS: { id: Tab; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "catalog", label: "Service catalog" },
];

const EMPTY_FORM = { name: "", description: "", price: "", deposit: "" };

export function ManagerServicesPanel() {
  const { showToast } = useAppUi();
  const { userId: managerUserId } = useManagerUserId();
  const [tab, setTab] = useState<Tab>("requests");
  const [offers, setOffers] = useState<ManagerAmenityOffer[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ManagerAmenityOffer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const reload = () => {
    if (managerUserId) setOffers(readAmenityOffersForManager(managerUserId));
  };

  useEffect(() => { reload(); }, [managerUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabItems = useMemo(
    () => TABS.map(({ id, label }) => ({ id, label, count: 0 })),
    [],
  );

  const openCreate = () => {
    setEditingOffer(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (offer: ManagerAmenityOffer) => {
    setEditingOffer(offer);
    setForm({ name: offer.name, description: offer.description, price: offer.price, deposit: offer.deposit ?? "" });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { showToast("Service name is required."); return; }
    if (!managerUserId) { showToast("Sign in first."); return; }
    const offer: ManagerAmenityOffer = {
      id: editingOffer?.id ?? `offer-${Date.now()}`,
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price.trim(),
      deposit: form.deposit.trim(),
      category: "",
      available: editingOffer?.available ?? true,
      managerUserId,
      createdAt: editingOffer?.createdAt ?? new Date().toISOString(),
    };
    saveAmenityOffer(offer);
    reload();
    showToast(editingOffer ? "Service updated." : "Service added to catalog.");
    setModalOpen(false);
  };

  const handleDelete = (offer: ManagerAmenityOffer) => {
    if (!window.confirm(`Remove "${offer.name}" from your catalog?`)) return;
    if (!managerUserId) return;
    deleteAmenityOffer(offer.id, managerUserId);
    reload();
    showToast("Service removed.");
  };

  const handleToggle = (offer: ManagerAmenityOffer) => {
    if (!managerUserId) return;
    toggleAmenityOfferAvailability(offer.id, managerUserId);
    reload();
    showToast(offer.available ? "Service paused — residents won't see it." : "Service is now available to residents.");
  };

  return (
    <>
      <ManagerPortalPageShell
        title="Services"
        titleAside={
          tab === "catalog" ? (
            <Button type="button" className="shrink-0 rounded-full" onClick={openCreate}>
              Add service
            </Button>
          ) : null
        }
        filterRow={
          <ManagerPortalStatusPills
            tabs={tabItems}
            activeId={tab}
            onChange={(id) => setTab(id as Tab)}
          />
        }
      >
        {tab === "requests" ? (
          <ManagerWorkOrders />
        ) : (
          <div className="mt-1">
            {offers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
                <p className="text-sm font-medium text-slate-600">No services yet</p>
                <p className="mt-1 max-w-xs text-xs text-slate-400">
                  Add services — like cleaning, linen sets, or other amenities — that residents can request directly from their portal.
                </p>
                <Button type="button" className="mt-5 rounded-full" onClick={openCreate}>
                  Add first service
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className={`flex flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition ${
                      offer.available ? "border-slate-200" : "border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{offer.name}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {offer.price ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {offer.price}
                          </span>
                        ) : null}
                        {offer.deposit ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200/80">
                            Deposit {offer.deposit}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                            offer.available
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                              : "bg-slate-100 text-slate-500 ring-slate-200/80"
                          }`}
                        >
                          {offer.available ? "Available" : "Paused"}
                        </span>
                      </div>
                    </div>
                    {offer.description ? (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{offer.description}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openEdit(offer)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(offer)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {offer.available ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(offer)}
                        className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ManagerPortalPageShell>

      <Modal
        open={modalOpen}
        title={editingOffer ? "Edit service" : "Add service"}
        onClose={() => setModalOpen(false)}
        panelClassName="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Service name</p>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Weekly cleaning, Blanket set"
              className="bg-white"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Price</p>
              <Input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="e.g. $25, $80/month, Free"
                className="bg-white"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Deposit</p>
              <Input
                value={form.deposit}
                onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
                placeholder="e.g. $50"
                className="bg-white"
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Description</p>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What's included, how it works, any conditions…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={handleSave}>
            {editingOffer ? "Save changes" : "Add service"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

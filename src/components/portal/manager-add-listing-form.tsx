"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  submitManagerPendingProperty,
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import { PRO_MAX_PROPERTIES, proTierPropertyLimitReached } from "@/lib/manager-access";
import {
  createDefaultListingSubmission,
  duplicateRoomEntry,
  emptyBathroom,
  emptyBundleRow,
  emptyQuickFactRow,
  emptyRoom,
  emptySharedSpace,
  PAYMENT_AT_SIGNING_OPTIONS,
  type ManagerBathroomSubmission,
  type ManagerBundleRow,
  type ManagerListingSubmissionV1,
  type ManagerQuickFactRow,
  type ManagerRoomSubmission,
  type ManagerSharedSpaceSubmission,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";

function togglePaymentAtSigning(
  current: PaymentAtSigningOptionId[],
  id: PaymentAtSigningOptionId,
  on: boolean,
): PaymentAtSigningOptionId[] {
  const set = new Set(current);
  if (on) set.add(id);
  else set.delete(id);
  return PAYMENT_AT_SIGNING_OPTIONS.map((o) => o.id).filter((k) => set.has(k));
}

const MAX_IMG_BYTES = 2.6 * 1024 * 1024;
const MAX_VID_BYTES = 14 * 1024 * 1024;


async function fileToDataUrl(file: File, maxBytes: number): Promise<string | null> {
  if (file.size > maxBytes) return null;
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-semibold text-slate-800">{children}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ManagerAddListingForm({
  onClose,
  onSubmitted,
  showToast,
  skuTier,
  propCountBeforeSubmit,
  editPendingId = null,
  editListingId = null,
  initialSubmission = null,
}: {
  onClose: () => void;
  onSubmitted: () => void;
  showToast: (m: string) => void;
  skuTier: string | null;
  propCountBeforeSubmit: number;
  editPendingId?: string | null;
  editListingId?: string | null;
  initialSubmission?: ManagerListingSubmissionV1 | null;
}) {
  const [sub, setSub] = useState<ManagerListingSubmissionV1>(() => initialSubmission ?? createDefaultListingSubmission());
  const [busy, setBusy] = useState(false);
  const { userId, ready: authReady } = useManagerUserId();

  const isEditMode = Boolean(editPendingId ?? editListingId);

  const setRoom = (i: number, patch: Partial<ManagerRoomSubmission>) => {
    setSub((s) => {
      const rooms = [...s.rooms];
      rooms[i] = { ...rooms[i]!, ...patch };
      return { ...s, rooms };
    });
  };

  const setBath = (i: number, patch: Partial<ManagerBathroomSubmission>) => {
    setSub((s) => {
      const bathrooms = [...s.bathrooms];
      bathrooms[i] = { ...bathrooms[i]!, ...patch };
      return { ...s, bathrooms };
    });
  };

  const setSharedSpace = (i: number, patch: Partial<ManagerSharedSpaceSubmission>) => {
    setSub((s) => {
      const sharedSpaces = [...s.sharedSpaces];
      sharedSpaces[i] = { ...sharedSpaces[i]!, ...patch };
      return { ...s, sharedSpaces };
    });
  };

  const addRoom = () => {
    if (sub.rooms.length >= 8) return;
    setSub((s) => ({ ...s, rooms: [...s.rooms, emptyRoom(s.rooms.length)] }));
  };

  const removeRoom = (i: number) => {
    if (sub.rooms.length <= 1) return;
    const removedId = sub.rooms[i]!.id;
    setSub((s) => ({
      ...s,
      rooms: s.rooms.filter((_, j) => j !== i),
      bathrooms: s.bathrooms.map((b) => ({
        ...b,
        assignedRoomIds: (b.assignedRoomIds ?? []).filter((id) => id !== removedId),
      })),
      sharedSpaces: s.sharedSpaces.map((ss) => ({
        ...ss,
        roomAccessIds: (ss.roomAccessIds ?? []).filter((id) => id !== removedId),
      })),
    }));
  };

  const toggleBathroomRoom = (bathIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      const nextBathrooms = s.bathrooms.map((b, bi) => {
        if (bi === bathIndex) {
          const set = new Set(b.assignedRoomIds ?? []);
          if (on) set.add(roomId);
          else set.delete(roomId);
          return { ...b, assignedRoomIds: s.rooms.map((r) => r.id).filter((id) => set.has(id)) };
        }
        if (on) {
          return { ...b, assignedRoomIds: (b.assignedRoomIds ?? []).filter((id) => id !== roomId) };
        }
        return b;
      });
      return { ...s, bathrooms: nextBathrooms };
    });
  };

  const duplicateRoom = (i: number) => {
    if (sub.rooms.length >= 8) {
      showToast("Maximum 8 rooms.");
      return;
    }
    const copy = duplicateRoomEntry(sub.rooms[i]!);
    setSub((s) => ({
      ...s,
      rooms: [...s.rooms.slice(0, i + 1), copy, ...s.rooms.slice(i + 1)],
    }));
    showToast("Room duplicated — edit the copy below.");
  };

  const addBathroom = () => {
    if (sub.bathrooms.length >= 12) return;
    setSub((s) => ({ ...s, bathrooms: [...s.bathrooms, emptyBathroom(s.bathrooms.length)] }));
  };

  const removeBathroom = (i: number) => {
    setSub((s) => ({ ...s, bathrooms: s.bathrooms.filter((_, j) => j !== i) }));
  };

  const addSharedSpace = () => {
    if (sub.sharedSpaces.length >= 24) return;
    setSub((s) => ({ ...s, sharedSpaces: [...s.sharedSpaces, emptySharedSpace(s.sharedSpaces.length)] }));
  };

  const removeSharedSpace = (i: number) => {
    setSub((s) => ({ ...s, sharedSpaces: s.sharedSpaces.filter((_, j) => j !== i) }));
  };

  const toggleSharedSpaceRoom = (spaceIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      const sharedSpaces = s.sharedSpaces.map((ss, si) => {
        if (si !== spaceIndex) return ss;
        const set = new Set(ss.roomAccessIds ?? []);
        if (on) set.add(roomId);
        else set.delete(roomId);
        return { ...ss, roomAccessIds: s.rooms.map((r) => r.id).filter((id) => set.has(id)) };
      });
      return { ...s, sharedSpaces };
    });
  };

  const setBundle = (i: number, patch: Partial<ManagerBundleRow>) => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      bundles[i] = { ...bundles[i]!, ...patch };
      return { ...s, bundles };
    });
  };

  const addBundle = () => {
    setSub((s) => ({ ...s, bundles: [...(s.bundles ?? []), emptyBundleRow()] }));
  };

  const removeBundle = (i: number) => {
    setSub((s) => {
      const bundles = (s.bundles ?? []).filter((_, j) => j !== i);
      return { ...s, bundles };
    });
  };

  const setQuickFact = (i: number, patch: Partial<ManagerQuickFactRow>) => {
    setSub((s) => {
      const quickFacts = [...(s.quickFacts ?? [])];
      quickFacts[i] = { ...quickFacts[i]!, ...patch };
      return { ...s, quickFacts };
    });
  };

  const addQuickFact = () => {
    setSub((s) => ({ ...s, quickFacts: [...(s.quickFacts ?? []), emptyQuickFactRow()] }));
  };

  const removeQuickFact = (i: number) => {
    setSub((s) => ({
      ...s,
      quickFacts: (s.quickFacts ?? []).filter((_, j) => j !== i),
    }));
  };

  const onPickRoomPhotos = async (roomIndex: number, files: FileList | null) => {
    if (!files?.length) return;
    const next: string[] = [];
    for (let i = 0; i < Math.min(files.length, 6); i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for room photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    setSub((s) => {
      const rooms = [...s.rooms];
      const cur = rooms[roomIndex]!;
      rooms[roomIndex] = { ...cur, photoDataUrls: [...cur.photoDataUrls, ...next].slice(0, 8) };
      return { ...s, rooms };
    });
  };

  const onPickRoomVideo = async (roomIndex: number, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      showToast("Please choose a video file.");
      return;
    }
    const url = await fileToDataUrl(file, MAX_VID_BYTES);
    if (!url) {
      showToast(`Video too large (max ${Math.round(MAX_VID_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setRoom(roomIndex, { videoDataUrl: url });
  };

  const removeRoomPhoto = (roomIndex: number, photoIndex: number) => {
    setSub((s) => {
      const rooms = [...s.rooms];
      const cur = rooms[roomIndex]!;
      rooms[roomIndex] = {
        ...cur,
        photoDataUrls: cur.photoDataUrls.filter((_, j) => j !== photoIndex),
      };
      return { ...s, rooms };
    });
  };

  const clearRoomVideo = (roomIndex: number) => {
    setRoom(roomIndex, { videoDataUrl: null });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const roomsOk = sub.rooms.some((r) => r.name.trim() && r.monthlyRent > 0);
    if (!sub.buildingName.trim() || !sub.address.trim() || !sub.zip.trim() || !sub.neighborhood.trim()) {
      showToast("Fill in building name, address, ZIP, and neighborhood.");
      return;
    }
    if (!roomsOk) {
      showToast("Add at least one room with a name and monthly rent.");
      return;
    }
    if (sub.bathrooms.length > 0 && sub.bathrooms.every((b) => !b.name.trim())) {
      showToast("Name each bathroom or remove empty bathroom rows.");
      return;
    }

    setBusy(true);
    try {
      if (!authReady || !userId) {
        showToast("Sign in to submit a property.");
        return;
      }
      if (!isEditMode && proTierPropertyLimitReached(skuTier, propCountBeforeSubmit)) {
        showToast(`Pro includes up to ${PRO_MAX_PROPERTIES} properties. Upgrade to Business to add more.`);
        return;
      }
      if (editPendingId) {
        const ok = updatePendingManagerProperty(editPendingId, sub, userId);
        if (!ok) {
          showToast("Could not save changes.");
          return;
        }
        onSubmitted();
        return;
      }
      if (editListingId) {
        const ok = updateExtraListingFromSubmission(editListingId, userId, sub);
        if (!ok) {
          showToast("Could not save changes.");
          return;
        }
        onSubmitted();
        return;
      }
      submitManagerPendingProperty(sub, userId);
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <form
        id="manager-add-listing-form"
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[min(96vh,1080px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="shrink-0 border-b border-slate-100 p-6 pb-4 sm:p-8 sm:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{isEditMode ? "Edit listing" : "Create listing"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEditMode
                  ? "Update any field below. Save when you are done — your public listing updates from this data."
                  : "All sections are on one page. Start mostly blank and add rooms, bathrooms, amenities, and more whenever you are ready."}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <section className="border-b border-slate-100 py-8 first:pt-0" id="edit-building"><div className="mb-4"><h3 className="text-base font-bold tracking-tight text-slate-900">Building &amp; listing</h3></div><div className="space-y-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel>Building name *</FieldLabel>
                  <Input value={sub.buildingName} onChange={(e) => setSub((s) => ({ ...s, buildingName: e.target.value }))} placeholder="e.g. Pioneer Collective" />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Street address *</FieldLabel>
                  <Input value={sub.address} onChange={(e) => setSub((s) => ({ ...s, address: e.target.value }))} />
                </div>
                <div>
                  <FieldLabel>ZIP *</FieldLabel>
                  <Input value={sub.zip} onChange={(e) => setSub((s) => ({ ...s, zip: e.target.value }))} maxLength={10} />
                </div>
                <div>
                  <FieldLabel>Neighborhood *</FieldLabel>
                  <Input value={sub.neighborhood} onChange={(e) => setSub((s) => ({ ...s, neighborhood: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Listing tagline</FieldLabel>
                  <Input value={sub.tagline} onChange={(e) => setSub((s) => ({ ...s, tagline: e.target.value }))} placeholder="Short headline for search cards" />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel hint="Shown on the listing — describe the home, culture, and who it is good for.">House overview</FieldLabel>
                  <Textarea
                    className="min-h-[100px]"
                    value={sub.houseOverview}
                    onChange={(e) => setSub((s) => ({ ...s, houseOverview: e.target.value }))}
                    placeholder="Full description of the house, co-living setup, and what applicants should know."
                  />
                </div>
              </div>
          </div>
          </section>

            <section className="border-b border-slate-100 py-8" id="edit-lease"><h3 className="mb-4 text-base font-bold tracking-tight text-slate-900">Lease basics</h3><div className="space-y-6">
              <div className="space-y-3">
                <div>
                  <FieldLabel>Lease terms & lengths</FieldLabel>
                  <Textarea className="min-h-[72px]" value={sub.leaseTermsBody} onChange={(e) => setSub((s) => ({ ...s, leaseTermsBody: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Application fee</FieldLabel>
                    <Input value={sub.applicationFee} onChange={(e) => setSub((s) => ({ ...s, applicationFee: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>Security deposit</FieldLabel>
                    <Input value={sub.securityDeposit} onChange={(e) => setSub((s) => ({ ...s, securityDeposit: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>Move-in fee</FieldLabel>
                    <Input value={sub.moveInFee} onChange={(e) => setSub((s) => ({ ...s, moveInFee: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel hint="Select every charge collected when the lease is signed. Totals use your amounts below and per-room rent / utilities.">
                      Payment due at signing
                    </FieldLabel>
                    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      {PAYMENT_AT_SIGNING_OPTIONS.map((opt) => (
                        <label key={opt.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={sub.paymentAtSigningIncludes.includes(opt.id)}
                            onChange={(e) =>
                              setSub((s) => ({
                                ...s,
                                paymentAtSigningIncludes: togglePaymentAtSigning(
                                  s.paymentAtSigningIncludes,
                                  opt.id,
                                  e.target.checked,
                                ),
                              }))
                            }
                          />
                          <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Bundles (public listing)</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Optional rows for the “Bundles & leasing” table. Leave this empty and the listing will auto-build one summary from the{" "}
                    <span className="font-medium">Rooms</span> section, with per-room rent and utilities on the detail line.
                  </p>
                </div>
                {(sub.bundles ?? []).map((bundle, i) => (
                  <div key={bundle.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Bundle row {i + 1}</p>
                      <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeBundle(i)}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Shown in the Bundle column.">Bundle name</FieldLabel>
                        <Input value={bundle.label} onChange={(e) => setBundle(i, { label: e.target.value })} placeholder="e.g. Standard lease package" />
                      </div>
                      <div>
                        <FieldLabel hint="e.g. from $899/mo">Price line</FieldLabel>
                        <Input value={bundle.price} onChange={(e) => setBundle(i, { price: e.target.value })} placeholder="from $899/mo" />
                      </div>
                      <div>
                        <FieldLabel>Optional compare-at price</FieldLabel>
                        <Input value={bundle.strikethrough} onChange={(e) => setBundle(i, { strikethrough: e.target.value })} placeholder="$999/mo" />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Shown as the Offer column when set.">Offer / promo</FieldLabel>
                        <Input value={bundle.promo} onChange={(e) => setBundle(i, { promo: e.target.value })} placeholder="First month concession, etc." />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Secondary line under the bundle name — scope, rooms, or notes.">
                          Scope / rooms line
                        </FieldLabel>
                        <Textarea
                          className="min-h-[56px]"
                          value={bundle.roomsLine}
                          onChange={(e) => setBundle(i, { roomsLine: e.target.value })}
                          placeholder="Which rooms or what is included. Leave blank to pull text from each room’s rent, utilities, and furnishing."
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addBundle}>
                  + Add bundle row
                </Button>
              </div>
            </div>
          </section>

            <section className="border-b border-slate-100 py-8" id="edit-zelle"><h3 className="mb-4 text-base font-bold tracking-tight text-slate-900">Zelle &amp; payments</h3>
              <p className="text-sm text-slate-600">
                Applicants and residents can pay via Zelle using the contact you provide. You mark payments in the manager Payments tab.
              </p>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    checked={sub.zellePaymentsEnabled ?? false}
                    onChange={(e) => setSub((s) => ({ ...s, zellePaymentsEnabled: e.target.checked }))}
                  />
                  <span className="text-sm font-medium text-slate-800">Accept application fees and rent through Zelle</span>
                </label>
                <div>
                  <FieldLabel hint="Phone number or email for your Zelle account.">Zelle phone or email</FieldLabel>
                  <Input
                    value={sub.zelleContact ?? ""}
                    onChange={(e) => setSub((s) => ({ ...s, zelleContact: e.target.value }))}
                    placeholder="+1 555 010 8899 or name@email.com"
                    disabled={!(sub.zellePaymentsEnabled ?? false)}
                  />
                </div>
              </div>
            </section>

            <section className="border-b border-slate-100 py-8" id="edit-costs"><h3 className="mb-4 text-base font-bold tracking-tight text-slate-900">House costs</h3>
              <div className="space-y-3">
                <div>
                  <FieldLabel hint="Explain all recurring and one-time housing costs.">Cost summary</FieldLabel>
                  <Textarea className="min-h-[80px]" value={sub.houseCostsDetail} onChange={(e) => setSub((s) => ({ ...s, houseCostsDetail: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <FieldLabel>Parking (monthly)</FieldLabel>
                    <Input value={sub.parkingMonthly} onChange={(e) => setSub((s) => ({ ...s, parkingMonthly: e.target.value }))} placeholder="— or $ amount" />
                  </div>
                  <div>
                    <FieldLabel>HOA / community</FieldLabel>
                    <Input value={sub.hoaMonthly} onChange={(e) => setSub((s) => ({ ...s, hoaMonthly: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>Other fees</FieldLabel>
                    <Input value={sub.otherMonthlyFees} onChange={(e) => setSub((s) => ({ ...s, otherMonthlyFees: e.target.value }))} />
                  </div>
                </div>
              </div>
            </section>

            <section className="border-b border-slate-100 py-8" id="edit-rooms"><div className="space-y-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">Rooms</h3>
              <p className="text-sm text-slate-600">
                Add each rentable room, <span className="font-medium">monthly rent</span>, and <span className="font-medium">utilities estimate</span> (per
                room). Which bathroom each room uses is set in the <span className="font-medium">Bathrooms</span> section below — no need to repeat that here.
              </p>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm text-slate-500">Each room can include photos and one optional video for the listing.</p>
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addRoom}>
                  + Add room
                </Button>
              </div>
              <div className="space-y-6">
                {sub.rooms.map((room, i) => (
                  <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">Room {i + 1}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => duplicateRoom(i)} disabled={sub.rooms.length >= 8}>
                          Duplicate
                        </Button>
                        {sub.rooms.length > 1 ? (
                          <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeRoom(i)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Room name *</FieldLabel>
                        <Input value={room.name} onChange={(e) => setRoom(i, { name: e.target.value })} placeholder="Room 12A" />
                      </div>
                      <div>
                        <FieldLabel>Floor / level</FieldLabel>
                        <Input value={room.floor} onChange={(e) => setRoom(i, { floor: e.target.value })} placeholder="First floor" />
                      </div>
                      <div>
                        <FieldLabel>Monthly rent ($) *</FieldLabel>
                        <Input
                          inputMode="decimal"
                          value={room.monthlyRent || ""}
                          onChange={(e) => setRoom(i, { monthlyRent: Number(e.target.value) || 0 })}
                          placeholder="775"
                        />
                      </div>
                      <div>
                        <FieldLabel>Availability</FieldLabel>
                        <Input value={room.availability} onChange={(e) => setRoom(i, { availability: e.target.value })} />
                      </div>
                      <div>
                        <FieldLabel hint="Monthly estimate for this room (used on the listing and in signing totals).">
                          Utilities (estimate)
                        </FieldLabel>
                        <Input
                          value={room.utilitiesEstimate}
                          onChange={(e) => setRoom(i, { utilitiesEstimate: e.target.value })}
                          placeholder="e.g. $175/mo"
                        />
                      </div>
                      <div>
                        <FieldLabel hint="Furnished, semi-furnished, or what is included in this room.">Furnishing</FieldLabel>
                        <Input
                          value={room.furnishing}
                          onChange={(e) => setRoom(i, { furnishing: e.target.value })}
                          placeholder="e.g. Queen bed, desk, unfurnished"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Furniture, light, closet, desk, notes for listing card.">Room details</FieldLabel>
                        <Textarea className="min-h-[72px]" value={room.detail} onChange={(e) => setRoom(i, { detail: e.target.value })} />
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel>Photos</FieldLabel>
                        <div className="mt-2 rounded-xl border border-dashed border-slate-200/90 bg-white p-4">
                          <input
                            key={`room-photos-in-${room.id}`}
                            id={`room-photos-${room.id}`}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                              void onPickRoomPhotos(i, e.target.files);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`room-photos-${room.id}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                          >
                            Add photos
                          </label>
                          {room.photoDataUrls.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {room.photoDataUrls.map((url, pi) => (
                                <div key={`${room.id}-p-${pi}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                  <button
                                    type="button"
                                    className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/55 text-sm font-bold text-white hover:bg-black/70"
                                    onClick={() => removeRoomPhoto(i, pi)}
                                    aria-label="Remove photo"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-slate-500">No photos yet — up to 8 images (~2.6 MB each).</p>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel hint="One short clip per room (~14 MB max).">Video tour</FieldLabel>
                        <div className="mt-2 rounded-xl border border-dashed border-slate-200/90 bg-white p-4">
                          <input
                            key={`room-video-in-${room.id}`}
                            id={`room-video-${room.id}`}
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            onChange={(e) => {
                              void onPickRoomVideo(i, e.target.files?.[0] ?? null);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`room-video-${room.id}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                          >
                            {room.videoDataUrl ? "Replace video" : "Add video"}
                          </label>
                          {room.videoDataUrl ? (
                            <div className="mt-4 space-y-2">
                              <video
                                src={room.videoDataUrl}
                                controls
                                playsInline
                                className="max-h-52 w-full rounded-lg border border-slate-200 bg-black object-contain"
                              />
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:underline"
                                onClick={() => clearRoomVideo(i)}
                              >
                                Remove video
                              </button>
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-slate-500">Optional — MP4, MOV, or WebM. Preview appears after you choose a file.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

            <section className="border-b border-slate-100 py-8" id="edit-bath"><div className="space-y-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">Bathrooms</h3>
              <p className="text-sm text-slate-600">
                For each bathroom, select which rooms use it. A room can only be on one bathroom; a single room on a bath means a private / en-suite
                bath. This replaces typing the same info twice.
              </p>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm text-slate-500">Shown in the Bathrooms section on the public listing.</p>
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addBathroom}>
                  + Add bathroom
                </Button>
              </div>
              {sub.bathrooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
                  No bathrooms yet. Click <span className="font-semibold">Add bathroom</span> when you are ready — or leave empty and the public page
                  will show a placeholder until you add details.
                </p>
              ) : (
              <div className="space-y-6">
                {sub.bathrooms.map((b, i) => (
                  <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Bathroom {i + 1}</p>
                      <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeBathroom(i)}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel>Name *</FieldLabel>
                        <Input value={b.name} onChange={(e) => setBath(i, { name: e.target.value })} placeholder="Full bath (hall)" />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel>Location in building</FieldLabel>
                        <Input value={b.location} onChange={(e) => setBath(i, { location: e.target.value })} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={b.shower} onChange={(e) => setBath(i, { shower: e.target.checked })} />
                        Shower
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={b.toilet} onChange={(e) => setBath(i, { toilet: e.target.checked })} />
                        Toilet
                      </label>
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input type="checkbox" checked={b.bathtub} onChange={(e) => setBath(i, { bathtub: e.target.checked })} />
                        Bathtub
                      </label>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Selecting a room here unchecks it from other bathrooms. One room alone means private / en-suite.">
                          Used by these rooms
                        </FieldLabel>
                        <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          {sub.rooms.map((room) => (
                            <label key={`${b.id}-${room.id}`} className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300"
                                checked={(b.assignedRoomIds ?? []).includes(room.id)}
                                onChange={(e) => toggleBathroomRoom(i, room.id, e.target.checked)}
                              />
                              <span className="font-medium text-slate-800">{room.name.trim() || `Room (${room.id.slice(-6)})`}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>

            <section className="border-b border-slate-100 py-8" id="edit-shared"><div className="space-y-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">Shared spaces</h3>
              <p className="text-sm text-slate-600">
                Add each common area (kitchen, laundry, yard, etc.), then choose which bedrooms have access. A room can access multiple spaces
                (unlike bathrooms, where each room is assigned to one bath).
              </p>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm text-slate-500">Shown as separate rows on the public listing.</p>
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addSharedSpace}>
                  + Add shared space
                </Button>
              </div>
              {sub.sharedSpaces.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
                  No shared spaces yet. Click <span className="font-semibold">Add shared space</span> to list kitchens, laundry, living room, yard,
                  etc.
                </p>
              ) : (
                <div className="space-y-6">
                  {sub.sharedSpaces.map((sp, i) => (
                    <div key={sp.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">Shared space {i + 1}</p>
                        <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeSharedSpace(i)}>
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <FieldLabel>Name *</FieldLabel>
                          <Input
                            value={sp.name}
                            onChange={(e) => setSharedSpace(i, { name: e.target.value })}
                            placeholder="e.g. Kitchen & dining, Laundry, Backyard"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Rules, hours, equipment, parking for guests, etc.">Details</FieldLabel>
                          <Textarea
                            className="min-h-[72px]"
                            value={sp.detail}
                            onChange={(e) => setSharedSpace(i, { detail: e.target.value })}
                            placeholder="How the space works, what’s included, any house rules."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Rooms that may use this space (same room can be checked on multiple spaces).">Room access</FieldLabel>
                          <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            {sub.rooms.map((room) => (
                              <label key={`${sp.id}-acc-${room.id}`} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300"
                                  checked={(sp.roomAccessIds ?? []).includes(room.id)}
                                  onChange={(e) => toggleSharedSpaceRoom(i, room.id, e.target.checked)}
                                />
                                <span className="font-medium text-slate-800">{room.name.trim() || `Room (${room.id.slice(-6)})`}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

            <section className="border-b border-slate-100 py-8" id="edit-quick-facts"><div className="space-y-4">
              <div>
                <h3 className="text-base font-bold tracking-tight text-slate-900">Quick facts (sidebar)</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Optional. When you add rows here, they replace the auto-generated sidebar facts on the public listing. Leave empty to derive from your
                  building and room data.
                </p>
              </div>
              {(sub.quickFacts ?? []).map((qf, i) => (
                <div key={qf.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div>
                    <FieldLabel>Label</FieldLabel>
                    <Input value={qf.label} onChange={(e) => setQuickFact(i, { label: e.target.value })} placeholder="e.g. Neighborhood" />
                  </div>
                  <div>
                    <FieldLabel>Value</FieldLabel>
                    <Input value={qf.value} onChange={(e) => setQuickFact(i, { value: e.target.value })} placeholder="—" />
                  </div>
                  <button type="button" className="text-xs font-semibold text-rose-600 hover:underline sm:pb-2" onClick={() => removeQuickFact(i)}>
                    Remove
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addQuickFact}>
                + Add quick fact
              </Button>
            </div></section>

            <section className="py-8" id="edit-amenities"><div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Amenities</h3>
                <p className="mt-1 text-sm text-slate-600">
                  House-wide amenities for the listing grid. Per-room furnishing belongs in the <span className="font-medium">Rooms</span> section above.
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <input
                  type="checkbox"
                  checked={sub.petFriendly}
                  onChange={(e) => setSub((s) => ({ ...s, petFriendly: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-800">Pet-friendly (subject to approval)</span>
              </label>
              <div>
                <FieldLabel hint="One per line or comma-separated — drives the Amenities section on the public listing.">
                  Amenities list
                </FieldLabel>
                <Textarea className="mt-3 min-h-[140px]" value={sub.amenitiesText} onChange={(e) => setSub((s) => ({ ...s, amenitiesText: e.target.value }))} />
              </div>
            </div></section>
        </div>

        <div className="sticky bottom-0 z-20 flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-12px_rgba(15,23,42,0.14)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button type="submit" form="manager-add-listing-form" className="rounded-full" disabled={busy}>
            {busy ? (isEditMode ? "Saving…" : "Submitting…") : isEditMode ? "Save listing" : "Submit for approval"}
          </Button>
        </div>
      </form>
    </div>
  );
}

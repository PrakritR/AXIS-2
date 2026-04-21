"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
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
  emptyRoom,
  type ManagerBathroomSubmission,
  type ManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";

const MAX_IMG_BYTES = 2.6 * 1024 * 1024;
const MAX_VID_BYTES = 14 * 1024 * 1024;

const STEP_LABELS = [
  "Building & listing",
  "Lease basics",
  "Zelle & payments",
  "House costs",
  "Rooms",
  "Bathrooms",
  "Shared spaces",
  "Amenities",
] as const;

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
  const [step, setStep] = useState(0);
  const { userId, ready: authReady } = useManagerUserId();

  const lastStep = STEP_LABELS.length - 1;
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

  const addRoom = () => {
    if (sub.rooms.length >= 8) return;
    setSub((s) => ({ ...s, rooms: [...s.rooms, emptyRoom(s.rooms.length)] }));
  };

  const removeRoom = (i: number) => {
    if (sub.rooms.length <= 1) return;
    setSub((s) => ({ ...s, rooms: s.rooms.filter((_, j) => j !== i) }));
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
    if (sub.bathrooms.length <= 1) return;
    setSub((s) => ({ ...s, bathrooms: s.bathrooms.filter((_, j) => j !== i) }));
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
    if (step !== lastStep) return;
    const roomsOk = sub.rooms.some((r) => r.name.trim() && r.monthlyRent > 0);
    if (!sub.buildingName.trim() || !sub.address.trim() || !sub.zip.trim() || !sub.neighborhood.trim()) {
      showToast("Fill in building name, address, ZIP, and neighborhood.");
      setStep(0);
      return;
    }
    if (!roomsOk) {
      showToast("Add at least one room with a name and monthly rent.");
      setStep(4);
      return;
    }
    if (sub.bathrooms.every((b) => !b.name.trim())) {
      showToast("Add at least one bathroom name.");
      setStep(5);
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
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && step !== lastStep && (e.target as HTMLElement).tagName !== "TEXTAREA") {
            e.preventDefault();
          }
        }}
        className="relative z-10 flex max-h-[min(94vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="shrink-0 border-b border-slate-100 p-6 pb-4 sm:p-8 sm:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{isEditMode ? "Edit listing" : "Add a house"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEditMode
                  ? "Update your listing details below. Saves apply to your portfolio and public listing."
                  : "Step through each section. Everything you enter is used to build the public listing."}
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

          <div className="mt-5">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>
                Step {step + 1} of {STEP_LABELS.length}
              </span>
              <span className="text-slate-700">{STEP_LABELS[step]}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {step === 0 ? (
            <section className="space-y-0">
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
                <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={sub.petFriendly}
                    onChange={(e) => setSub((s) => ({ ...s, petFriendly: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-800">Pet-friendly (subject to approval)</span>
                </label>
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
            </section>
          ) : null}

          {step === 1 ? (
            <section>
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
                  <div>
                    <FieldLabel hint="Leave blank to show applicants deposit + move-in total automatically on the listing.">
                      Payment due at signing
                    </FieldLabel>
                    <Input
                      value={sub.paymentAtSigning}
                      onChange={(e) => setSub((s) => ({ ...s, paymentAtSigning: e.target.value }))}
                      placeholder="Optional override, e.g. $650"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Utilities (estimate)</FieldLabel>
                    <Input value={sub.utilitiesMonthly} onChange={(e) => setSub((s) => ({ ...s, utilitiesMonthly: e.target.value }))} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
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
          ) : null}

          {step === 3 ? (
            <section>
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
          ) : null}

          {step === 4 ? (
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm text-slate-600">Each room can include photos and one optional video for the listing.</p>
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
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Furniture, light, closet, desk, notes for listing card.">Room details</FieldLabel>
                        <Textarea className="min-h-[72px]" value={room.detail} onChange={(e) => setRoom(i, { detail: e.target.value })} />
                      </div>
                      <div>
                        <FieldLabel>Bathroom</FieldLabel>
                        <Select
                          value={room.bathroomSetup}
                          onChange={(e) => setRoom(i, { bathroomSetup: e.target.value as ManagerRoomSubmission["bathroomSetup"] })}
                        >
                          <option value="private">Private / en-suite</option>
                          <option value="shared">Shared with other rooms</option>
                        </Select>
                      </div>
                      <div>
                        <FieldLabel hint="If shared, list which rooms share the same bath.">Shares bath with</FieldLabel>
                        <Input
                          value={room.sharesBathWith}
                          onChange={(e) => setRoom(i, { sharesBathWith: e.target.value })}
                          placeholder="e.g. Room 2, Room 3"
                          disabled={room.bathroomSetup === "private"}
                        />
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
            </section>
          ) : null}

          {step === 5 ? (
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm text-slate-600">Shown in the Bathrooms table on the listing.</p>
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addBathroom}>
                  + Add bathroom
                </Button>
              </div>
              <div className="space-y-6">
                {sub.bathrooms.map((b, i) => (
                  <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Bathroom {i + 1}</p>
                      {sub.bathrooms.length > 1 ? (
                        <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeBathroom(i)}>
                          Remove
                        </button>
                      ) : null}
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
                        <FieldLabel>Shared by which rooms?</FieldLabel>
                        <Input
                          value={b.sharedByRooms}
                          onChange={(e) => setBath(i, { sharedByRooms: e.target.value })}
                          placeholder="e.g. Room 1, Room 2"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {step === 6 ? (
            <section>
              <FieldLabel>Shared spaces</FieldLabel>
              <Textarea
                className="mt-2 min-h-[120px]"
                value={sub.sharedSpacesDescription}
                onChange={(e) => setSub((s) => ({ ...s, sharedSpacesDescription: e.target.value }))}
                placeholder="Kitchen, laundry, living room, yard, theater, etc."
              />
            </section>
          ) : null}

          {step === 7 ? (
            <section>
              <p className="text-xs text-slate-500">One per line or comma-separated — matches the amenities grid on the listing.</p>
              <Textarea className="mt-3 min-h-[140px]" value={sub.amenitiesText} onChange={(e) => setSub((s) => ({ ...s, amenitiesText: e.target.value }))} />
            </section>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </Button>
            ) : null}
            {step < lastStep ? (
              <Button type="button" className="rounded-full" disabled={busy} onClick={() => setStep((s) => Math.min(lastStep, s + 1))}>
                Next
              </Button>
            ) : (
              <Button type="submit" className="rounded-full" disabled={busy}>
                {busy ? (isEditMode ? "Saving…" : "Submitting…") : isEditMode ? "Save changes" : "Submit for approval"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

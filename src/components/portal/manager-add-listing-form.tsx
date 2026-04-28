"use client";

import type { DragEvent, FormEvent, ReactNode } from "react";
import { Children, useEffect, useRef, useState } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  submitManagerPendingProperty,
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
  duplicateRoomEntry,
  emptyBathroom,
  emptyBundleRow,
  emptyQuickFactRow,
  emptyRoom,
  emptySharedSpace,
  PAYMENT_AT_SIGNING_OPTIONS,
  type ManagerBathroomRoomAccessKind,
  type ManagerBathroomSubmission,
  type ManagerBundleRow,
  type ManagerListingSubmissionV1,
  type ManagerQuickFactRow,
  type ManagerRoomSubmission,
  type ManagerSharedSpaceSubmission,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";
import {
  BATHROOM_EXTRA_AMENITY_PRESETS,
  HOUSE_WIDE_AMENITY_PRESETS,
  ROOM_AMENITY_PRESETS,
  ROOM_AVAILABILITY_OPTIONS,
  ROOM_FURNISHING_OPTIONS,
  SHARED_SPACE_AMENITY_PRESETS,
  furnishingSelectState,
  mergeToggleLine,
  splitLineList,
} from "@/data/manager-listing-presets";

const selectInputCls =
  "min-h-[44px] w-full rounded-xl border border-black/[0.08] bg-black/[0.04] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] outline-none transition focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20";

const HOUSE_WIDE_AMENITY_LABEL_SET = new Set(HOUSE_WIDE_AMENITY_PRESETS.map((p) => p.label));
const SHARED_SPACE_AMENITY_LABEL_SET = new Set(SHARED_SPACE_AMENITY_PRESETS.map((p) => p.label));
const BATHROOM_EXTRA_AMENITY_LABEL_SET = new Set(BATHROOM_EXTRA_AMENITY_PRESETS.map((p) => p.label));
const ROOM_AMENITY_LABEL_SET = new Set(ROOM_AMENITY_PRESETS.map((p) => p.label));

/** Lines in `fullText` that are not preset labels (free-form additions). */
function extraLinesOutsidePresetSet(fullText: string, presetSet: Set<string>): string {
  return splitLineList(fullText)
    .filter((l) => !presetSet.has(l))
    .join("\n");
}

/** Replace non-preset lines while keeping preset lines exactly as they appear in `fullText`. */
function setExtraLinesPreservingPresets(fullText: string, extraRaw: string, presetSet: Set<string>): string {
  const presetLines = splitLineList(fullText).filter((l) => presetSet.has(l));
  const extraLines = splitLineList(extraRaw);
  return [...new Set([...presetLines, ...extraLines])].join("\n");
}

function FormSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
      {description ? <div className="mt-1 text-sm text-slate-600">{description}</div> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

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

const MAX_IMG_BYTES = 10 * 1024 * 1024;
const MAX_VID_BYTES = 14 * 1024 * 1024;
const MAX_HOUSE_PHOTOS = 12;
/** Max pixel width after compression — keeps localStorage size manageable. */
const IMG_MAX_WIDTH = 1280;
const IMG_QUALITY = 0.75;

function mediaDropZoneClass(active: boolean) {
  return `rounded-xl border border-dashed p-4 transition ${
    active
      ? "border-primary/50 bg-primary/[0.06] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
      : "border-slate-200/90 bg-white hover:border-primary/30 hover:bg-primary/[0.03]"
  }`;
}

/** Multi-step flow — 5 steps, combining related sections to reduce friction. */
const LISTING_FORM_STEPS = [
  { id: "building", label: "Building" },
  { id: "lease", label: "Lease & costs" },
  { id: "rooms", label: "Rooms" },
  { id: "spaces", label: "Bathrooms & spaces" },
  { id: "amenities", label: "Amenities" },
] as const;

const LISTING_STEP_COUNT = LISTING_FORM_STEPS.length;

/** Reads a file and returns a compressed JPEG data URL. Falls back to raw data URL for non-image files. */
async function fileToDataUrl(file: File, maxBytes: number): Promise<string | null> {
  if (file.size > maxBytes) return null;
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(1, IMG_MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMG_QUALITY));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
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

/** In CSS grid rows, bottom-aligns the control with siblings when label/hint blocks differ in height. */
function GridField({ children }: { children: React.ReactNode }) {
  const parts = Children.toArray(children);
  if (parts.length !== 2) {
    return <>{children}</>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">{parts[0]}</div>
      <div className="mt-auto w-full shrink-0">{parts[1]}</div>
    </div>
  );
}

function ListingSubsection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-xl border border-slate-200/90 bg-slate-50/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:p-5">
      <div className="border-b border-slate-200/70 pb-3">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        {description ? <div className="mt-1 text-xs leading-relaxed text-slate-600">{description}</div> : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
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
  const [sub, setSub] = useState<ManagerListingSubmissionV1>(() =>
    initialSubmission ? normalizeManagerListingSubmissionV1(initialSubmission) : createDefaultListingSubmission(),
  );
  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showQuickFacts, setShowQuickFacts] = useState(() => Boolean(initialSubmission?.quickFacts?.length));
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { userId, ready: authReady } = useManagerUserId();

  const isEditMode = Boolean(editPendingId ?? editListingId);
  const lastStepIndex = LISTING_STEP_COUNT - 1;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIndex]);

  const canContinueFromStep = (i: number): boolean => {
    if (i === 0) {
      if (!sub.buildingName.trim() || !sub.address.trim() || !sub.zip.trim() || !sub.neighborhood.trim()) {
        showToast("Fill in building name, address, ZIP, and neighborhood to continue.");
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!canContinueFromStep(stepIndex)) return;
    setStepIndex((s) => Math.min(s + 1, lastStepIndex));
  };

  const goPrev = () => setStepIndex((s) => Math.max(0, s - 1));

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
      bathrooms: s.bathrooms.map((b) => {
        const assignedRoomIds = (b.assignedRoomIds ?? []).filter((id) => id !== removedId);
        let accessKindByRoomId = b.accessKindByRoomId;
        if (accessKindByRoomId?.[removedId]) {
          accessKindByRoomId = { ...accessKindByRoomId };
          delete accessKindByRoomId[removedId];
          if (Object.keys(accessKindByRoomId).length === 0) accessKindByRoomId = undefined;
        }
        return { ...b, assignedRoomIds, accessKindByRoomId };
      }),
      sharedSpaces: s.sharedSpaces.map((ss) => ({
        ...ss,
        roomAccessIds: (ss.roomAccessIds ?? []).filter((id) => id !== removedId),
      })),
    }));
  };

  const toggleBathroomRoom = (bathIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      if (s.bathrooms[bathIndex]?.allResidents) return s;
      const nextBathrooms = s.bathrooms.map((b, bi) => {
        if (bi === bathIndex) {
          const set = new Set(b.assignedRoomIds ?? []);
          if (on) set.add(roomId);
          else set.delete(roomId);
          const nextIds = s.rooms.map((r) => r.id).filter((id) => set.has(id));
          let access = b.accessKindByRoomId;
          if (!on && access?.[roomId]) {
            access = { ...access };
            delete access[roomId];
            if (Object.keys(access).length === 0) access = undefined;
          }
          return { ...b, assignedRoomIds: nextIds, accessKindByRoomId: access };
        }
        if (on && !b.allResidents) {
          return { ...b, assignedRoomIds: (b.assignedRoomIds ?? []).filter((id) => id !== roomId) };
        }
        return b;
      });
      return { ...s, bathrooms: nextBathrooms };
    });
  };

  const setBathRoomAccessKind = (bathIndex: number, roomId: string, value: "" | ManagerBathroomRoomAccessKind) => {
    setSub((s) => {
      const bathrooms = [...s.bathrooms];
      const b = bathrooms[bathIndex];
      if (!b || b.allResidents) return s;
      if (!(b.assignedRoomIds ?? []).includes(roomId)) return s;
      const nextAccess: Partial<Record<string, ManagerBathroomRoomAccessKind>> = { ...(b.accessKindByRoomId ?? {}) };
      if (!value) delete nextAccess[roomId];
      else nextAccess[roomId] = value;
      bathrooms[bathIndex] = {
        ...b,
        accessKindByRoomId: Object.keys(nextAccess).length ? nextAccess : undefined,
      };
      return { ...s, bathrooms };
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

  const toggleBundleRoom = (bundleIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      const cur = bundles[bundleIndex];
      if (!cur) return s;
      const nextSet = new Set(cur.includedRoomIds ?? []);
      if (on) nextSet.add(roomId);
      else nextSet.delete(roomId);
      const includedRoomIds = s.rooms.map((r) => r.id).filter((id) => nextSet.has(id));
      bundles[bundleIndex] = { ...cur, includedRoomIds };
      return { ...s, bundles };
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

  const onPickHousePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const cur = sub.housePhotoDataUrls ?? [];
    const remaining = MAX_HOUSE_PHOTOS - cur.length;
    if (remaining <= 0) {
      showToast(`You can add up to ${MAX_HOUSE_PHOTOS} house photos.`);
      return;
    }
    const next: string[] = [...cur];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for house photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    setSub((s) => ({ ...s, housePhotoDataUrls: next }));
  };

  const removeHousePhoto = (photoIndex: number) => {
    setSub((s) => ({
      ...s,
      housePhotoDataUrls: (s.housePhotoDataUrls ?? []).filter((_, j) => j !== photoIndex),
    }));
  };

  const clearRoomVideo = (roomIndex: number) => {
    setRoom(roomIndex, { videoDataUrl: null });
  };

  const activateDropZone = (zoneId: string) => {
    setActiveDropZone(zoneId);
  };

  const deactivateDropZone = (zoneId?: string) => {
    setActiveDropZone((current) => (zoneId && current !== zoneId ? current : null));
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, zoneId: string) => {
    event.preventDefault();
    event.stopPropagation();
    activateDropZone(zoneId);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>, zoneId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    deactivateDropZone(zoneId);
  };

  const onDropHousePhotos = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone("house-photos");
    void onPickHousePhotos(event.dataTransfer.files);
  };

  const onDropRoomPhotos = (roomIndex: number, roomId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`room-photos-${roomId}`);
    void onPickRoomPhotos(roomIndex, event.dataTransfer.files);
  };

  const onDropRoomVideo = (roomIndex: number, roomId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`room-video-${roomId}`);
    void onPickRoomVideo(roomIndex, event.dataTransfer.files?.[0] ?? null);
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
      if (!isEditMode && managerTierPropertyLimitReached(skuTier, propCountBeforeSubmit)) {
        const n = normalizeManagerSkuTier(skuTier);
        showToast(
          n === "free"
            ? `Free includes ${FREE_MAX_PROPERTIES} property. Upgrade to Pro or Business to add more.`
            : n === "pro"
              ? `Pro includes up to ${PRO_MAX_PROPERTIES} properties. Upgrade to Business to add more.`
              : `Business includes up to ${BUSINESS_MAX_PROPERTIES} properties.`,
        );
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
        showToast("Listing saved. It is pending admin review before it appears on Rent with Axis again.");
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4 lg:p-6">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <form
        id="manager-add-listing-form"
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)]"
      >
        <div className="shrink-0 border-b border-slate-100 p-6 pb-4 sm:p-8 sm:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{isEditMode ? "Edit listing" : "Create listing"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEditMode
                  ? "Update any step below. Use Back and Continue to move between categories, then save when you are done — your public listing updates from this data."
                  : "Work through each step. You can go back to change anything. Most fields are optional until you add rooms and submit at the end."}
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
          <div className="mt-4 flex flex-wrap items-center gap-1">
            {LISTING_FORM_STEPS.map((step, i) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (i < stepIndex || canContinueFromStep(stepIndex)) setStepIndex(i);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  i === stepIndex
                    ? "bg-primary text-white"
                    : i < stepIndex
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "text-slate-400"
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${((stepIndex + 1) / LISTING_STEP_COUNT) * 100}%` }}
            />
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {/* ── Step 0: Building & listing ── */}
          {stepIndex === 0 ? (
          <FormSection
            id="edit-building"
            title="Building & listing"
            description="Address, photos, and public description."
          >
            <div className="mb-6">
              <ListingSubsection
                title="House photos"
                description="Exterior, kitchen, living areas — appear at the top of your public listing."
              >
                <div>
                  <div
                    className={`mt-2 ${mediaDropZoneClass(activeDropZone === "house-photos")}`}
                    onDragOver={(e) => handleDragOver(e, "house-photos")}
                    onDragEnter={(e) => handleDragOver(e, "house-photos")}
                    onDragLeave={(e) => handleDragLeave(e, "house-photos")}
                    onDrop={onDropHousePhotos}
                  >
                    <input
                      id="house-photos-input"
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void onPickHousePhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor="house-photos-input"
                      className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                    >
                      Add house photos
                    </label>
                    <p className="mt-3 text-sm text-slate-600">Drag and drop photos here, or use the button above.</p>
                    {(sub.housePhotoDataUrls?.length ?? 0) > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(sub.housePhotoDataUrls ?? []).map((url, pi) => (
                          <div key={`house-p-${pi}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/55 text-sm font-bold text-white hover:bg-black/70"
                              onClick={() => removeHousePhoto(pi)}
                              aria-label="Remove photo"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-500">Up to {MAX_HOUSE_PHOTOS} photos. Images are auto-compressed for fast loading.</p>
                    )}
                  </div>
                </div>
              </ListingSubsection>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Building name *</FieldLabel>
                <Input value={sub.buildingName} onChange={(e) => setSub((s) => ({ ...s, buildingName: e.target.value }))} placeholder="e.g. Pioneer Collective" />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Street address *</FieldLabel>
                <Input value={sub.address} onChange={(e) => setSub((s) => ({ ...s, address: e.target.value }))} />
              </div>
              <GridField>
                <FieldLabel>ZIP *</FieldLabel>
                <Input value={sub.zip} onChange={(e) => setSub((s) => ({ ...s, zip: e.target.value }))} maxLength={10} />
              </GridField>
              <GridField>
                <FieldLabel>Neighborhood *</FieldLabel>
                <Input value={sub.neighborhood} onChange={(e) => setSub((s) => ({ ...s, neighborhood: e.target.value }))} />
              </GridField>
              <div className="sm:col-span-2">
                <FieldLabel>Listing tagline</FieldLabel>
                <Input value={sub.tagline} onChange={(e) => setSub((s) => ({ ...s, tagline: e.target.value }))} placeholder="Short headline for search cards" />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel hint="Describe the home, culture, and who it is good for.">House overview</FieldLabel>
                <Textarea
                  className="min-h-[100px]"
                  value={sub.houseOverview}
                  onChange={(e) => setSub((s) => ({ ...s, houseOverview: e.target.value }))}
                  placeholder="Full description of the house, co-living setup, and what applicants should know."
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel hint="Quiet hours, guests, smoking, shared spaces.">House rules</FieldLabel>
                <Textarea
                  className="min-h-[80px]"
                  value={sub.houseRulesText}
                  onChange={(e) => setSub((s) => ({ ...s, houseRulesText: e.target.value }))}
                  placeholder="e.g. Quiet hours 10pm–8am · No smoking indoors"
                />
              </div>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 1: Lease, fees & costs ── */}
          {stepIndex === 1 ? (
          <FormSection
            id="edit-lease"
            title="Lease, fees & costs"
            description={
              <>Leave money fields blank or $0 to hide them on the public listing.</>
            }
          >
            <div className="space-y-5">
              <ListingSubsection title="Lease terms">
                <div>
                  <FieldLabel hint="Lease lengths and terms shown on your listing.">Lease terms</FieldLabel>
                  <Textarea className="min-h-[72px]" value={sub.leaseTermsBody} onChange={(e) => setSub((s) => ({ ...s, leaseTermsBody: e.target.value }))} />
                </div>
              </ListingSubsection>

              <ListingSubsection title="Fees">
                <div className="grid gap-3 sm:grid-cols-3">
                  <GridField>
                    <FieldLabel>Application fee</FieldLabel>
                    <Input value={sub.applicationFee} onChange={(e) => setSub((s) => ({ ...s, applicationFee: e.target.value }))} placeholder="$50 or Waived" />
                  </GridField>
                  <GridField>
                    <FieldLabel>Security deposit</FieldLabel>
                    <Input value={sub.securityDeposit} onChange={(e) => setSub((s) => ({ ...s, securityDeposit: e.target.value }))} placeholder="$500" />
                  </GridField>
                  <GridField>
                    <FieldLabel>Move-in fee</FieldLabel>
                    <Input value={sub.moveInFee} onChange={(e) => setSub((s) => ({ ...s, moveInFee: e.target.value }))} placeholder="$200 or —" />
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Leave blank or $0 to hide.">Parking (monthly)</FieldLabel>
                    <Input value={sub.parkingMonthly} onChange={(e) => setSub((s) => ({ ...s, parkingMonthly: e.target.value }))} placeholder="$150 or —" />
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Leave blank or $0 to hide.">HOA / community</FieldLabel>
                    <Input value={sub.hoaMonthly} onChange={(e) => setSub((s) => ({ ...s, hoaMonthly: e.target.value }))} placeholder="—" />
                  </GridField>
                  <GridField>
                    <FieldLabel>Other monthly fees</FieldLabel>
                    <Input value={sub.otherMonthlyFees} onChange={(e) => setSub((s) => ({ ...s, otherMonthlyFees: e.target.value }))} placeholder="—" />
                  </GridField>
                </div>
                <div className="mt-3">
                  <FieldLabel hint="Explain all recurring and one-time housing costs (shown on your listing).">Cost summary</FieldLabel>
                  <Textarea className="min-h-[72px]" value={sub.houseCostsDetail} onChange={(e) => setSub((s) => ({ ...s, houseCostsDetail: e.target.value }))} />
                </div>
              </ListingSubsection>

              <ListingSubsection
                title="Payment at signing"
                description="Select every charge collected when the lease is signed."
              >
                <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                  {PAYMENT_AT_SIGNING_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={sub.paymentAtSigningIncludes.includes(opt.id)}
                        onChange={(e) =>
                          setSub((s) => ({
                            ...s,
                            paymentAtSigningIncludes: togglePaymentAtSigning(s.paymentAtSigningIncludes, opt.id, e.target.checked),
                          }))
                        }
                      />
                      <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </ListingSubsection>

              <ListingSubsection
                id="edit-zelle"
                title="Application fee payment methods"
                description="Choose how applicants can pay the application fee."
              >
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={sub.applicationFeeStripeEnabled !== false}
                      onChange={(e) => setSub((s) => ({ ...s, applicationFeeStripeEnabled: e.target.checked }))}
                    />
                    <span className="text-sm font-medium text-slate-800">Stripe (card)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={Boolean(sub.zellePaymentsEnabled)}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSub((s) => ({
                          ...s,
                          zellePaymentsEnabled: on,
                          applicationFeeZelleEnabled: on,
                        }));
                      }}
                    />
                    <span className="text-sm font-medium text-slate-800">Zelle</span>
                  </label>
                </div>
                {sub.zellePaymentsEnabled ? (
                  <div className="mt-3">
                    <FieldLabel hint="Shown to applicants when they select Zelle.">Zelle phone or email</FieldLabel>
                    <Input
                      value={sub.zelleContact ?? ""}
                      onChange={(e) => setSub((s) => ({ ...s, zelleContact: e.target.value }))}
                      placeholder="+1 555 010 8899 or name@email.com"
                    />
                  </div>
                ) : null}
              </ListingSubsection>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 2: Rooms ── */}
          {stepIndex === 2 ? (
          <FormSection
            id="edit-rooms"
            title="Rooms"
            description="Add each rentable room with rent and utilities. Bathroom assignments are in the next step."
          >
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm text-slate-500">Photos and one optional video per room.</p>
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addRoom}>
                + Add room
              </Button>
            </div>
            <div className="space-y-6">
              {sub.rooms.map((room, i) => {
                const furnishState = furnishingSelectState(room.furnishing);
                return (
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
                      <GridField>
                        <FieldLabel>Room name *</FieldLabel>
                        <Input value={room.name} onChange={(e) => setRoom(i, { name: e.target.value })} placeholder="Room 12A" />
                      </GridField>
                      <GridField>
                        <FieldLabel hint="e.g. first floor, garden level.">Floor / level</FieldLabel>
                        <Input value={room.floor} onChange={(e) => setRoom(i, { floor: e.target.value })} placeholder="First floor" />
                      </GridField>
                      <GridField>
                        <FieldLabel>Monthly rent ($) *</FieldLabel>
                        <Input
                          inputMode="decimal"
                          value={room.monthlyRent || ""}
                          onChange={(e) => setRoom(i, { monthlyRent: Number(e.target.value) || 0 })}
                          placeholder="775"
                        />
                      </GridField>
                      <GridField>
                        <FieldLabel hint="Monthly estimate used in signing totals.">Utilities estimate</FieldLabel>
                        <Input
                          value={room.utilitiesEstimate}
                          onChange={(e) => setRoom(i, { utilitiesEstimate: e.target.value })}
                          placeholder="$175/mo"
                        />
                      </GridField>
                      <GridField>
                        <FieldLabel>Availability</FieldLabel>
                        <div>
                          <Input
                            value={room.availability}
                            onChange={(e) => setRoom(i, { availability: e.target.value })}
                            list={`room-avail-${room.id}`}
                            placeholder="Available now"
                          />
                          <datalist id={`room-avail-${room.id}`}>
                            {ROOM_AVAILABILITY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt} />
                            ))}
                          </datalist>
                        </div>
                      </GridField>
                      <GridField>
                        <FieldLabel>Furnishing</FieldLabel>
                        <select
                          className={selectInputCls}
                          value={furnishState.select}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__custom__") {
                              const c = furnishState.custom;
                              setRoom(i, { furnishing: c.trim().length > 0 ? c : " " });
                            } else setRoom(i, { furnishing: v });
                          }}
                        >
                          {ROOM_FURNISHING_OPTIONS.map((o) => (
                            <option key={o.value || "blank"} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </GridField>
                      {furnishState.select === "__custom__" ? (
                        <div className="sm:col-span-2">
                          <FieldLabel>Custom furnishing details</FieldLabel>
                          <Textarea
                            className="min-h-[56px]"
                            value={room.furnishing}
                            onChange={(e) => setRoom(i, { furnishing: e.target.value })}
                            placeholder="e.g. Queen bed, desk, dresser — tenant brings linens"
                          />
                        </div>
                      ) : null}
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Check common items; add extras below.">Room amenities</FieldLabel>
                        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                          {ROOM_AMENITY_PRESETS.map((p) => {
                            const on = splitLineList(room.roomAmenitiesText).includes(p.label);
                            return (
                              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300"
                                  checked={on}
                                  onChange={(e) =>
                                    setRoom(i, {
                                      roomAmenitiesText: mergeToggleLine(room.roomAmenitiesText, p.label, e.target.checked),
                                    })
                                  }
                                />
                                <span className="font-medium text-slate-800">{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <Textarea
                          className="mt-2 min-h-[48px]"
                          value={extraLinesOutsidePresetSet(room.roomAmenitiesText, ROOM_AMENITY_LABEL_SET)}
                          onChange={(e) =>
                            setRoom(i, {
                              roomAmenitiesText: setExtraLinesPreservingPresets(room.roomAmenitiesText, e.target.value, ROOM_AMENITY_LABEL_SET),
                            })
                          }
                          placeholder="One per line — e.g. Window AC unit, Murphy bed…"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Notes for listing card (closet size, light, layout).">Room details</FieldLabel>
                        <Textarea className="min-h-[60px]" value={room.detail} onChange={(e) => setRoom(i, { detail: e.target.value })} />
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel>Photos</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `room-photos-${room.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `room-photos-${room.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `room-photos-${room.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `room-photos-${room.id}`)}
                          onDrop={(e) => onDropRoomPhotos(i, room.id, e)}
                        >
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
                          <p className="mt-3 text-sm text-slate-600">Drag and drop room photos here, or use the button above.</p>
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
                            <p className="mt-3 text-[11px] text-slate-500">No photos yet — up to 8 images. Images are auto-compressed.</p>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel hint="One short clip per room (~14 MB max).">Video tour</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `room-video-${room.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `room-video-${room.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `room-video-${room.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `room-video-${room.id}`)}
                          onDrop={(e) => onDropRoomVideo(i, room.id, e)}
                        >
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
                          <p className="mt-3 text-sm text-slate-600">Drag and drop one room video here, or use the button above.</p>
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
                );
              })}
            </div>
          </FormSection>
          ) : null}

          {stepIndex === 5 ? (
          <FormSection
            id="edit-bath"
            title="Bathrooms"
            description={'Group the public listing by bathroom: assign each bedroom to the bath row it uses. A room can use a private suite bath and still share a whole-house hall bath — use "Whole-house" for the common one. Add finishes (dual vanities, walk-in shower, etc.) under Bathroom amenities.'}
          >
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
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                            checked={Boolean(b.allResidents)}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setBath(i, {
                                allResidents: on,
                                assignedRoomIds: on ? [] : (b.assignedRoomIds ?? []),
                                accessKindByRoomId: on ? undefined : b.accessKindByRoomId,
                              });
                            }}
                          />
                          <span className="text-sm font-medium text-slate-800">
                            Whole-house / hall bathroom — all listed bedrooms use it (no per-room checkboxes)
                          </span>
                        </label>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="For non–whole-house baths: checking a room here removes it from other bath rows (except whole-house). Use the situation menu for en suite vs shared wording on the listing.">
                          Used by these rooms
                        </FieldLabel>
                        {b.allResidents ? (
                          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                            This bathroom applies to every named room on the listing. Add another bathroom row for suite or shared setups between specific rooms.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            {sub.rooms.map((room) => {
                              const checked = (b.assignedRoomIds ?? []).includes(room.id);
                              return (
                                <div key={`${b.id}-${room.id}`} className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 shrink-0 rounded border-slate-300"
                                      checked={checked}
                                      onChange={(e) => toggleBathroomRoom(i, room.id, e.target.checked)}
                                    />
                                    <span className="font-medium text-slate-800">{room.name.trim() || `Room (${room.id.slice(-6)})`}</span>
                                  </label>
                                  {checked ? (
                                    <div className="mt-2 pl-6">
                                      <label className="block text-[11px] font-semibold text-slate-600">Bathroom situation for this room</label>
                                      <select
                                        className={`${selectInputCls} mt-1 text-xs`}
                                        value={b.accessKindByRoomId?.[room.id] ?? ""}
                                        onChange={(e) =>
                                          setBathRoomAccessKind(i, room.id, e.target.value as "" | ManagerBathroomRoomAccessKind)
                                        }
                                      >
                                        <option value="">Optional — auto from shared vs private</option>
                                        <option value="ensuite">En suite (private to this room)</option>
                                        <option value="shared">Shared (other checked rooms use it too)</option>
                                        <option value="hall">Hall / common (not private to this room)</option>
                                      </select>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Finishes and fixtures for this bathroom only (beyond shower / toilet / tub above).">
                          Bathroom amenities
                        </FieldLabel>
                        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                          {BATHROOM_EXTRA_AMENITY_PRESETS.map((p) => {
                            const on = splitLineList(b.amenitiesText ?? "").includes(p.label);
                            return (
                              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300"
                                  checked={on}
                                  onChange={(e) =>
                                    setBath(i, {
                                      amenitiesText: mergeToggleLine(b.amenitiesText ?? "", p.label, e.target.checked),
                                    })
                                  }
                                />
                                <span className="font-medium text-slate-800">{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="One per line — merged with the checkboxes above on the public listing.">
                          Additional bathroom details
                        </FieldLabel>
                        <Textarea
                          className="mt-2 min-h-[56px]"
                          value={extraLinesOutsidePresetSet(b.amenitiesText ?? "", BATHROOM_EXTRA_AMENITY_LABEL_SET)}
                          onChange={(e) =>
                            setBath(i, {
                              amenitiesText: setExtraLinesPreservingPresets(
                                b.amenitiesText ?? "",
                                e.target.value,
                                BATHROOM_EXTRA_AMENITY_LABEL_SET,
                              ),
                            })
                          }
                          placeholder="e.g. Bluetooth speaker mirror, towel warmer…"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
          </FormSection>
          ) : null}

          {stepIndex === 6 ? (
          <FormSection
            id="edit-shared"
            title="Shared spaces"
            description="Add each common area (kitchen, laundry, yard, etc.), then choose which bedrooms have access. Put appliances and in-space equipment (dishwasher, fridge, desk, TV, etc.) in Space amenities — not the house-wide Amenities step."
          >
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
                          <FieldLabel hint="Rules, hours, parking for guests, policies — not individual appliances (those go below).">
                            Details
                          </FieldLabel>
                          <Textarea
                            className="min-h-[72px]"
                            value={sp.detail}
                            onChange={(e) => setSharedSpace(i, { detail: e.target.value })}
                            placeholder="How the space works, what's included, any house rules."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Kitchen appliances, shared desk, TV, etc. — only for this space.">
                            Space amenities
                          </FieldLabel>
                          <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {SHARED_SPACE_AMENITY_PRESETS.map((p) => {
                              const on = splitLineList(sp.amenitiesText ?? "").includes(p.label);
                              return (
                                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300"
                                    checked={on}
                                    onChange={(e) =>
                                      setSharedSpace(i, {
                                        amenitiesText: mergeToggleLine(sp.amenitiesText ?? "", p.label, e.target.checked),
                                      })
                                    }
                                  />
                                  <span className="font-medium text-slate-800">{p.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="One per line — merged with the checkboxes above on the public listing.">
                            Additional space amenities
                          </FieldLabel>
                          <Textarea
                            className="mt-2 min-h-[56px]"
                            value={extraLinesOutsidePresetSet(sp.amenitiesText ?? "", SHARED_SPACE_AMENITY_LABEL_SET)}
                            onChange={(e) =>
                              setSharedSpace(i, {
                                amenitiesText: setExtraLinesPreservingPresets(
                                  sp.amenitiesText ?? "",
                                  e.target.value,
                                  SHARED_SPACE_AMENITY_LABEL_SET,
                                ),
                              })
                            }
                            placeholder="e.g. Coffee machine, garbage disposal, ice maker…"
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
          </FormSection>
          ) : null}

          {stepIndex === 7 ? (
          <FormSection
            id="edit-quick-facts"
            title="Quick facts (sidebar)"
            description="Optional. Rows here replace the auto-generated sidebar on the public listing. Leave empty to derive from building and room data."
          >
            <div className="space-y-4">
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
            </div>
          </FormSection>
          ) : null}

          {stepIndex === 8 ? (
          <FormSection
            id="edit-amenities"
            title="Amenities"
            description={
              <>
                Building-wide and neighborhood amenities for the main listing grid. Kitchen appliances, shared desk, TV, and similar belong in{" "}
                <span className="font-medium text-slate-800">Shared spaces</span>; bathroom finishes in{" "}
                <span className="font-medium text-slate-800">Bathrooms</span>; bedroom items in{" "}
                <span className="font-medium text-slate-800">Rooms</span>.
              </>
            }
          >
            <div className="space-y-4">
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
                <FieldLabel hint="Tap to add common amenities; anything else goes in the box below.">Common amenities</FieldLabel>
                <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {HOUSE_WIDE_AMENITY_PRESETS.map((p) => {
                    const on = splitLineList(sub.amenitiesText).includes(p.label);
                    return (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={on}
                          onChange={(e) =>
                            setSub((s) => ({
                              ...s,
                              amenitiesText: mergeToggleLine(s.amenitiesText, p.label, e.target.checked),
                            }))
                          }
                        />
                        <span className="font-medium text-slate-800">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <FieldLabel hint="One per line — merged with the checkboxes above on the public listing.">Additional amenities</FieldLabel>
                <Textarea
                  className="mt-2 min-h-[100px]"
                  value={extraLinesOutsidePresetSet(sub.amenitiesText, HOUSE_WIDE_AMENITY_LABEL_SET)}
                  onChange={(e) =>
                    setSub((s) => ({
                      ...s,
                      amenitiesText: setExtraLinesPreservingPresets(s.amenitiesText, e.target.value, HOUSE_WIDE_AMENITY_LABEL_SET),
                    }))
                  }
                  placeholder="Anything not in the list above — community room, sauna, piano, etc."
                />
              </div>
            </div>
          </FormSection>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200 bg-white px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-12px_rgba(15,23,42,0.14)] sm:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
                Close
              </Button>
              {stepIndex > 0 ? (
                <Button type="button" variant="outline" className="rounded-full" onClick={goPrev} disabled={busy}>
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {stepIndex < lastStepIndex ? (
                <Button type="button" className="rounded-full" onClick={goNext} disabled={busy}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" form="manager-add-listing-form" className="rounded-full" disabled={busy}>
                  {busy ? (isEditMode ? "Saving…" : "Submitting…") : isEditMode ? "Save listing" : "Submit for approval"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import type { DragEvent, FormEvent, ReactNode } from "react";
import { Children, useEffect, useMemo, useRef, useState } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  submitManagerPendingPropertyToServer,
  updateExtraListingFromSubmissionOnServer,
  updatePendingManagerPropertyOnServer,
} from "@/lib/demo-property-pipeline";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";
import {
  applyListingBedroomSlots,
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
  LISTING_BEDROOM_SLOT_OPTIONS,
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
  LISTING_ROOM_FLOOR_LEVEL_OPTIONS,
  LISTING_STORIES_OPTIONS,
  LISTING_TOTAL_BATH_OPTIONS,
  ROOM_AMENITY_PRESETS,
  ROOM_FLOOR_LEVEL_CUSTOM,
  ROOM_FURNITURE_PRESETS,
  ROOM_FURNISHING_OPTIONS,
  SHARED_SPACE_AMENITY_PRESETS,
  mergeFurnitureToggle,
  mergeToggleLine,
  parseFurnitureSet,
  sanitizeRoomAmenityText,
  splitLineList,
} from "@/data/manager-listing-presets";
import { loadListingPresetConfig, type ListingPresetConfig } from "@/lib/site-content";

const selectInputCls =
  "min-h-[44px] w-full rounded-xl border border-black/[0.08] bg-black/[0.04] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] outline-none transition focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20";

function dedupeByLabel<T extends { label: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function roomFloorSelectValue(floor: string): string {
  const hit = LISTING_ROOM_FLOOR_LEVEL_OPTIONS.find((o) => o.label === floor);
  if (hit) return hit.id;
  if (!floor.trim()) return "";
  return ROOM_FLOOR_LEVEL_CUSTOM;
}

function roomFloorOptionsFromStories(storiesId: string | undefined): { id: string; label: string }[] {
  if (storiesId === "1") {
    return [
      { id: "1", label: "1st floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "2") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "3") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "3", label: "3rd floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "4") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "3", label: "3rd floor" },
      { id: "4plus", label: "4th floor or higher" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "split") {
    return [
      { id: "split-main", label: "Main split level" },
      { id: "split-upper", label: "Upper split level" },
      { id: "split-lower", label: "Lower split level" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  return LISTING_ROOM_FLOOR_LEVEL_OPTIONS.map((o) => ({ id: o.id, label: o.label }));
}

function roomFloorSelectValueFromOptions(floor: string, options: readonly { id: string; label: string }[]): string {
  const hit = options.find((o) => o.label === floor);
  if (hit) return hit.id;
  if (!floor.trim()) return "";
  return ROOM_FLOOR_LEVEL_CUSTOM;
}

const LOCATION_LEVEL_CUSTOM = "__location_custom__";

function locationOptionsFromStories(storiesId: string | undefined): string[] {
  const base = ["1st / main floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "1") return base;
  if (storiesId === "2") return ["1st / main floor", "2nd floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "3") {
    return [
      "1st / main floor",
      "2nd floor",
      "3rd floor",
      "Basement / garden level",
      "Loft / attic",
      "Outdoor / detached area",
    ];
  }
  if (storiesId === "4") {
    return [
      "1st / main floor",
      "2nd floor",
      "3rd floor",
      "4th floor or higher",
      "Basement / garden level",
      "Loft / attic",
      "Outdoor / detached area",
    ];
  }
  if (storiesId === "split") {
    return [
      "Main split level",
      "Upper split level",
      "Lower split level",
      "Basement / garden level",
      "Loft / attic",
      "Outdoor / detached area",
    ];
  }
  return base;
}

function locationSelectValue(location: string, options: readonly string[]): string {
  const t = location.trim();
  if (!t) return "";
  return options.includes(t) ? t : LOCATION_LEVEL_CUSTOM;
}

function ChevronDownTiny({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const DEFAULT_LISTING_PRESETS: ListingPresetConfig = {
  houseWide: [...HOUSE_WIDE_AMENITY_PRESETS],
  sharedSpace: [...SHARED_SPACE_AMENITY_PRESETS],
  bathroom: [...BATHROOM_EXTRA_AMENITY_PRESETS],
  room: [...ROOM_AMENITY_PRESETS],
  furniture: [...ROOM_FURNITURE_PRESETS],
  availability: [],
  furnishing: ROOM_FURNISHING_OPTIONS,
};

function FormSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-6">
        <h3 className="text-base font-bold tracking-tight text-slate-950">{title}</h3>
        {description ? <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</div> : null}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
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
/** Max pixel width after compression. */
const IMG_MAX_WIDTH = 1280;
const IMG_QUALITY = 0.75;

function mediaDropZoneClass(active: boolean) {
  return `rounded-xl border border-dashed p-4 transition ${
    active
      ? "border-primary/50 bg-primary/[0.06] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
      : "border-slate-200/90 bg-white hover:border-primary/30 hover:bg-primary/[0.03]"
  }`;
}

const SHARED_SPACE_TEMPLATES = [
  {
    label: "Kitchen & dining",
    detail: "",
    amenities: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher"],
  },
  {
    label: "Living room / lounge",
    detail: "",
    amenities: ["Living / lounge seating", "Couch / sofa", "TV in common area"],
  },
  {
    label: "Laundry",
    detail: "",
    amenities: ["Washer / dryer", "Laundry sink"],
  },
  {
    label: "Outdoor / yard",
    detail: "",
    amenities: [],
  },
] as const;

/** Multi-step flow: home & layout first, then rooms → shared layout → money → media → highlights. */
const LISTING_FORM_STEPS = [
  { id: "home", label: "Home & layout" },
  { id: "rooms", label: "Rooms" },
  { id: "bathrooms", label: "Bathrooms" },
  { id: "spaces", label: "Shared spaces" },
  { id: "lease", label: "Lease & pricing" },
  { id: "media", label: "Media" },
  { id: "finish", label: "Highlights" },
] as const;

const LISTING_STEP_COUNT = LISTING_FORM_STEPS.length;

const LISTING_STEP_BLURBS: Record<(typeof LISTING_FORM_STEPS)[number]["id"], string> = {
  home: "Property type, address, floors, baths, and how many bedrooms you’ll list.",
  rooms: "Each rentable bedroom: name, floor, rent, move-in instructions, furnishing, photos, and video.",
  bathrooms: "Bath rows, bathroom amenities, and optional bathroom photos/video for listing details.",
  spaces: "Kitchen, laundry, lounge, outdoor — location, amenities, room access, plus optional photos/video.",
  lease: "Lease terms, bundles (whole-house or custom packages), deposits, fees, and payment options.",
  media: "Hero images and optional full-house walkthrough video at the top of your public listing.",
  finish: "Sidebar quick facts, building amenities, and final submit.",
};

/** Reads a file and returns a compressed JPEG data URL. Falls back to raw data URL for non-image files. */
async function fileToDataUrl(file: File, maxBytes: number): Promise<string | null> {
  if (file.size > maxBytes) return null;
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }
  return new Promise((resolve) => {
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
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
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
function GridField({ children, className }: { children: React.ReactNode; className?: string }) {
  const parts = Children.toArray(children);
  if (parts.length !== 2) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
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

function roomAccessSummary(space: ManagerSharedSpaceSubmission, rooms: ManagerRoomSubmission[]) {
  const ids = new Set(space.roomAccessIds ?? []);
  if (rooms.length === 0) return "No rooms added yet";
  if (ids.size === 0) return "No room access selected";
  if (ids.size === rooms.length) return "All rooms have access";
  return `${ids.size} of ${rooms.length} rooms have access`;
}

function roomLabelForBundle(room: ManagerRoomSubmission) {
  return room.name.trim() || `Room (${room.id.slice(-6)})`;
}

function bundleRoomsLine(roomIds: string[], rooms: ManagerRoomSubmission[]) {
  const names = roomIds.map((id) => rooms.find((room) => room.id === id)).filter(Boolean).map((room) => roomLabelForBundle(room!));
  if (names.length === 0) return "";
  return names.length === rooms.length ? `Whole house - ${names.length} rooms` : names.join(", ");
}

function bundleRentLabel(roomIds: string[], rooms: ManagerRoomSubmission[]) {
  const total = roomIds
    .map((id) => rooms.find((room) => room.id === id)?.monthlyRent ?? 0)
    .filter((rent) => Number.isFinite(rent) && rent > 0)
    .reduce((sum, rent) => sum + rent, 0);
  return total > 0 ? `$${total}/mo` : "";
}

export function ManagerAddListingForm({
  onClose,
  onSubmitted,
  showToast,
  skuTier,
  propCountBeforeSubmit,
  editPendingId = null,
  editListingId = null,
  editListingOwnerUserId = null,
  initialSubmission = null,
}: {
  onClose: () => void;
  onSubmitted: () => void;
  showToast: (m: string) => void;
  skuTier: string | null;
  propCountBeforeSubmit: number;
  editPendingId?: string | null;
  editListingId?: string | null;
  /** Owner's userId to use when saving edits to a linked listing (overrides the current user's id). */
  editListingOwnerUserId?: string | null;
  initialSubmission?: ManagerListingSubmissionV1 | null;
}) {
  const [sub, setSub] = useState<ManagerListingSubmissionV1>(() =>
    initialSubmission ? normalizeManagerListingSubmissionV1(initialSubmission) : createDefaultListingSubmission(),
  );
  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Incremented whenever a video preview URL changes, to trigger re-render.
  const [, setVideoTick] = useState(0);
  const [listingPresets, setListingPresets] = useState<ListingPresetConfig>(DEFAULT_LISTING_PRESETS);
  const [showQuickFacts, setShowQuickFacts] = useState(() => Boolean(initialSubmission?.quickFacts?.length));
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Object URLs for video preview (avoids putting huge base64 strings in <video src>).
  // Keyed by a stable id like "room-<id>", "bath-<id>", "space-<id>", "house".
  const videoPreviewUrls = useRef<Map<string, string>>(new Map());
  const { userId, ready: authReady } = useManagerUserId();
  const dedupedPresets = useMemo(
    () => ({
      furniture: dedupeByLabel(listingPresets.furniture),
      room: dedupeByLabel(listingPresets.room),
      bathroom: dedupeByLabel(listingPresets.bathroom),
      sharedSpace: dedupeByLabel(listingPresets.sharedSpace),
      houseWide: dedupeByLabel(listingPresets.houseWide),
    }),
    [listingPresets],
  );
  const locationLevelOptions = useMemo(() => locationOptionsFromStories(sub.listingStoriesId), [sub.listingStoriesId]);
  const roomFloorOptions = useMemo(() => roomFloorOptionsFromStories(sub.listingStoriesId), [sub.listingStoriesId]);

  const isEditMode = Boolean(editPendingId ?? editListingId);
  const lastStepIndex = LISTING_STEP_COUNT - 1;
  const isFinalStep = stepIndex === lastStepIndex;

  // Revoke all object URLs on unmount.
  useEffect(() => {
    const map = videoPreviewUrls.current;
    return () => {
      map.forEach((url) => URL.revokeObjectURL(url));
      map.clear();
    };
  }, []);

  /** Set or replace the preview object URL for a video key, revoking the old one. */
  const setVideoPreview = (key: string, file: File) => {
    const old = videoPreviewUrls.current.get(key);
    if (old) URL.revokeObjectURL(old);
    videoPreviewUrls.current.set(key, URL.createObjectURL(file));
    setVideoTick((n) => n + 1);
  };

  /** Remove the preview object URL for a video key, revoking it. */
  const clearVideoPreview = (key: string) => {
    const old = videoPreviewUrls.current.get(key);
    if (old) { URL.revokeObjectURL(old); videoPreviewUrls.current.delete(key); }
    setVideoTick((n) => n + 1);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIndex]);

  useEffect(() => {
    let cancelled = false;
    loadListingPresetConfig()
      .then((presets) => {
        if (!cancelled) setListingPresets(presets);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const canContinueFromStep = (i: number): boolean => {
    if (i === 0) {
      if (!sub.buildingName.trim() || !sub.address.trim() || !sub.zip.trim() || !sub.neighborhood.trim()) {
        showToast("Fill in building name, address, ZIP, and neighborhood to continue.");
        return false;
      }
      const strictBasics = !isEditMode;
      if (strictBasics) {
        if (!sub.listingPropertyTypeId?.trim()) {
          showToast("Choose a property type.");
          return false;
        }
        if (!sub.listingPlaceCategoryId?.trim()) {
          showToast("Select what kind of listing this is.");
          return false;
        }
        if (!sub.listingStoriesId?.trim()) {
          showToast("Select how many floors or levels the home has.");
          return false;
        }
        if (!sub.listingTotalBathroomsId?.trim()) {
          showToast("Select how many bathrooms the home has.");
          return false;
        }
        if (!sub.listingBedroomSlots || sub.listingBedroomSlots < 1) {
          showToast("Select how many bedrooms you will list for rent.");
          return false;
        }
      }
    }
    if (i === 1) {
      if (!sub.rooms.some((r) => r.name.trim())) {
        showToast("Add at least one room with a name before continuing.");
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!canContinueFromStep(stepIndex)) return;
    if (stepIndex === 0) {
      const slots = sub.listingBedroomSlots ?? sub.rooms.length;
      const applied = applyListingBedroomSlots(sub, slots);
      if (!applied.ok) {
        if (isEditMode) {
          setSub((s) => ({ ...s, listingBedroomSlots: s.rooms.length }));
          showToast("Bedroom count was reset to match existing room rows so your layout updates can continue.");
        } else {
          showToast(applied.message);
          return;
        }
      } else {
        setSub(applied.sub);
      }
    }
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
    if (sub.rooms.length >= 20) return;
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
      bundles: (s.bundles ?? []).map((bundle) => {
        const nextRooms = s.rooms.filter((_, j) => j !== i);
        const includedRoomIds = (bundle.includedRoomIds ?? []).filter((id) => id !== removedId);
        return {
          ...bundle,
          includedRoomIds,
          roomsLine: bundle.roomsLine.trim() ? bundle.roomsLine : bundleRoomsLine(includedRoomIds, nextRooms),
        };
      }),
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
    if (sub.rooms.length >= 20) {
      showToast("Maximum 20 rooms.");
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

  const addSharedSpaceFromTemplate = (template: (typeof SHARED_SPACE_TEMPLATES)[number]) => {
    if (sub.sharedSpaces.length >= 24) return;
    setSub((s) => {
      const row = {
        ...emptySharedSpace(s.sharedSpaces.length),
        name: template.label,
        detail: template.detail,
        amenitiesText: template.amenities.join("\n"),
        roomAccessIds: s.rooms.map((room) => room.id),
      };
      return { ...s, sharedSpaces: [...s.sharedSpaces, row] };
    });
  };

  const removeSharedSpace = (i: number) => {
    setSub((s) => ({ ...s, sharedSpaces: s.sharedSpaces.filter((_, j) => j !== i) }));
  };

  const setSharedSpaceRoomAccess = (spaceIndex: number, mode: "all" | "none") => {
    setSub((s) => {
      const sharedSpaces = s.sharedSpaces.map((ss, si) =>
        si === spaceIndex ? { ...ss, roomAccessIds: mode === "all" ? s.rooms.map((room) => room.id) : [] } : ss,
      );
      return { ...s, sharedSpaces };
    });
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
      bundles[bundleIndex] = {
        ...cur,
        includedRoomIds,
        roomsLine: cur.roomsLine.trim() ? cur.roomsLine : bundleRoomsLine(includedRoomIds, s.rooms),
        price: cur.price.trim() ? cur.price : bundleRentLabel(includedRoomIds, s.rooms),
      };
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

  const addGeneratedBundle = (kind: "whole_house" | "multi_room") => {
    setSub((s) => {
      const eligibleRooms = s.rooms.filter((room) => room.name.trim());
      if (eligibleRooms.length === 0) return s;
      const includedRoomIds =
        kind === "whole_house"
          ? eligibleRooms.map((room) => room.id)
          : eligibleRooms.slice(0, Math.min(2, eligibleRooms.length)).map((room) => room.id);
      const row: ManagerBundleRow = {
        ...emptyBundleRow(),
        label: kind === "whole_house" ? "Whole house lease" : "Multi-room lease bundle",
        price: bundleRentLabel(includedRoomIds, s.rooms),
        strikethrough: "",
        promo:
          kind === "whole_house"
            ? "Rent the full home as one lease."
            : "Select any rooms that can be rented together.",
        roomsLine: bundleRoomsLine(includedRoomIds, s.rooms),
        includedRoomIds,
      };
      return { ...s, bundles: [...(s.bundles ?? []), row] };
    });
  };

  const removeBundle = (i: number) => {
    setSub((s) => {
      const bundles = (s.bundles ?? []).filter((_, j) => j !== i);
      return { ...s, bundles };
    });
  };

  const applyBundleRoomScope = (bundleIndex: number, mode: "all_named" | "none") => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      const cur = bundles[bundleIndex];
      if (!cur) return s;
      const named = s.rooms.filter((r) => r.name.trim());
      const includedRoomIds = mode === "all_named" ? named.map((r) => r.id) : [];
      bundles[bundleIndex] = {
        ...cur,
        includedRoomIds,
        roomsLine: bundleRoomsLine(includedRoomIds, s.rooms),
        price: bundleRentLabel(includedRoomIds, s.rooms),
      };
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
    try {
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
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickRoomVideo = async (roomIndex: number, file: File | null) => {
    if (!file) return;
    try {
    if (!file.type.startsWith("video/")) {
      showToast("Please choose a video file.");
      return;
    }
    const url = await fileToDataUrl(file, MAX_VID_BYTES);
    if (!url) {
      showToast(`Video too large (max ${Math.round(MAX_VID_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    const roomId = sub.rooms[roomIndex]?.id;
    if (roomId) setVideoPreview(`room-${roomId}`, file);
    setRoom(roomIndex, { videoDataUrl: url });
    } catch { showToast("Could not process video. Please try a different file."); }
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

  const onPickBathroomPhotos = async (bathIndex: number, files: FileList | null) => {
    if (!files?.length) return;
    try {
    const next: string[] = [];
    for (let i = 0; i < Math.min(files.length, 6); i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for bathroom photos.");
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
      const bathrooms = [...s.bathrooms];
      const cur = bathrooms[bathIndex];
      if (!cur) return s;
      bathrooms[bathIndex] = { ...cur, photoDataUrls: [...(cur.photoDataUrls ?? []), ...next].slice(0, 8) };
      return { ...s, bathrooms };
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickBathroomVideo = async (bathIndex: number, file: File | null) => {
    if (!file) return;
    try {
    if (!file.type.startsWith("video/")) {
      showToast("Please choose a video file.");
      return;
    }
    const url = await fileToDataUrl(file, MAX_VID_BYTES);
    if (!url) {
      showToast(`Video too large (max ${Math.round(MAX_VID_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    const bathId = sub.bathrooms[bathIndex]?.id;
    if (bathId) setVideoPreview(`bath-${bathId}`, file);
    setBath(bathIndex, { videoDataUrl: url });
    } catch { showToast("Could not process video. Please try a different file."); }
  };

  const removeBathroomPhoto = (bathIndex: number, photoIndex: number) => {
    setSub((s) => {
      const bathrooms = [...s.bathrooms];
      const cur = bathrooms[bathIndex];
      if (!cur) return s;
      bathrooms[bathIndex] = {
        ...cur,
        photoDataUrls: (cur.photoDataUrls ?? []).filter((_, j) => j !== photoIndex),
      };
      return { ...s, bathrooms };
    });
  };

  const clearBathroomVideo = (bathIndex: number) => {
    const bathId = sub.bathrooms[bathIndex]?.id;
    if (bathId) clearVideoPreview(`bath-${bathId}`);
    setBath(bathIndex, { videoDataUrl: null });
  };

  const onPickSharedSpacePhotos = async (spaceIndex: number, files: FileList | null) => {
    if (!files?.length) return;
    try {
    const next: string[] = [];
    for (let i = 0; i < Math.min(files.length, 6); i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for shared-space photos.");
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
      const sharedSpaces = [...s.sharedSpaces];
      const cur = sharedSpaces[spaceIndex];
      if (!cur) return s;
      sharedSpaces[spaceIndex] = { ...cur, photoDataUrls: [...(cur.photoDataUrls ?? []), ...next].slice(0, 8) };
      return { ...s, sharedSpaces };
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickSharedSpaceVideo = async (spaceIndex: number, file: File | null) => {
    if (!file) return;
    try {
    if (!file.type.startsWith("video/")) {
      showToast("Please choose a video file.");
      return;
    }
    const url = await fileToDataUrl(file, MAX_VID_BYTES);
    if (!url) {
      showToast(`Video too large (max ${Math.round(MAX_VID_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    const spaceId = sub.sharedSpaces[spaceIndex]?.id;
    if (spaceId) setVideoPreview(`space-${spaceId}`, file);
    setSharedSpace(spaceIndex, { videoDataUrl: url });
    } catch { showToast("Could not process video. Please try a different file."); }
  };

  const removeSharedSpacePhoto = (spaceIndex: number, photoIndex: number) => {
    setSub((s) => {
      const sharedSpaces = [...s.sharedSpaces];
      const cur = sharedSpaces[spaceIndex];
      if (!cur) return s;
      sharedSpaces[spaceIndex] = {
        ...cur,
        photoDataUrls: (cur.photoDataUrls ?? []).filter((_, j) => j !== photoIndex),
      };
      return { ...s, sharedSpaces };
    });
  };

  const clearSharedSpaceVideo = (spaceIndex: number) => {
    const spaceId = sub.sharedSpaces[spaceIndex]?.id;
    if (spaceId) clearVideoPreview(`space-${spaceId}`);
    setSharedSpace(spaceIndex, { videoDataUrl: null });
  };

  const onPickHousePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
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
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const removeHousePhoto = (photoIndex: number) => {
    setSub((s) => ({
      ...s,
      housePhotoDataUrls: (s.housePhotoDataUrls ?? []).filter((_, j) => j !== photoIndex),
    }));
  };

  const clearRoomVideo = (roomIndex: number) => {
    const roomId = sub.rooms[roomIndex]?.id;
    if (roomId) clearVideoPreview(`room-${roomId}`);
    setRoom(roomIndex, { videoDataUrl: null });
  };

  const onPickHouseVideo = async (file: File | null) => {
    if (!file) return;
    try {
    if (!file.type.startsWith("video/")) {
      showToast("Please choose a video file.");
      return;
    }
    const url = await fileToDataUrl(file, MAX_VID_BYTES);
    if (!url) {
      showToast(`Video too large (max ${Math.round(MAX_VID_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setVideoPreview("house", file);
    setSub((s) => ({ ...s, houseVideoDataUrl: url }));
    } catch { showToast("Could not process video. Please try a different file."); }
  };

  const clearHouseVideo = () => {
    clearVideoPreview("house");
    setSub((s) => ({ ...s, houseVideoDataUrl: null }));
  };

  const onDropHouseVideo = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone("house-video");
    void onPickHouseVideo(event.dataTransfer.files?.[0] ?? null);
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

  const onDropBathroomPhotos = (bathIndex: number, bathId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`bath-photos-${bathId}`);
    void onPickBathroomPhotos(bathIndex, event.dataTransfer.files);
  };

  const onDropBathroomVideo = (bathIndex: number, bathId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`bath-video-${bathId}`);
    void onPickBathroomVideo(bathIndex, event.dataTransfer.files?.[0] ?? null);
  };

  const onDropSharedSpacePhotos = (spaceIndex: number, spaceId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`shared-photos-${spaceId}`);
    void onPickSharedSpacePhotos(spaceIndex, event.dataTransfer.files);
  };

  const onDropSharedSpaceVideo = (spaceIndex: number, spaceId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`shared-video-${spaceId}`);
    void onPickSharedSpaceVideo(spaceIndex, event.dataTransfer.files?.[0] ?? null);
  };

  const submitListing = async () => {
    const submission: ManagerListingSubmissionV1 = {
      ...sub,
      rooms: sub.rooms.map((room) => ({
        ...room,
        roomAmenitiesText: sanitizeRoomAmenityText(room.roomAmenitiesText),
        manualUnavailableRanges: (room.manualUnavailableRanges ?? [])
          .filter((r) => r.start?.trim() && r.end?.trim() && r.start <= r.end)
          .map((r) => ({ id: r.id, start: r.start.trim(), end: r.end.trim() })),
      })),
    };
    const roomsOk = submission.rooms.some((r) => r.name.trim() && r.monthlyRent > 0);
    if (!submission.buildingName.trim() || !submission.address.trim() || !submission.zip.trim() || !submission.neighborhood.trim()) {
      showToast("Fill in building name, address, ZIP, and neighborhood.");
      return;
    }
    if (!roomsOk) {
      showToast("Add at least one room with a name and monthly rent.");
      return;
    }
    const blockedRangesInvalid = sub.rooms.some((r) =>
      (r.manualUnavailableRanges ?? []).some((range) => {
        const s = range.start?.trim();
        const e = range.end?.trim();
        if (!s && !e) return false;
        if (!s || !e) return true;
        return s > e;
      }),
    );
    if (blockedRangesInvalid) {
      showToast("Blocked date ranges need both dates, and the end date must be on or after the start.");
      return;
    }
    if (submission.bathrooms.length > 0 && submission.bathrooms.every((b) => !b.name.trim())) {
      showToast("Name each bathroom or remove empty bathroom rows.");
      return;
    }
    if (submission.sharedSpaces.some((space) => !space.name.trim())) {
      showToast("Name each shared space or remove empty shared space rows.");
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
        const ok = await updatePendingManagerPropertyOnServer(editPendingId, submission, userId);
        if (!ok) {
          showToast("Could not save changes.");
          return;
        }
        onSubmitted();
        return;
      }
      if (editListingId) {
        const saveUserId = editListingOwnerUserId?.trim() || userId;
        const ok = await updateExtraListingFromSubmissionOnServer(editListingId, saveUserId, submission);
        if (!ok) {
          showToast("Could not save changes.");
          return;
        }
        showToast("Listing saved. It is pending admin review before it appears on Rent with Axis again.");
        onSubmitted();
        return;
      }
      const id = await submitManagerPendingPropertyToServer(submission, userId);
      if (!id) {
        showToast("Could not submit listing.");
        return;
      }
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-900/50 px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <form
        id="manager-add-listing-form"
        onSubmit={(e) => e.preventDefault()}
        className="relative z-10 flex max-h-[calc(100svh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100svh-1.5rem)] lg:max-h-[calc(100svh-2rem)]"
      >
        <div className="shrink-0 border-b border-slate-100 p-3 pb-2 sm:p-4 sm:pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{isEditMode ? "Edit listing" : "Create listing"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEditMode
                  ? "Steps follow how renters experience the listing — home and layout first, then rooms, shared areas, lease packages, photos, and highlights."
                  : "Begin with the property story and layout, define each room, then bathrooms and common areas. Add lease bundles and pricing when rents are set, then hero photos and amenities."}
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
          <div className="mt-3 -mx-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            <div className="flex min-w-max gap-2 px-1">
              {LISTING_FORM_STEPS.map((step, i) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (i < stepIndex || canContinueFromStep(stepIndex)) setStepIndex(i);
                  }}
                  className={`flex min-h-10 shrink-0 items-center justify-center rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold transition sm:min-w-[118px] ${
                    i === stepIndex
                      ? "border-primary bg-primary text-white shadow-sm"
                      : i < stepIndex
                        ? "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <span
                    className={`mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      i === stepIndex ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {step.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${((stepIndex + 1) / LISTING_STEP_COUNT) * 100}%` }}
            />
          </div>
          <p className="mt-3 rounded-2xl bg-slate-50/90 px-3 py-2.5 text-sm leading-snug text-slate-600">
            <span className="font-semibold text-slate-900">{LISTING_FORM_STEPS[stepIndex]?.label}</span>
            <span className="text-slate-400"> · </span>
            {LISTING_STEP_BLURBS[LISTING_FORM_STEPS[stepIndex]!.id]}
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-24 sm:px-6">
          {/* ── Step 0: Home & layout ── */}
          {stepIndex === 0 ? (
          <FormSection
            id="edit-building"
            title="Tell us about your place"
            description="Pick the property type and basics, then we’ll match room slots on the next step. Everything here can be changed later."
          >
            <div className="mb-6 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white px-4 py-4 sm:px-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Step 1 · Basics</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">What kind of place is this?</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LISTING_PROPERTY_TYPE_OPTIONS.map((opt) => {
                  const on = sub.listingPropertyTypeId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSub((s) => ({ ...s, listingPropertyTypeId: opt.id }))}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        on
                          ? "border-primary bg-white shadow-[0_8px_28px_-18px_rgba(37,99,235,0.45)] ring-2 ring-primary/25"
                          : "border-slate-200/90 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-5 text-sm font-semibold text-slate-900">What are you listing?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {LISTING_PLACE_CATEGORY_OPTIONS.map((opt) => {
                  const on = sub.listingPlaceCategoryId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSub((s) => ({ ...s, listingPlaceCategoryId: opt.id }))}
                      className={`rounded-2xl border px-4 py-3.5 text-left transition ${
                        on
                          ? "border-primary bg-white shadow-[0_8px_28px_-18px_rgba(37,99,235,0.45)] ring-2 ring-primary/25"
                          : "border-slate-200/90 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Building name *</FieldLabel>
                <Input value={sub.buildingName} onChange={(e) => setSub((s) => ({ ...s, buildingName: e.target.value }))} placeholder="e.g. Pioneer Collective" />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Street address *</FieldLabel>
                <Input value={sub.address} onChange={(e) => setSub((s) => ({ ...s, address: e.target.value }))} placeholder="Street, unit if any" />
              </div>
              <GridField>
                <FieldLabel>ZIP *</FieldLabel>
                <Input value={sub.zip} onChange={(e) => setSub((s) => ({ ...s, zip: e.target.value }))} maxLength={10} inputMode="numeric" />
              </GridField>
              <GridField>
                <FieldLabel>Neighborhood *</FieldLabel>
                <Input value={sub.neighborhood} onChange={(e) => setSub((s) => ({ ...s, neighborhood: e.target.value }))} placeholder="e.g. Capitol Hill" />
              </GridField>

              <GridField>
                <FieldLabel>Floors / levels in the home *</FieldLabel>
                <div className="relative">
                  <Select
                    aria-label="Number of floors"
                    className={`${selectInputCls} appearance-none pr-10`}
                    value={sub.listingStoriesId ?? ""}
                    onChange={(e) => setSub((s) => ({ ...s, listingStoriesId: e.target.value }))}
                  >
                    <option value="">Select</option>
                    {LISTING_STORIES_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <ChevronDownTiny />
                  </span>
                </div>
              </GridField>
              <GridField>
                <FieldLabel>Bathrooms in the home *</FieldLabel>
                <div className="relative">
                  <Select
                    aria-label="Total bathrooms"
                    className={`${selectInputCls} appearance-none pr-10`}
                    value={sub.listingTotalBathroomsId ?? ""}
                    onChange={(e) => setSub((s) => ({ ...s, listingTotalBathroomsId: e.target.value }))}
                  >
                    <option value="">Select</option>
                    {LISTING_TOTAL_BATH_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <ChevronDownTiny />
                  </span>
                </div>
              </GridField>
              <GridField className="sm:col-span-2">
                <FieldLabel hint="We’ll open that many room cards on the next step. You can still add or remove rows later.">
                  Bedrooms you’ll list for rent *
                </FieldLabel>
                <div className="relative max-w-md">
                  <Select
                    aria-label="Bedrooms for rent"
                    className={`${selectInputCls} appearance-none pr-10`}
                    value={String(sub.listingBedroomSlots ?? sub.rooms.length)}
                    onChange={(e) => setSub((s) => ({ ...s, listingBedroomSlots: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))}
                  >
                    {LISTING_BEDROOM_SLOT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} bedroom{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </Select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <ChevronDownTiny />
                  </span>
                </div>
              </GridField>

              <div className="sm:col-span-2">
                <FieldLabel hint="Optional — only if the layout is unusual (split level, ADU, etc.). Otherwise your selections above appear on the listing.">
                  Extra layout note
                </FieldLabel>
                <Textarea
                  className="min-h-[72px]"
                  value={sub.homeStructureNote}
                  onChange={(e) => setSub((s) => ({ ...s, homeStructureNote: e.target.value }))}
                  placeholder="e.g. Garden apartment in a triplex; private entrance on the side."
                />
              </div>
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
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={sub.petFriendly}
                    onChange={(e) => setSub((s) => ({ ...s, petFriendly: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-800">Pet-friendly listing (subject to approval)</span>
                </label>
              </div>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 4: Lease, fees & costs ── */}
          {stepIndex === 4 ? (
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

              <ListingSubsection
                title="Short-term stays"
                description="Enable this only if this property may host temporary lodger / guest stays."
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={Boolean(sub.shortTermRentalsAllowed)}
                    onChange={(e) => setSub((s) => ({ ...s, shortTermRentalsAllowed: e.target.checked }))}
                  />
                  <span className="text-sm font-medium text-slate-800">This property allows short-term room stays</span>
                </label>
                {sub.shortTermRentalsAllowed ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <GridField>
                      <FieldLabel>Daily cost</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermDailyCost ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermDailyCost: e.target.value }))}
                          placeholder="40"
                        />
                      </div>
                    </GridField>
                    <GridField>
                      <FieldLabel>Short-term deposit</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermDeposit ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermDeposit: e.target.value }))}
                          placeholder="100"
                        />
                      </div>
                    </GridField>
                    <GridField>
                      <FieldLabel hint="Move-in fee for short-term stays — used to calculate the balance owed when upgrading to long-term.">Short-term move-in fee</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermMoveInFee ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermMoveInFee: e.target.value }))}
                          placeholder="50"
                        />
                      </div>
                    </GridField>
                    <div className="sm:col-span-2">
                      <FieldLabel hint="Shown to applicants and included in the generated short-term agreement.">
                        Requirements / house rules for short-term stays
                      </FieldLabel>
                      <Textarea
                        className="min-h-[90px]"
                        value={sub.shortTermRequirements ?? ""}
                        onChange={(e) => setSub((s) => ({ ...s, shortTermRequirements: e.target.value }))}
                        placeholder="Owner/host lives on property. No mail or residency claims. Guest must leave by checkout. Follow posted house rules."
                      />
                    </div>
                  </div>
                ) : null}
              </ListingSubsection>

              <ListingSubsection
                title="Lease bundles"
                description="Optional packages on the public listing — whole-house leases, roommate groups, or custom room combinations. If you add none, we show a smart default from your room list."
              >
                <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 sm:p-5">
                  <p className="text-sm font-semibold text-violet-950">Build from your rooms</p>
                  <p className="mt-1 text-xs leading-5 text-violet-900/80">
                    Bundle rent defaults to the sum of selected room rents — edit the price when you offer a discount. Use strikethrough + promo for limited-time offers.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-violet-200 bg-white text-xs"
                      onClick={() => addGeneratedBundle("whole_house")}
                      disabled={!sub.rooms.some((room) => room.name.trim())}
                    >
                      Whole house
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-violet-200 bg-white text-xs"
                      onClick={() => addGeneratedBundle("multi_room")}
                      disabled={sub.rooms.filter((room) => room.name.trim()).length < 2}
                    >
                      Pair / group
                    </Button>
                    <Button type="button" variant="primary" className="rounded-full text-xs" onClick={addBundle}>
                      Custom (blank)
                    </Button>
                  </div>
                </div>

                {(sub.bundles ?? []).length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-600">
                    No bundles yet — renters will still see per-room pricing from the Rooms step. Add a bundle when you want to advertise a combined lease.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {(sub.bundles ?? []).map((bundle, i) => {
                      const selectedIds = new Set(bundle.includedRoomIds ?? []);
                      const namedRooms = sub.rooms.filter((r) => r.name.trim());
                      const selectedRooms = namedRooms.filter((r) => selectedIds.has(r.id));
                      const rentSum = selectedRooms.reduce((sum, r) => sum + (Number.isFinite(r.monthlyRent) ? r.monthlyRent : 0), 0);
                      const priceNum = bundle.price.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim();
                      const hasManualPrice = priceNum.length > 0 && Number(priceNum) !== rentSum;
                      return (
                        <div
                          key={bundle.id}
                          className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Package {i + 1}</p>
                              <p className="mt-1 text-xs text-slate-600">
                                {selectedRooms.length} room{selectedRooms.length === 1 ? "" : "s"} selected
                                {rentSum > 0 ? (
                                  <>
                                    {" "}
                                    · Base rent sum <span className="font-semibold text-slate-800">${rentSum}/mo</span>
                                  </>
                                ) : null}
                                {hasManualPrice ? (
                                  <span className="ml-1 font-medium text-amber-800">· Custom bundle price</span>
                                ) : null}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-full px-3 text-[11px]"
                                onClick={() => applyBundleRoomScope(i, "all_named")}
                                disabled={namedRooms.length === 0}
                                aria-label="Select all named rooms"
                              >
                                All rooms
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-full px-3 text-[11px]"
                                onClick={() => applyBundleRoomScope(i, "none")}
                              >
                                Clear
                              </Button>
                              <button
                                type="button"
                                className="rounded-full px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                onClick={() => removeBundle(i)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                            <GridField>
                              <FieldLabel>Bundle name</FieldLabel>
                              <Input
                                value={bundle.label}
                                onChange={(e) => setBundle(i, { label: e.target.value })}
                                placeholder="Whole house lease, Rooms A+B"
                              />
                            </GridField>
                            <GridField>
                              <FieldLabel hint="Defaults to sum of room rents; edit for discounts.">Bundle rent / mo</FieldLabel>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                                <Input
                                  inputMode="decimal"
                                  className="pl-8"
                                  value={bundle.price.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                                  onChange={(e) => setBundle(i, { price: e.target.value })}
                                  placeholder={rentSum > 0 ? String(rentSum) : "4500"}
                                />
                              </div>
                            </GridField>
                            <GridField>
                              <FieldLabel hint="Optional — shows crossed out on the listing.">Original price</FieldLabel>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                                <Input
                                  inputMode="decimal"
                                  className="pl-8"
                                  value={bundle.strikethrough.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                                  onChange={(e) => setBundle(i, { strikethrough: e.target.value })}
                                  placeholder="4800"
                                />
                              </div>
                            </GridField>
                            <GridField>
                              <FieldLabel>Promo line</FieldLabel>
                              <Input
                                value={bundle.promo}
                                onChange={(e) => setBundle(i, { promo: e.target.value })}
                                placeholder="Best for groups — limited availability"
                              />
                            </GridField>
                            <div className="sm:col-span-2">
                              <FieldLabel>Rooms in this bundle</FieldLabel>
                              <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
                                {sub.rooms.map((room) => (
                                  <label key={`${bundle.id}-${room.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-slate-300"
                                      checked={selectedIds.has(room.id)}
                                      onChange={(e) => toggleBundleRoom(i, room.id, e.target.checked)}
                                    />
                                    <span className="min-w-0 font-medium text-slate-800">
                                      <span className="truncate">{roomLabelForBundle(room)}</span>
                                      {room.monthlyRent > 0 ? (
                                        <span className="ml-1 tabular-nums text-xs font-normal text-slate-500">· ${room.monthlyRent}</span>
                                      ) : null}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ListingSubsection>

              <ListingSubsection title="Fees">
                <div className="grid gap-3 sm:grid-cols-3">
                  <GridField>
                    <FieldLabel hint="Enter amount or 'Waived'">Application fee</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" value={sub.applicationFee.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, applicationFee: e.target.value }))} placeholder="50" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel>Security deposit</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={sub.securityDeposit.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, securityDeposit: e.target.value }))} placeholder="500" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel>Move-in fee</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={sub.moveInFee.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, moveInFee: e.target.value }))} placeholder="200" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Leave blank or 0 to hide.">Parking (monthly)</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={sub.parkingMonthly.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, parkingMonthly: e.target.value }))} placeholder="150" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Leave blank or 0 to hide.">HOA / community</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={sub.hoaMonthly.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, hoaMonthly: e.target.value }))} placeholder="0" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel>Other monthly fees</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={sub.otherMonthlyFees.replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, otherMonthlyFees: e.target.value }))} placeholder="0" />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Added to monthly rent for month-to-month tenants. Leave blank if none.">Month-to-month surcharge</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <Input className="pl-8" inputMode="decimal" value={(sub.monthToMonthSurcharge ?? "").replace(/^\$/, "").trim()} onChange={(e) => setSub((s) => ({ ...s, monthToMonthSurcharge: e.target.value }))} placeholder="25" />
                    </div>
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
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={Boolean(sub.venmoPaymentsEnabled)}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSub((s) => ({
                          ...s,
                          venmoPaymentsEnabled: on,
                          applicationFeeVenmoEnabled: on,
                        }));
                      }}
                    />
                    <span className="text-sm font-medium text-slate-800">Venmo</span>
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
                {sub.venmoPaymentsEnabled ? (
                  <div className="mt-3">
                    <FieldLabel hint="Shown to applicants when they select Venmo.">Venmo username, phone, or email</FieldLabel>
                    <Input
                      value={sub.venmoContact ?? ""}
                      onChange={(e) => setSub((s) => ({ ...s, venmoContact: e.target.value }))}
                      placeholder="@username, +1 555 010 8899, or name@email.com"
                    />
                  </div>
                ) : null}
              </ListingSubsection>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 1: Rooms ── */}
          {stepIndex === 1 ? (
          <FormSection
            id="edit-rooms"
            title="Rooms"
            description="Define each bedroom renters can apply for. Add bathrooms in the next step, then common areas — that order matches how the public page is organized."
          >
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm text-slate-500">Photos and one optional video per room.</p>
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addRoom}>
                + Add room
              </Button>
            </div>
            <div className="space-y-6">
              {sub.rooms.map((room, i) => {
                const isUnfurnished = room.furnishing.trim().toLowerCase() === "unfurnished";
                const checkedFurniture = parseFurnitureSet(room.furnishing);
                return (
                  <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">Room {i + 1}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => duplicateRoom(i)} disabled={sub.rooms.length >= 20}>
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
                        <FieldLabel hint="Preset or custom wording.">Floor / level</FieldLabel>
                        <div className="space-y-2">
                          <div className="relative">
                            <Select
                              aria-label={`Floor for ${room.name || `room ${i + 1}`}`}
                              className={`${selectInputCls} appearance-none pr-10`}
                              value={roomFloorSelectValueFromOptions(room.floor, roomFloorOptions)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === ROOM_FLOOR_LEVEL_CUSTOM) {
                                  if (roomFloorOptions.some((o) => o.label === room.floor)) {
                                    setRoom(i, { floor: "" });
                                  }
                                  return;
                                }
                                const label = roomFloorOptions.find((o) => o.id === v)?.label ?? "";
                                setRoom(i, { floor: label });
                              }}
                            >
                              <option value="">Select floor</option>
                              {roomFloorOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                              <option value={ROOM_FLOOR_LEVEL_CUSTOM}>Custom…</option>
                            </Select>
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                              <ChevronDownTiny />
                            </span>
                          </div>
                          {roomFloorSelectValueFromOptions(room.floor, roomFloorOptions) === ROOM_FLOOR_LEVEL_CUSTOM ? (
                            <Input
                              value={room.floor}
                              onChange={(e) => setRoom(i, { floor: e.target.value })}
                              placeholder="e.g. Garden level, half-basement"
                              aria-label="Custom floor"
                            />
                          ) : null}
                        </div>
                      </GridField>
                      <GridField>
                        <FieldLabel>Monthly rent *</FieldLabel>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                          <Input
                            inputMode="decimal"
                            className="pl-8"
                            value={room.monthlyRent || ""}
                            onChange={(e) => setRoom(i, { monthlyRent: Number(e.target.value) || 0 })}
                            placeholder="800"
                          />
                        </div>
                      </GridField>
                      <GridField>
                        <FieldLabel hint="Monthly estimate used in signing totals.">Utilities estimate</FieldLabel>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                          <Input
                            inputMode="decimal"
                            className="pl-8"
                            value={room.utilitiesEstimate.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                            onChange={(e) => setRoom(i, { utilitiesEstimate: e.target.value })}
                            placeholder="175"
                          />
                        </div>
                      </GridField>
                      <GridField className="sm:col-span-2">
                        <FieldLabel hint="Applicants cannot choose lease dates that overlap these inclusive spans. Approved placements for this room are also blocked automatically.">
                          Blocked date ranges (optional)
                        </FieldLabel>
                        <div className="mt-2 space-y-3">
                          {(room.manualUnavailableRanges ?? []).map((range, ri) => (
                            <div
                              key={range.id}
                              className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 sm:items-center"
                            >
                              <div className="min-w-[10rem] flex-1">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-500">From</span>
                                <Input
                                  type="date"
                                  value={range.start}
                                  onChange={(e) => {
                                    const next = [...(room.manualUnavailableRanges ?? [])];
                                    next[ri] = { ...range, start: e.target.value };
                                    setRoom(i, { manualUnavailableRanges: next });
                                  }}
                                  aria-label={`Blocked range start ${ri + 1}`}
                                />
                              </div>
                              <div className="min-w-[10rem] flex-1">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-500">Through</span>
                                <Input
                                  type="date"
                                  value={range.end}
                                  onChange={(e) => {
                                    const next = [...(room.manualUnavailableRanges ?? [])];
                                    next[ri] = { ...range, end: e.target.value };
                                    setRoom(i, { manualUnavailableRanges: next });
                                  }}
                                  aria-label={`Blocked range end ${ri + 1}`}
                                />
                              </div>
                              <button
                                type="button"
                                className="shrink-0 pb-2 text-xs font-semibold text-rose-600 hover:underline sm:pb-0"
                                onClick={() => {
                                  const next = (room.manualUnavailableRanges ?? []).filter((_, j) => j !== ri);
                                  setRoom(i, { manualUnavailableRanges: next });
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full text-xs"
                            onClick={() =>
                              setRoom(i, {
                                manualUnavailableRanges: [
                                  ...(room.manualUnavailableRanges ?? []),
                                  {
                                    id: `unavail-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                                    start: "",
                                    end: "",
                                  },
                                ],
                              })
                            }
                          >
                            + Add blocked range
                          </Button>
                        </div>
                      </GridField>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Toggle specific items included in this room.">Furnishing &amp; furniture</FieldLabel>
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-slate-100 pb-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={isUnfurnished}
                              onChange={(e) => setRoom(i, { furnishing: e.target.checked ? "Unfurnished" : "" })}
                            />
                            <span className="font-semibold text-slate-700">Unfurnished</span>
                          </label>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {dedupedPresets.furniture.map((p) => {
                              const on = checkedFurniture.has(p.label);
                              return (
                                <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-primary/30 bg-primary/[0.05]" : "border-slate-200 bg-white"} ${isUnfurnished ? "pointer-events-none opacity-40" : ""}`}>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300"
                                    checked={on}
                                    disabled={isUnfurnished}
                                    onChange={(e) => setRoom(i, { furnishing: mergeFurnitureToggle(room.furnishing, p.label, e.target.checked) })}
                                  />
                                  <span className="font-medium text-slate-800">{p.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Room features only (not furniture or bathroom — those are configured separately).">Room amenities</FieldLabel>
                        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                          {dedupedPresets.room.map((p) => {
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
                                src={videoPreviewUrls.current.get(`room-${room.id}`) ?? room.videoDataUrl}
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

          {stepIndex === 2 ? (
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
                        <div className="space-y-2">
                          <div className="relative">
                            <Select
                              aria-label={`Bathroom ${i + 1} location`}
                              className={`${selectInputCls} appearance-none pr-10`}
                              value={locationSelectValue(b.location ?? "", locationLevelOptions)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) {
                                  setBath(i, { location: "" });
                                  return;
                                }
                                if (v === LOCATION_LEVEL_CUSTOM) {
                                  if (locationLevelOptions.includes((b.location ?? "").trim())) setBath(i, { location: "" });
                                  return;
                                }
                                setBath(i, { location: v });
                              }}
                            >
                              <option value="">Select location</option>
                              {locationLevelOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                              <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                            </Select>
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                              <ChevronDownTiny />
                            </span>
                          </div>
                          {locationSelectValue(b.location ?? "", locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                            <Input
                              value={b.location ?? ""}
                              onChange={(e) => setBath(i, { location: e.target.value })}
                              placeholder="Custom location"
                              aria-label={`Bathroom ${i + 1} custom location`}
                            />
                          ) : null}
                        </div>
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
                          {dedupedPresets.bathroom.map((p) => {
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
                        <Textarea
                          className="mt-2 min-h-[80px]"
                          value={b.amenitiesText ?? ""}
                          onChange={(e) => setBath(i, { amenitiesText: e.target.value })}
                          placeholder="Add custom amenities not listed above (one per line)."
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Upload up to 8 bathroom photos.">Bathroom photos</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `bath-photos-${b.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `bath-photos-${b.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `bath-photos-${b.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `bath-photos-${b.id}`)}
                          onDrop={(e) => onDropBathroomPhotos(i, b.id, e)}
                        >
                          <input
                            key={`bath-photos-in-${b.id}`}
                            id={`bath-photos-${b.id}`}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                              void onPickBathroomPhotos(i, e.target.files);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`bath-photos-${b.id}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                          >
                            Add photos
                          </label>
                          <p className="mt-3 text-sm text-slate-600">Drag and drop bathroom photos here, or use the button above.</p>
                          {(b.photoDataUrls?.length ?? 0) > 0 ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {b.photoDataUrls.map((src, pi) => (
                                <div key={`${src.slice(0, 32)}-${pi}`} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="Bathroom" className="h-28 w-full object-cover" />
                                  <button
                                    type="button"
                                    className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-rose-600 shadow-sm opacity-0 transition group-hover:opacity-100"
                                    onClick={() => removeBathroomPhoto(i, pi)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">No photos yet.</p>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Optional short clip (~14 MB max).">Bathroom video</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `bath-video-${b.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `bath-video-${b.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `bath-video-${b.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `bath-video-${b.id}`)}
                          onDrop={(e) => onDropBathroomVideo(i, b.id, e)}
                        >
                          <input
                            key={`bath-video-in-${b.id}`}
                            id={`bath-video-${b.id}`}
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            onChange={(e) => {
                              void onPickBathroomVideo(i, e.target.files?.[0] ?? null);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`bath-video-${b.id}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                          >
                            {b.videoDataUrl ? "Replace video" : "Add video"}
                          </label>
                          <p className="mt-3 text-sm text-slate-600">Drag and drop one bathroom video here, or use the button above.</p>
                          {b.videoDataUrl ? (
                            <div className="mt-4 space-y-2">
                              <video
                                src={videoPreviewUrls.current.get(`bath-${b.id}`) ?? b.videoDataUrl}
                                controls
                                playsInline
                                className="max-h-52 w-full rounded-lg border border-slate-200 bg-black object-contain"
                              />
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:underline"
                                onClick={() => clearBathroomVideo(i)}
                              >
                                Remove video
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">Optional — MP4, MOV, or WebM.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
          </FormSection>
          ) : null}

          {stepIndex === 3 ? (
          <FormSection
            id="edit-shared"
            title="Shared spaces"
            description="Add every common area residents can use: kitchen, dining, living room, laundry, yard, storage, parking, office, roof deck, and any other shared feature. Each row can have its own details, equipment, rules, and room access."
          >
              <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm font-semibold text-blue-950">Quick add common shared spaces</p>
                <p className="mt-1 text-xs leading-5 text-blue-900/75">
                  These create fully editable rows with all current rooms selected. Use them for common spaces, then adjust details, amenities, and room access.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SHARED_SPACE_TEMPLATES.map((template) => (
                    <Button
                      key={template.label}
                      type="button"
                      variant="outline"
                      className="rounded-full bg-white text-xs"
                      onClick={() => addSharedSpaceFromTemplate(template)}
                      disabled={sub.sharedSpaces.length >= 24}
                    >
                      + {template.label}
                    </Button>
                  ))}
                  <Button type="button" variant="primary" className="rounded-full text-xs" onClick={addSharedSpace}>
                    + Blank shared space
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold tabular-nums text-slate-950">{sub.sharedSpaces.length}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Spaces</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold tabular-nums text-slate-950">{sub.rooms.length}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Rooms to assign</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Put equipment here</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Dishwasher, fridge, desk, TV, laundry, storage, and parking belong to the specific space.</p>
                </div>
              </div>

              {sub.sharedSpaces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-800">No shared spaces added yet.</p>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    Add at least the kitchen/common area so applicants understand what rooms share. Add laundry, living room, outdoor areas, parking, storage, or study spaces if they exist.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {sub.sharedSpaces.map((sp, i) => (
                    <div key={sp.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div>
                          <p className="text-sm font-bold text-slate-950">Shared space {i + 1}</p>
                          <p className="mt-1 text-xs text-slate-500">{roomAccessSummary(sp, sub.rooms)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setSharedSpaceRoomAccess(i, "all")}>
                            All rooms
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setSharedSpaceRoomAccess(i, "none")}>
                            Clear rooms
                          </Button>
                          <button type="button" className="rounded-full px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={() => removeSharedSpace(i)}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                        <div>
                          <FieldLabel>Name *</FieldLabel>
                          <Input
                            value={sp.name}
                            onChange={(e) => setSharedSpace(i, { name: e.target.value })}
                            placeholder="e.g. Kitchen & dining, Laundry, Backyard"
                          />
                        </div>
                        <div>
                          <FieldLabel hint="Optional label for where it is.">Location / level</FieldLabel>
                          <div className="space-y-2">
                            <div className="relative">
                              <Select
                                aria-label={`Shared space ${i + 1} location`}
                                className={`${selectInputCls} appearance-none pr-10`}
                                value={locationSelectValue(sp.location ?? "", locationLevelOptions)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) {
                                    setSharedSpace(i, { location: "" });
                                    return;
                                  }
                                  if (v === LOCATION_LEVEL_CUSTOM) {
                                    if (locationLevelOptions.includes((sp.location ?? "").trim())) setSharedSpace(i, { location: "" });
                                    return;
                                  }
                                  setSharedSpace(i, { location: v });
                                }}
                              >
                                <option value="">Select location</option>
                                {locationLevelOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                              </Select>
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <ChevronDownTiny />
                              </span>
                            </div>
                            {locationSelectValue(sp.location ?? "", locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                              <Input
                                value={sp.location ?? ""}
                                onChange={(e) => setSharedSpace(i, { location: e.target.value })}
                                placeholder="Custom location"
                                aria-label={`Shared space ${i + 1} custom location`}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Use this for rules, hours, storage, cleaning expectations, guest policy, scheduling, and anything applicants should know.">
                            Details and use rules
                          </FieldLabel>
                          <Textarea
                            className="min-h-[96px]"
                            value={sp.detail}
                            onChange={(e) => setSharedSpace(i, { detail: e.target.value })}
                            placeholder="Example: Shared kitchen with assigned pantry shelves. Residents clean after use; quiet hours after 10pm. Dining area seats six."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Kitchen appliances, shared desk, TV, etc. — only for this space.">
                            Space amenities
                          </FieldLabel>
                          <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {dedupedPresets.sharedSpace.map((p) => {
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
                          <Textarea
                            className="mt-2 min-h-[80px]"
                            value={sp.amenitiesText ?? ""}
                            onChange={(e) => setSharedSpace(i, { amenitiesText: e.target.value })}
                            placeholder="Add custom amenities not listed above (one per line)."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Upload up to 8 shared-space photos.">Shared-space photos</FieldLabel>
                          <div
                            className={`mt-2 ${mediaDropZoneClass(activeDropZone === `shared-photos-${sp.id}`)}`}
                            onDragOver={(e) => handleDragOver(e, `shared-photos-${sp.id}`)}
                            onDragEnter={(e) => handleDragOver(e, `shared-photos-${sp.id}`)}
                            onDragLeave={(e) => handleDragLeave(e, `shared-photos-${sp.id}`)}
                            onDrop={(e) => onDropSharedSpacePhotos(i, sp.id, e)}
                          >
                            <input
                              key={`shared-photos-in-${sp.id}`}
                              id={`shared-photos-${sp.id}`}
                              type="file"
                              accept="image/*"
                              multiple
                              className="sr-only"
                              onChange={(e) => {
                                void onPickSharedSpacePhotos(i, e.target.files);
                                e.target.value = "";
                              }}
                            />
                            <label
                              htmlFor={`shared-photos-${sp.id}`}
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                            >
                              Add photos
                            </label>
                            <p className="mt-3 text-sm text-slate-600">Drag and drop shared-space photos here, or use the button above.</p>
                            {(sp.photoDataUrls?.length ?? 0) > 0 ? (
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {sp.photoDataUrls.map((src, pi) => (
                                  <div key={`${src.slice(0, 32)}-${pi}`} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt="Shared space" className="h-28 w-full object-cover" />
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-rose-600 shadow-sm opacity-0 transition group-hover:opacity-100"
                                      onClick={() => removeSharedSpacePhoto(i, pi)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] text-slate-500">No photos yet.</p>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Optional short clip (~14 MB max).">Shared-space video</FieldLabel>
                          <div
                            className={`mt-2 ${mediaDropZoneClass(activeDropZone === `shared-video-${sp.id}`)}`}
                            onDragOver={(e) => handleDragOver(e, `shared-video-${sp.id}`)}
                            onDragEnter={(e) => handleDragOver(e, `shared-video-${sp.id}`)}
                            onDragLeave={(e) => handleDragLeave(e, `shared-video-${sp.id}`)}
                            onDrop={(e) => onDropSharedSpaceVideo(i, sp.id, e)}
                          >
                            <input
                              key={`shared-video-in-${sp.id}`}
                              id={`shared-video-${sp.id}`}
                              type="file"
                              accept="video/*"
                              className="sr-only"
                              onChange={(e) => {
                                void onPickSharedSpaceVideo(i, e.target.files?.[0] ?? null);
                                e.target.value = "";
                              }}
                            />
                            <label
                              htmlFor={`shared-video-${sp.id}`}
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                            >
                              {sp.videoDataUrl ? "Replace video" : "Add video"}
                            </label>
                            <p className="mt-3 text-sm text-slate-600">Drag and drop one shared-space video here, or use the button above.</p>
                            {sp.videoDataUrl ? (
                              <div className="mt-4 space-y-2">
                                <video
                                  src={videoPreviewUrls.current.get(`space-${sp.id}`) ?? sp.videoDataUrl}
                                  controls
                                  playsInline
                                  className="max-h-52 w-full rounded-lg border border-slate-200 bg-black object-contain"
                                />
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-rose-600 hover:underline"
                                  onClick={() => clearSharedSpaceVideo(i)}
                                >
                                  Remove video
                                </button>
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] text-slate-500">Optional — MP4, MOV, or WebM.</p>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Rooms that may use this space (same room can be checked on multiple spaces).">Room access</FieldLabel>
                          <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {sub.rooms.map((room) => (
                              <label key={`${sp.id}-acc-${room.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm">
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

          {stepIndex === 5 ? (
          <FormSection
            id="edit-house-photos"
            title="House media"
            description="Hero gallery and optional walkthrough video at the top of your public listing — exterior, kitchen, living areas, and other common spaces."
          >
            <ListingSubsection
              title="Photos"
              description="Up to 12 images; we compress for fast loading."
            >
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
                  <p className="mt-2 text-[11px] text-slate-500">No photos yet — optional for draft, recommended before you go live.</p>
                )}
              </div>
            </ListingSubsection>

            <ListingSubsection
              title="Full-house video"
              description="One walkthrough video of the whole property (~14 MB max). Shown prominently on your public listing."
            >
              <div
                className={`mt-2 ${mediaDropZoneClass(activeDropZone === "house-video")}`}
                onDragOver={(e) => handleDragOver(e, "house-video")}
                onDragEnter={(e) => handleDragOver(e, "house-video")}
                onDragLeave={(e) => handleDragLeave(e, "house-video")}
                onDrop={onDropHouseVideo}
              >
                <input
                  key={`house-video-in`}
                  id="house-video-input"
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    void onPickHouseVideo(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="house-video-input"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06]"
                >
                  {sub.houseVideoDataUrl ? "Replace video" : "Add house video"}
                </label>
                <p className="mt-3 text-sm text-slate-600">Drag and drop a video here, or use the button above.</p>
                {sub.houseVideoDataUrl ? (
                  <div className="mt-3 space-y-2">
                    <video
                      src={videoPreviewUrls.current.get("house") ?? sub.houseVideoDataUrl}
                      controls
                      className="max-h-48 w-full rounded-xl border border-slate-200 bg-black object-contain"
                    />
                    <button
                      type="button"
                      onClick={clearHouseVideo}
                      className="text-xs font-medium text-rose-600 hover:text-rose-800"
                    >
                      Remove video
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">No video yet — optional.</p>
                )}
              </div>
            </ListingSubsection>
          </FormSection>
          ) : null}

          {stepIndex === 6 ? (
          <FormSection
            id="edit-highlights"
            title="Highlights & submit"
            description="Fine-tune the sidebar and building amenity grid, then submit for review."
          >
            <div className="space-y-8">
              <ListingSubsection
                title="Quick facts (sidebar)"
                description="Optional. Rows here replace the auto-generated sidebar. Leave empty to use building, room count, floors, and pet policy from earlier steps."
              >
                <div className="space-y-4">
                  {(sub.quickFacts ?? []).map((qf, i) => (
                    <div key={qf.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
              </ListingSubsection>

              <ListingSubsection
                title="Building & neighborhood amenities"
                description="What shows in the main amenities table on the listing. Kitchen gear, shared desks, and TV belong under Shared spaces; bathroom finishes under Bathrooms."
              >
                <div>
                  <FieldLabel hint="Tap all that apply.">Common amenities</FieldLabel>
                  <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {dedupedPresets.houseWide.map((p) => {
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
              </ListingSubsection>

              <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-white p-4 sm:p-6">
                <p className="text-sm font-bold text-slate-950">{isEditMode ? "Ready to submit changes?" : "Ready to submit this listing?"}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {isEditMode
                    ? "Review each step, then submit your changes when the listing is ready for review."
                    : "This form does not auto-save or auto-submit. Click Submit listing below when the listing is complete and ready for admin approval."}
                </p>
              </div>
            </div>
          </FormSection>
          ) : null}
        </div>

        <div className="z-20 shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-12px_rgba(15,23,42,0.14)] sm:px-6">
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
              {!isFinalStep ? (
                <Button type="button" className="rounded-full" onClick={goNext} disabled={busy}>
                  {stepIndex === lastStepIndex - 1 ? "Highlights →" : "Continue"}
                </Button>
              ) : (
                <Button type="button" className="rounded-full" onClick={() => void submitListing()} disabled={busy}>
                  {busy ? (isEditMode ? "Submitting changes…" : "Submitting listing…") : isEditMode ? "Submit changes" : "Submit listing"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

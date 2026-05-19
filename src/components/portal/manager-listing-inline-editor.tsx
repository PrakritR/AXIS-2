"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ManagerBathroomRoomAccessKind,
  ManagerBathroomSubmission,
  ManagerListingSubmissionV1,
  ManagerQuickFactRow,
  ManagerRoomSubmission,
  ManagerSharedSpaceSubmission,
} from "@/lib/manager-listing-submission";
import {
  PAYMENT_AT_SIGNING_OPTIONS,
  emptyBathroom,
  emptyQuickFactRow,
  emptyRoom,
  emptySharedSpace,
} from "@/lib/manager-listing-submission";
import {
  BATHROOM_EXTRA_AMENITY_PRESETS,
  HOUSE_WIDE_AMENITY_PRESETS,
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
  LISTING_ROOM_FLOOR_LEVEL_OPTIONS,
  LISTING_STORIES_OPTIONS,
  LISTING_TOTAL_BATH_OPTIONS,
  ROOM_AMENITY_PRESETS,
  ROOM_FURNISHING_OPTIONS,
  SHARED_SPACE_AMENITY_PRESETS,
  mergeToggleLine,
  splitLineList,
} from "@/data/manager-listing-presets";
import type { PortalListingNote } from "@/lib/portal-listing-notes";
import { getPortalListingNote, savePortalListingNote } from "@/lib/portal-listing-notes";
import { uploadListingImageFiles, uploadListingVideoFile } from "@/lib/listing-media-client";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { Modal } from "@/components/ui/modal";
import {
  readAmenityOffersForProperty,
  saveAmenityOffer,
  deleteAmenityOffer,
  toggleAmenityOfferAvailability,
  type ManagerAmenityOffer,
} from "@/lib/manager-amenity-catalog-storage";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";

// ─── shared style constants ──────────────────────────────────────────────────

const TH = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400";
const TD = "px-3 py-2.5 text-sm text-slate-700";
const LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";

function AutoResizeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={undefined} style={{ ...props.style, overflowY: "hidden", minHeight: "2.5rem" }} />;
}
const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200";
const TEXTAREA = `${INPUT} resize-y`;
const SAVE_BTN =
  "rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60";
const CANCEL_BTN =
  "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";
const SECTION_WRAP = "mt-4 overflow-hidden rounded-2xl border bg-white";
const SECTION_HEAD = "flex items-center justify-between gap-2 border-b px-4 py-2.5";
const SECTION_TITLE = "text-xs font-bold uppercase tracking-[0.14em]";
const EDIT_BTN_OFF =
  "rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50";
const EDIT_BTN_ON =
  "rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100";
const ADD_BTN =
  "rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-sky-300 hover:text-sky-700";
const KV_ROW = "flex gap-4 border-b border-slate-100 px-4 py-2.5 last:border-0";
const KV_KEY = "w-36 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400";
const KV_VAL = "text-sm text-slate-700 whitespace-pre-wrap";
const LOCATION_LEVEL_CUSTOM = "__location_custom__";

function normFloor(raw: string): string {
  if (!raw.trim()) return "—";
  const hit = LISTING_ROOM_FLOOR_LEVEL_OPTIONS.find((o) => o.id === raw.trim());
  return hit ? hit.label : raw.trim();
}

function normUtility(raw: string): string {
  const t = raw.trim().replace(/\/mo(nth)?\.?$/i, "").trim();
  if (!t) return "—";
  const num = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num) && num > 0) return `$${num}`;
  return t;
}

function normFurnishing(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  const items = t
    .replace(/\b(and|&)\b/gi, ",")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of items) {
    if (!seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      deduped.push(item);
    }
  }
  if (deduped.length === 0) return "—";
  if (deduped.length === 1) return deduped[0]!;
  return deduped.slice(0, -1).join(", ") + " & " + deduped[deduped.length - 1];
}

function locationOptionsFromStories(storiesId: string | undefined): string[] {
  if (storiesId === "1") return ["1st / main floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "2") return ["1st / main floor", "2nd floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "3") return ["1st / main floor", "2nd floor", "3rd floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "4") return ["1st / main floor", "2nd floor", "3rd floor", "4th floor or higher", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "split") return ["Main split level", "Upper split level", "Lower split level", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  return ["1st / main floor", "2nd floor", "3rd floor", "4th floor or higher", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
}

function locationSelectValue(location: string, options: readonly string[]): string {
  const t = location.trim();
  if (!t) return "";
  return options.includes(t) ? t : LOCATION_LEVEL_CUSTOM;
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function updateSelectedIdAt(ids: string[], index: number, nextId: string): string[] {
  const next = [...ids];
  if (nextId.trim()) next[index] = nextId.trim();
  else next.splice(index, 1);
  return dedupeIds(next);
}

// ─── amenity chip picker ─────────────────────────────────────────────────────

const CHIP_OFF = "cursor-pointer select-none rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700";
const CHIP_ON  = "cursor-pointer select-none rounded-full border border-sky-400 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700";

function AmenityChipPicker({
  presets,
  value,
  onChange,
  extraPlaceholder,
}: {
  presets: ReadonlyArray<{ id: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  extraPlaceholder?: string;
}) {
  const checked = new Set(splitLineList(value).map((s) => s.toLowerCase()));
  const customLines = splitLineList(value).filter(
    (s) => !presets.some((p) => p.label.toLowerCase() === s.toLowerCase()),
  );
  const [showCustom, setShowCustom] = useState(() => customLines.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(mergeToggleLine(value, p.label, !checked.has(p.label.toLowerCase())))}
            className={checked.has(p.label.toLowerCase()) ? CHIP_ON : CHIP_OFF}
          >
            {checked.has(p.label.toLowerCase()) ? "✓ " : ""}{p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={showCustom ? CHIP_ON : CHIP_OFF}
        >
          {showCustom ? "✓ " : "+ "}Custom
        </button>
      </div>
      {showCustom && (
        <AutoResizeTextarea
          rows={2}
          value={customLines.join("\n")}
          onChange={(e) => {
            const custom = splitLineList(e.target.value);
            const kept = splitLineList(value).filter((s) =>
              presets.some((p) => p.label.toLowerCase() === s.toLowerCase()),
            );
            onChange([...kept, ...custom].join("\n"));
          }}
          className={`${TEXTAREA} text-xs`}
          placeholder={extraPlaceholder ?? "Any additional items…"}
        />
      )}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  color,
  badge,
  isEditing,
  onEdit,
  editLabel = "Edit",
  cancelLabel = "Cancel",
  extra,
}: {
  title: string;
  color: string;
  badge?: React.ReactNode;
  isEditing: boolean;
  onEdit: () => void;
  editLabel?: string;
  cancelLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`${SECTION_HEAD} border-${color}-100 bg-${color}-50/60`}>
      <div className="flex items-center gap-2">
        <p className={`${SECTION_TITLE} text-${color}-700`}>{title}</p>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        {extra}
        <button type="button" onClick={onEdit} className={isEditing ? EDIT_BTN_ON : EDIT_BTN_OFF}>
          {isEditing ? cancelLabel : editLabel}
        </button>
      </div>
    </div>
  );
}

function SaveRow({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving?: boolean }) {
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" disabled={saving} onClick={onSave} className={SAVE_BTN}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className={CANCEL_BTN}>
        Cancel
      </button>
    </div>
  );
}

function InlinePhotoStrip({
  urls,
  emptyLabel,
  onRemove,
}: {
  urls: string[] | undefined;
  emptyLabel: string;
  onRemove?: (index: number) => void;
}) {
  if (!urls?.length) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {urls.slice(0, 6).map((url, index) => (
        <div key={`${url.slice(0, 32)}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          {onRemove ? (
            <button
              type="button"
              className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-xs font-bold text-white hover:bg-black/75"
              onClick={() => onRemove(index)}
              aria-label="Remove photo"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {urls.length > 6 ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
          +{urls.length - 6}
        </span>
      ) : null}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ManagerListingInlineEditor({
  sub,
  noteKey,
  onSaveSub,
  showToast,
  isListed,
  listingId,
}: {
  sub: ManagerListingSubmissionV1;
  noteKey: string | null;
  onSaveSub: (updated: ManagerListingSubmissionV1) => void;
  showToast: (msg: string) => void;
  isListed?: boolean;
  listingId?: string | null;
}) {
  // ── section editing states ────────────────────────────────────────────────
  const [editingSection, setEditingSection] = useState<string | null>(null);

  // ── room editing ──────────────────────────────────────────────────────────
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState<ManagerRoomSubmission | null>(null);

  // ── bathroom editing ──────────────────────────────────────────────────────
  const [editingBathId, setEditingBathId] = useState<string | null>(null);
  const [bathDraft, setBathDraft] = useState<ManagerBathroomSubmission | null>(null);

  // ── shared space editing ──────────────────────────────────────────────────
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [spaceDraft, setSpaceDraft] = useState<ManagerSharedSpaceSubmission | null>(null);

  // ── section drafts ────────────────────────────────────────────────────────
  const [basicsDraft, setBasicsDraft] = useState<Partial<ManagerListingSubmissionV1>>({});
  const [overviewDraft, setOverviewDraft] = useState("");
  const [mediaDraft, setMediaDraft] = useState<Pick<ManagerListingSubmissionV1, "housePhotoDataUrls" | "houseVideoDataUrl">>({
    housePhotoDataUrls: [],
    houseVideoDataUrl: null,
  });
  const [leaseDraft, setLeaseDraft] = useState<Partial<ManagerListingSubmissionV1>>({});
  const [amenitiesDraft, setAmenitiesDraft] = useState("");
  const [qfDraft, setQfDraft] = useState<ManagerQuickFactRow[]>([]);
  const [mediaUploadingKeys, setMediaUploadingKeys] = useState<Set<string>>(() => new Set());

  // ── portal notes state (house details) ────────────────────────────────────
  const [notesTick, setNotesTick] = useState(0);
  const portalNote = useMemo(
    () => (noteKey ? getPortalListingNote(noteKey) : ({} as PortalListingNote)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteKey, notesTick],
  );
  const [houseEditing, setHouseEditing] = useState(false);
  const [houseDraft, setHouseDraft] = useState<PortalListingNote>({});
  const locationLevelOptions = useMemo(() => locationOptionsFromStories(sub.listingStoriesId), [sub.listingStoriesId]);

  // ── services state ────────────────────────────────────────────────────────
  const { userId } = useManagerUserId();
  const [serviceOffers, setServiceOffers] = useState<ManagerAmenityOffer[]>([]);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ManagerAmenityOffer | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: "", description: "", price: "", deposit: "", restrictToResidents: false, selectedEmails: [] as string[],
  });

  useEffect(() => {
    if (userId && listingId) setServiceOffers(readAmenityOffersForProperty(userId, listingId));
  }, [userId, listingId]);

  const reloadOffers = useCallback(() => {
    if (userId && listingId) setServiceOffers(readAmenityOffersForProperty(userId, listingId));
  }, [userId, listingId]);

  const propertyResidents = useMemo(() => {
    if (!listingId) return [];
    return readManagerApplicationRows().filter(
      (r) => r.bucket === "approved" && r.email?.trim() &&
        (r.assignedPropertyId?.trim() === listingId || r.propertyId?.trim() === listingId ||
         r.application?.propertyId?.trim() === listingId),
    );
  }, [listingId]);

  const handleSaveService = useCallback(() => {
    if (!serviceForm.name.trim() || !userId) return;
    const offer: ManagerAmenityOffer = {
      id: editingOffer?.id ?? `offer-${Date.now()}`,
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim(),
      price: serviceForm.price.trim(),
      deposit: serviceForm.deposit.trim(),
      category: "",
      available: editingOffer?.available ?? true,
      managerUserId: userId,
      propertyId: listingId ?? undefined,
      residentEmails: serviceForm.restrictToResidents && serviceForm.selectedEmails.length
        ? serviceForm.selectedEmails
        : undefined,
      createdAt: editingOffer?.createdAt ?? new Date().toISOString(),
    };
    saveAmenityOffer(offer);
    reloadOffers();
    setServiceModalOpen(false);
    setEditingOffer(null);
    setServiceForm({ name: "", description: "", price: "", deposit: "", restrictToResidents: false, selectedEmails: [] });
  }, [serviceForm, editingOffer, userId, listingId, reloadOffers]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const saveSub = useCallback(
    (updated: ManagerListingSubmissionV1, msg: string) => {
      onSaveSub(updated);
      showToast(isListed ? `${msg} (sent for re-approval)` : msg);
    },
    [onSaveSub, showToast, isListed],
  );

  const withMediaUpload = useCallback(
    async (key: string, work: () => Promise<void>) => {
      setMediaUploadingKeys((current) => new Set([...current, key]));
      try {
        await work();
      } finally {
        setMediaUploadingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  const onPickRoomPhotos = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !roomDraft) return;
      await withMediaUpload(`room-photos-${roomDraft.id}`, async () => {
        const uploaded = await uploadListingImageFiles(Array.from(files).slice(0, 8 - roomDraft.photoDataUrls.length));
        setRoomDraft((draft) =>
          draft ? { ...draft, photoDataUrls: [...draft.photoDataUrls, ...uploaded].slice(0, 8) } : draft,
        );
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload room photos."));
    },
    [roomDraft, showToast, withMediaUpload],
  );

  const onPickRoomVideo = useCallback(
    async (file: File | null) => {
      if (!file || !roomDraft) return;
      await withMediaUpload(`room-video-${roomDraft.id}`, async () => {
        const uploaded = await uploadListingVideoFile(file);
        setRoomDraft((draft) => (draft ? { ...draft, videoDataUrl: uploaded } : draft));
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload room video."));
    },
    [roomDraft, showToast, withMediaUpload],
  );

  const onPickBathPhotos = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !bathDraft) return;
      await withMediaUpload(`bath-photos-${bathDraft.id}`, async () => {
        const uploaded = await uploadListingImageFiles(Array.from(files).slice(0, 8 - bathDraft.photoDataUrls.length));
        setBathDraft((draft) =>
          draft ? { ...draft, photoDataUrls: [...draft.photoDataUrls, ...uploaded].slice(0, 8) } : draft,
        );
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload bathroom photos."));
    },
    [bathDraft, showToast, withMediaUpload],
  );

  const onPickBathVideo = useCallback(
    async (file: File | null) => {
      if (!file || !bathDraft) return;
      await withMediaUpload(`bath-video-${bathDraft.id}`, async () => {
        const uploaded = await uploadListingVideoFile(file);
        setBathDraft((draft) => (draft ? { ...draft, videoDataUrl: uploaded } : draft));
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload bathroom video."));
    },
    [bathDraft, showToast, withMediaUpload],
  );

  const onPickSpacePhotos = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !spaceDraft) return;
      await withMediaUpload(`space-photos-${spaceDraft.id}`, async () => {
        const uploaded = await uploadListingImageFiles(Array.from(files).slice(0, 8 - spaceDraft.photoDataUrls.length));
        setSpaceDraft((draft) =>
          draft ? { ...draft, photoDataUrls: [...draft.photoDataUrls, ...uploaded].slice(0, 8) } : draft,
        );
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload shared-space photos."));
    },
    [spaceDraft, showToast, withMediaUpload],
  );

  const onPickSpaceVideo = useCallback(
    async (file: File | null) => {
      if (!file || !spaceDraft) return;
      await withMediaUpload(`space-video-${spaceDraft.id}`, async () => {
        const uploaded = await uploadListingVideoFile(file);
        setSpaceDraft((draft) => (draft ? { ...draft, videoDataUrl: uploaded } : draft));
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload shared-space video."));
    },
    [spaceDraft, showToast, withMediaUpload],
  );

  const onPickHousePhotos = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      await withMediaUpload("house-photos", async () => {
        const currentPhotos = mediaDraft.housePhotoDataUrls ?? [];
        const uploaded = await uploadListingImageFiles(Array.from(files).slice(0, 12 - currentPhotos.length));
        setMediaDraft((draft) => ({
          ...draft,
          housePhotoDataUrls: [...(draft.housePhotoDataUrls ?? []), ...uploaded].slice(0, 12),
        }));
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload house photos."));
    },
    [mediaDraft.housePhotoDataUrls, showToast, withMediaUpload],
  );

  const onPickHouseVideo = useCallback(
    async (file: File | null) => {
      if (!file) return;
      await withMediaUpload("house-video", async () => {
        const uploaded = await uploadListingVideoFile(file);
        setMediaDraft((draft) => ({ ...draft, houseVideoDataUrl: uploaded }));
      }).catch((error) => showToast(error instanceof Error ? error.message : "Could not upload house video."));
    },
    [showToast, withMediaUpload],
  );

  const closeSection = useCallback(() => {
    setEditingSection(null);
    setEditingRoomId(null);
    setEditingBathId(null);
    setEditingSpaceId(null);
  }, []);

  // ── SECTION: PROPERTY BASICS ──────────────────────────────────────────────
  const startEditBasics = () => {
    setBasicsDraft({
      buildingName: sub.buildingName,
      address: sub.address,
      zip: sub.zip,
      neighborhood: sub.neighborhood,
      tagline: sub.tagline,
      petFriendly: sub.petFriendly,
      homeStructureNote: sub.homeStructureNote,
      listingPropertyTypeId: sub.listingPropertyTypeId ?? "",
      listingPlaceCategoryId: sub.listingPlaceCategoryId ?? "shared_home",
      listingStoriesId: sub.listingStoriesId ?? "",
      listingTotalBathroomsId: sub.listingTotalBathroomsId ?? "",
    });
    setEditingSection("basics");
  };

  const saveBasics = () => {
    saveSub({ ...sub, ...basicsDraft }, "Property basics saved.");
    setEditingSection(null);
  };

  // ── SECTION: HOUSE OVERVIEW ────────────────────────────────────────────────
  const startEditOverview = () => {
    setOverviewDraft(sub.houseOverview);
    setEditingSection("overview");
  };

  const saveOverview = () => {
    saveSub({ ...sub, houseOverview: overviewDraft }, "Overview saved.");
    setEditingSection(null);
  };

  const startEditMedia = () => {
    setMediaDraft({
      housePhotoDataUrls: [...(sub.housePhotoDataUrls ?? [])],
      houseVideoDataUrl: sub.houseVideoDataUrl ?? null,
    });
    setEditingSection("media");
  };

  const saveMedia = () => {
    saveSub(
      {
        ...sub,
        housePhotoDataUrls: [...(mediaDraft.housePhotoDataUrls ?? [])],
        houseVideoDataUrl: mediaDraft.houseVideoDataUrl ?? null,
      },
      "Listing media saved.",
    );
    setEditingSection(null);
  };

  // ── SECTION: ROOMS ────────────────────────────────────────────────────────
  const startEditRoom = (room: ManagerRoomSubmission) => {
    setRoomDraft({ ...room });
    setEditingRoomId(room.id);
    setEditingSection("rooms");
  };

  const saveRoom = () => {
    if (!roomDraft) return;
    const updatedRooms = sub.rooms.map((r) => (r.id === roomDraft.id ? roomDraft : r));
    saveSub({ ...sub, rooms: updatedRooms }, "Room saved.");
    closeSection();
  };

  const addRoom = () => {
    const newRoom = emptyRoom(sub.rooms.length);
    const updatedRooms = [...sub.rooms, newRoom];
    saveSub({ ...sub, rooms: updatedRooms, listingBedroomSlots: updatedRooms.length }, "Room added.");
  };

  const removeRoom = (roomId: string) => {
    if (sub.rooms.length <= 1) {
      showToast("At least one room is required.");
      return;
    }
    if (!window.confirm("Remove this room from the listing?")) return;
    const updatedRooms = sub.rooms.filter((r) => r.id !== roomId);
    saveSub({ ...sub, rooms: updatedRooms, listingBedroomSlots: updatedRooms.length }, "Room removed.");
  };

  // ── SECTION: BATHROOMS ────────────────────────────────────────────────────
  const startEditBath = (b: ManagerBathroomSubmission) => {
    setBathDraft({ ...b, assignedRoomIds: [...b.assignedRoomIds] });
    setEditingBathId(b.id);
    setEditingSection("bathrooms");
  };

  const saveBath = () => {
    if (!bathDraft) return;
    const assignedRoomIds = bathDraft.allResidents ? [] : dedupeIds(bathDraft.assignedRoomIds);
    const cleanedBath: ManagerBathroomSubmission = {
      ...bathDraft,
      assignedRoomIds,
      accessKindByRoomId: bathDraft.allResidents
        ? undefined
        : Object.fromEntries(
            Object.entries(bathDraft.accessKindByRoomId ?? {}).filter(([roomId]) => assignedRoomIds.includes(roomId)),
          ),
    };
    const updatedBaths = sub.bathrooms.map((b) => (b.id === cleanedBath.id ? cleanedBath : b));
    saveSub({ ...sub, bathrooms: updatedBaths }, "Bathroom saved.");
    closeSection();
  };

  const addBathroom = () => {
    const nb = emptyBathroom(sub.bathrooms.length);
    saveSub({ ...sub, bathrooms: [...sub.bathrooms, nb] }, "Bathroom added.");
  };

  const removeBathroom = (bathId: string) => {
    if (!window.confirm("Remove this bathroom from the listing?")) return;
    saveSub({ ...sub, bathrooms: sub.bathrooms.filter((b) => b.id !== bathId) }, "Bathroom removed.");
  };

  // ── SECTION: SHARED SPACES ────────────────────────────────────────────────
  const startEditSpace = (s: ManagerSharedSpaceSubmission) => {
    setSpaceDraft({ ...s, roomAccessIds: [...s.roomAccessIds] });
    setEditingSpaceId(s.id);
    setEditingSection("spaces");
  };

  const saveSpace = () => {
    if (!spaceDraft) return;
    const cleanedSpace: ManagerSharedSpaceSubmission = {
      ...spaceDraft,
      roomAccessIds: dedupeIds(spaceDraft.roomAccessIds),
    };
    const updatedSpaces = sub.sharedSpaces.map((s) => (s.id === cleanedSpace.id ? cleanedSpace : s));
    saveSub({ ...sub, sharedSpaces: updatedSpaces }, "Shared space saved.");
    closeSection();
  };

  const addSpace = () => {
    const ns = emptySharedSpace(sub.sharedSpaces.length);
    saveSub({ ...sub, sharedSpaces: [...sub.sharedSpaces, ns] }, "Shared space added.");
  };

  const removeSpace = (spaceId: string) => {
    if (!window.confirm("Remove this shared space?")) return;
    saveSub({ ...sub, sharedSpaces: sub.sharedSpaces.filter((s) => s.id !== spaceId) }, "Shared space removed.");
  };

  // ── SECTION: LEASE & PRICING ──────────────────────────────────────────────
  const startEditLease = () => {
    setLeaseDraft({
      applicationFee: sub.applicationFee,
      securityDeposit: sub.securityDeposit,
      moveInFee: sub.moveInFee,
      paymentAtSigningIncludes: [...sub.paymentAtSigningIncludes],
      leaseTermsBody: sub.leaseTermsBody,
      houseCostsDetail: sub.houseCostsDetail,
      parkingMonthly: sub.parkingMonthly,
      hoaMonthly: sub.hoaMonthly,
      otherMonthlyFees: sub.otherMonthlyFees,
      monthToMonthSurcharge: sub.monthToMonthSurcharge ?? "",
      shortTermRentalsAllowed: sub.shortTermRentalsAllowed ?? false,
      shortTermRequirements: sub.shortTermRequirements ?? "",
      shortTermDailyCost: sub.shortTermDailyCost ?? "",
      shortTermDeposit: sub.shortTermDeposit ?? "",
      shortTermMoveInFee: sub.shortTermMoveInFee ?? "",
      zellePaymentsEnabled: sub.zellePaymentsEnabled ?? false,
      zelleContact: sub.zelleContact ?? "",
      venmoPaymentsEnabled: sub.venmoPaymentsEnabled ?? false,
      venmoContact: sub.venmoContact ?? "",
    });
    setEditingSection("lease");
  };

  const saveLease = () => {
    saveSub({ ...sub, ...leaseDraft }, "Lease & pricing saved.");
    setEditingSection(null);
  };

  // ── SECTION: AMENITIES ────────────────────────────────────────────────────
  const startEditAmenities = () => {
    setAmenitiesDraft(sub.amenitiesText);
    setQfDraft(sub.quickFacts.map((q) => ({ ...q })));
    setEditingSection("amenities");
  };

  const saveAmenities = () => {
    saveSub({ ...sub, amenitiesText: amenitiesDraft, quickFacts: qfDraft }, "Amenities saved.");
    setEditingSection(null);
  };

  // ── SECTION: HOUSE DETAILS (PORTAL NOTE) ─────────────────────────────────
  const saveHouseDetails = () => {
    if (!noteKey) return;
    savePortalListingNote(noteKey, { houseDescription: houseDraft.houseDescription, houseRulesText: houseDraft.houseRulesText });
    saveSub({ ...sub, generalHouseInfo: houseDraft.generalHouseInfo ?? "" }, "House details saved.");
    setHouseEditing(false);
    setNotesTick((t) => t + 1);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-0">
      {/* ── PROPERTY BASICS ── */}
      <div className={`${SECTION_WRAP} border-slate-200`}>
        <SectionHeader
          title="Property basics"
          color="slate"
          isEditing={editingSection === "basics"}
          onEdit={() => (editingSection === "basics" ? setEditingSection(null) : startEditBasics())}
        />
        {editingSection === "basics" ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Building / property name</label>
                <input
                  type="text"
                  value={basicsDraft.buildingName ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, buildingName: e.target.value }))}
                  className={INPUT}
                  placeholder="e.g. The Willow House"
                />
              </div>
              <div>
                <label className={LABEL}>Street address</label>
                <input
                  type="text"
                  value={basicsDraft.address ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, address: e.target.value }))}
                  className={INPUT}
                  placeholder="1234 Main St, Apt 2"
                />
              </div>
              <div>
                <label className={LABEL}>ZIP code</label>
                <input
                  type="text"
                  value={basicsDraft.zip ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, zip: e.target.value }))}
                  className={INPUT}
                  placeholder="90210"
                />
              </div>
              <div>
                <label className={LABEL}>Neighborhood</label>
                <input
                  type="text"
                  value={basicsDraft.neighborhood ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, neighborhood: e.target.value }))}
                  className={INPUT}
                  placeholder="e.g. Silver Lake"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Tagline</label>
                <input
                  type="text"
                  value={basicsDraft.tagline ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, tagline: e.target.value }))}
                  className={INPUT}
                  placeholder="One-line hook shown on search results"
                />
              </div>
              <div>
                <label className={LABEL}>Property type</label>
                <select
                  value={basicsDraft.listingPropertyTypeId ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, listingPropertyTypeId: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">— select —</option>
                  {LISTING_PROPERTY_TYPE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Place category</label>
                <select
                  value={basicsDraft.listingPlaceCategoryId ?? "shared_home"}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, listingPlaceCategoryId: e.target.value }))}
                  className={INPUT}
                >
                  {LISTING_PLACE_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Stories / floors</label>
                <select
                  value={basicsDraft.listingStoriesId ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, listingStoriesId: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">— select —</option>
                  {LISTING_STORIES_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Total bathrooms</label>
                <select
                  value={basicsDraft.listingTotalBathroomsId ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, listingTotalBathroomsId: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">— select —</option>
                  {LISTING_TOTAL_BATH_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Home structure note</label>
                <input
                  type="text"
                  value={basicsDraft.homeStructureNote ?? ""}
                  onChange={(e) => setBasicsDraft((d) => ({ ...d, homeStructureNote: e.target.value }))}
                  className={INPUT}
                  placeholder="e.g. 3-story craftsman"
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={basicsDraft.petFriendly ?? false}
                    onChange={(e) => setBasicsDraft((d) => ({ ...d, petFriendly: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                  />
                  Pet-friendly
                </label>
              </div>
            </div>
            <SaveRow onSave={saveBasics} onCancel={() => setEditingSection(null)} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[
              { key: "Address", val: [sub.address, sub.zip, sub.neighborhood].filter(Boolean).join(" · ") || "—" },
              {
                key: "Type",
                val: [
                  LISTING_PROPERTY_TYPE_OPTIONS.find((o) => o.id === sub.listingPropertyTypeId)?.label,
                  LISTING_PLACE_CATEGORY_OPTIONS.find((o) => o.id === sub.listingPlaceCategoryId)?.short,
                  LISTING_STORIES_OPTIONS.find((o) => o.id === sub.listingStoriesId)?.label,
                  LISTING_TOTAL_BATH_OPTIONS.find((o) => o.id === sub.listingTotalBathroomsId)?.label,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—",
              },
              { key: "Tagline", val: sub.tagline || "—" },
              { key: "Home structure", val: sub.homeStructureNote || "—" },
              { key: "Pet-friendly", val: sub.petFriendly ? "Yes" : "No" },
            ].map(({ key, val }) => (
              <div key={key} className={KV_ROW}>
                <span className={KV_KEY}>{key}</span>
                <span className={KV_VAL}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── HOUSE OVERVIEW ── */}
      <div className={`${SECTION_WRAP} border-slate-200`}>
        <SectionHeader
          title="House overview"
          color="slate"
          isEditing={editingSection === "overview"}
          onEdit={() => (editingSection === "overview" ? setEditingSection(null) : startEditOverview())}
        />
        {editingSection === "overview" ? (
          <div className="p-4">
            <label className={LABEL}>Overview / description shown on listing</label>
            <AutoResizeTextarea
              rows={6}
              value={overviewDraft}
              onChange={(e) => setOverviewDraft(e.target.value)}
              className={TEXTAREA}
              placeholder="Describe the home, vibe, common areas, location highlights…"
            />
            <SaveRow onSave={saveOverview} onCancel={() => setEditingSection(null)} />
          </div>
        ) : (
          <div className="px-4 py-3">
            {sub.houseOverview?.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{sub.houseOverview}</p>
            ) : (
              <p className="text-sm text-slate-400">No overview yet — click Edit to add.</p>
            )}
          </div>
        )}
      </div>

      <div className={`${SECTION_WRAP} border-slate-200`}>
        <SectionHeader
          title="Listing media"
          color="slate"
          isEditing={editingSection === "media"}
          onEdit={() => (editingSection === "media" ? setEditingSection(null) : startEditMedia())}
        />
        {editingSection === "media" ? (
          <div className="grid gap-4 p-4">
            <div>
              <label className={LABEL}>House photos</label>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void onPickHousePhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    {mediaUploadingKeys.has("house-photos") ? "Uploading..." : "Upload house photos"}
                  </label>
                </div>
                <div className="mt-3">
                  <InlinePhotoStrip
                    urls={mediaDraft.housePhotoDataUrls}
                    emptyLabel="No house photos on this listing yet."
                    onRemove={(photoIndex) =>
                      setMediaDraft((draft) => ({
                        ...draft,
                        housePhotoDataUrls: (draft.housePhotoDataUrls ?? []).filter((_, index) => index !== photoIndex),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
            <div>
              <label className={LABEL}>House video</label>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        void onPickHouseVideo(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    {mediaUploadingKeys.has("house-video")
                      ? "Uploading..."
                      : mediaDraft.houseVideoDataUrl
                        ? "Replace house video"
                        : "Upload house video"}
                  </label>
                  {mediaDraft.houseVideoDataUrl ? (
                    <button
                      type="button"
                      className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                      onClick={() => setMediaDraft((draft) => ({ ...draft, houseVideoDataUrl: null }))}
                    >
                      Remove video
                    </button>
                  ) : null}
                </div>
                {mediaDraft.houseVideoDataUrl ? (
                  <video
                    src={mediaDraft.houseVideoDataUrl}
                    controls
                    playsInline
                    className="mt-3 max-h-72 w-full rounded-lg border border-slate-200 bg-black object-contain"
                  />
                ) : (
                  <p className="mt-3 text-xs text-slate-400">No house video on this listing yet.</p>
                )}
              </div>
            </div>
            <SaveRow onSave={saveMedia} onCancel={() => setEditingSection(null)} />
          </div>
        ) : (
          <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
            <div>
              <p className={`${LABEL} mb-2`}>House photos</p>
              <InlinePhotoStrip urls={sub.housePhotoDataUrls} emptyLabel="No house photos on this listing yet." />
            </div>
            <div>
              <p className={`${LABEL} mb-2`}>House video</p>
              {sub.houseVideoDataUrl ? (
                <video
                  src={sub.houseVideoDataUrl}
                  controls
                  playsInline
                  className="max-h-56 w-full rounded-lg border border-slate-200 bg-black object-contain"
                />
              ) : (
                <p className="text-sm text-slate-400">No house video yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── ROOMS ── */}
      <div className={`${SECTION_WRAP} border-sky-100`}>
        <div className={`${SECTION_HEAD} border-sky-100 bg-sky-50/60`}>
          <div className="flex items-center gap-2">
            <p className={`${SECTION_TITLE} text-sky-700`}>Rooms</p>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              {sub.rooms.length} room{sub.rooms.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button type="button" onClick={addRoom} className={ADD_BTN}>
            + Add room
          </button>
        </div>
        {sub.rooms.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No rooms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className={TH}>#</th>
                  <th className={TH}>Room</th>
                  <th className={TH}>Floor</th>
                  <th className={TH}>Rent/mo</th>
                  <th className={TH}>Utilities est.</th>
                  <th className={TH}>Furnishing</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sub.rooms.map((room, idx) => {
                  const isEditing = editingRoomId === room.id && editingSection === "rooms";
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/40";
                  return (
                    <Fragment key={room.id}>
                      <tr className={`border-b border-slate-100 ${isEditing ? "bg-sky-50/40" : rowBg}`}>
                        <td className={TD}>
                          <span className="text-xs font-semibold text-slate-400">{idx + 1}</span>
                        </td>
                        <td className={TD}>
                          <p className="font-semibold text-slate-900">{room.name || `Room ${idx + 1}`}</p>
                          {room.detail?.trim() ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{room.detail}</p>
                          ) : null}
                          {room.photoDataUrls.length > 0 ? (
                            <div className="mt-2">
                              <InlinePhotoStrip urls={room.photoDataUrls.slice(0, 3)} emptyLabel="" />
                            </div>
                          ) : null}
                        </td>
                        <td className={TD}>{normFloor(room.floor)}</td>
                        <td className={TD}>
                          {room.monthlyRent > 0 ? (
                            <span className="font-semibold text-slate-900">${room.monthlyRent.toLocaleString()}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className={TD}>{normUtility(room.utilitiesEstimate)}</td>
                        <td className={TD}>{normFurnishing(room.furnishing)}</td>
                        <td className={`${TD} text-right`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                isEditing ? closeSection() : startEditRoom(room)
                              }
                              className={isEditing ? EDIT_BTN_ON : EDIT_BTN_OFF}
                            >
                              {isEditing ? "Cancel" : "Edit"}
                            </button>
                            {!isEditing ? (
                              <button
                                type="button"
                                onClick={() => removeRoom(room.id)}
                                className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isEditing && roomDraft ? (
                        <tr className="border-b border-sky-100">
                          <td colSpan={8} className="bg-sky-50/20 px-4 py-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <label className={LABEL}>Room name</label>
                                <input
                                  type="text"
                                  value={roomDraft.name}
                                  onChange={(e) => setRoomDraft((d) => d ? { ...d, name: e.target.value } : d)}
                                  className={INPUT}
                                  placeholder="e.g. Master bedroom"
                                />
                              </div>
                              <div>
                                <label className={LABEL}>Floor</label>
                                <select
                                  value={roomDraft.floor}
                                  onChange={(e) => setRoomDraft((d) => d ? { ...d, floor: e.target.value } : d)}
                                  className={INPUT}
                                >
                                  <option value="">— select —</option>
                                  {LISTING_ROOM_FLOOR_LEVEL_OPTIONS.map((o) => (
                                    <option key={o.id} value={o.id}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={LABEL}>Monthly rent ($)</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={roomDraft.monthlyRent || ""}
                                  onChange={(e) =>
                                    setRoomDraft((d) =>
                                      d ? { ...d, monthlyRent: parseFloat(e.target.value) || 0 } : d,
                                    )
                                  }
                                  className={INPUT}
                                  placeholder="950"
                                />
                              </div>
                              <div>
                                <label className={LABEL}>Est. utilities/mo</label>
                                <input
                                  type="text"
                                  value={roomDraft.utilitiesEstimate}
                                  onChange={(e) =>
                                    setRoomDraft((d) => d ? { ...d, utilitiesEstimate: e.target.value } : d)
                                  }
                                  className={INPUT}
                                  placeholder="$175"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>Proration method</label>
                                <div className="mt-1.5 flex gap-2">
                                  {(["auto", "daily_rate"] as const).map((method) => {
                                    const active = (roomDraft.prorateMethod ?? "auto") === method;
                                    return (
                                      <button
                                        key={method}
                                        type="button"
                                        onClick={() => setRoomDraft((d) => d ? { ...d, prorateMethod: method } : d)}
                                        className={`flex-1 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${active ? "border-sky-400 bg-sky-50 font-semibold text-sky-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                                      >
                                        <span className="block font-semibold">{method === "auto" ? "Auto (÷ days in month)" : "Manual daily rate"}</span>
                                        <span className="block text-[11px] opacity-70">{method === "auto" ? "Remaining days ÷ days in month × monthly rate" : "Remaining days × your set daily rate"}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {(roomDraft.prorateMethod ?? "auto") === "daily_rate" && (
                                <>
                                  <div>
                                    <label className={LABEL}>Daily rent rate ($)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={roomDraft.dailyRentRate ?? ""}
                                      onChange={(e) => setRoomDraft((d) => d ? { ...d, dailyRentRate: parseFloat(e.target.value) || undefined } : d)}
                                      className={INPUT}
                                      placeholder={roomDraft.monthlyRent > 0 ? String(Math.ceil(roomDraft.monthlyRent / 30)) : "28"}
                                    />
                                  </div>
                                  <div>
                                    <label className={LABEL}>Daily utilities rate ($)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={roomDraft.dailyUtilitiesRate ?? ""}
                                      onChange={(e) => setRoomDraft((d) => d ? { ...d, dailyUtilitiesRate: parseFloat(e.target.value) || undefined } : d)}
                                      className={INPUT}
                                      placeholder="6"
                                    />
                                  </div>
                                </>
                              )}
                              <div>
                                <label className={LABEL}>Furnishing</label>
                                <select
                                  value={ROOM_FURNISHING_OPTIONS.find((o) => o.value === roomDraft.furnishing)?.value ?? ""}
                                  onChange={(e) => setRoomDraft((d) => d ? { ...d, furnishing: e.target.value } : d)}
                                  className={INPUT}
                                >
                                  {ROOM_FURNISHING_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={`${LABEL} mb-2`}>Room amenities</label>
                                <AmenityChipPicker
                                  presets={ROOM_AMENITY_PRESETS}
                                  value={roomDraft.roomAmenitiesText}
                                  onChange={(v) => setRoomDraft((d) => d ? { ...d, roomAmenitiesText: v } : d)}
                                  extraPlaceholder="Private patio, Murphy bed…"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>Room photos</label>
                                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          void onPickRoomPhotos(e.target.files);
                                          e.target.value = "";
                                        }}
                                      />
                                      {mediaUploadingKeys.has(`room-photos-${roomDraft.id}`) ? "Uploading..." : "Upload photos"}
                                    </label>
                                  </div>
                                  <div className="mt-3">
                                    <InlinePhotoStrip
                                      urls={roomDraft.photoDataUrls}
                                      emptyLabel="No room photos on this listing yet."
                                      onRemove={(photoIndex) =>
                                        setRoomDraft((draft) =>
                                          draft
                                            ? {
                                                ...draft,
                                                photoDataUrls: draft.photoDataUrls.filter((_, index) => index !== photoIndex),
                                              }
                                            : draft,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>Room video</label>
                                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                      <input
                                        type="file"
                                        accept="video/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          void onPickRoomVideo(e.target.files?.[0] ?? null);
                                          e.target.value = "";
                                        }}
                                      />
                                      {mediaUploadingKeys.has(`room-video-${roomDraft.id}`)
                                        ? "Uploading..."
                                        : roomDraft.videoDataUrl
                                          ? "Replace video"
                                          : "Upload video"}
                                    </label>
                                    {roomDraft.videoDataUrl ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                        onClick={() => setRoomDraft((draft) => (draft ? { ...draft, videoDataUrl: null } : draft))}
                                      >
                                        Remove video
                                      </button>
                                    ) : null}
                                  </div>
                                  {roomDraft.videoDataUrl ? (
                                    <video
                                      src={roomDraft.videoDataUrl}
                                      controls
                                      playsInline
                                      className="mt-3 max-h-64 w-full rounded-lg border border-slate-200 bg-black object-contain"
                                    />
                                  ) : (
                                    <p className="mt-3 text-xs text-slate-400">No room video on this listing yet.</p>
                                  )}
                                </div>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>Room description</label>
                                <AutoResizeTextarea
                                  rows={3}
                                  value={roomDraft.detail}
                                  onChange={(e) => setRoomDraft((d) => d ? { ...d, detail: e.target.value } : d)}
                                  className={TEXTAREA}
                                  placeholder="Describe the room — size, light, views, vibe…"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>
                                  Move-in instructions
                                  <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 normal-case tracking-normal">
                                    Shown to resident
                                  </span>
                                </label>
                                <AutoResizeTextarea
                                  rows={4}
                                  value={roomDraft.moveInInstructions}
                                  onChange={(e) =>
                                    setRoomDraft((d) => d ? { ...d, moveInInstructions: e.target.value } : d)
                                  }
                                  className={TEXTAREA}
                                  placeholder="Keys, parking, access codes, what to bring…"
                                />
                              </div>
                            </div>
                            <SaveRow onSave={saveRoom} onCancel={closeSection} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── BATHROOMS ── */}
      <div className={`${SECTION_WRAP} border-sky-100`}>
        <div className={`${SECTION_HEAD} border-sky-100 bg-sky-50/60`}>
          <div className="flex items-center gap-2">
            <p className={`${SECTION_TITLE} text-sky-700`}>Bathrooms</p>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              {sub.bathrooms.length}
            </span>
          </div>
          <button type="button" onClick={addBathroom} className={ADD_BTN}>
            + Add bathroom
          </button>
        </div>
        {sub.bathrooms.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No bathrooms added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className={TH}>Name</th>
                  <th className={TH}>Location</th>
                  <th className={TH}>Fixtures</th>
                  <th className={TH}>Assigned rooms</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sub.bathrooms.map((bath, idx) => {
                  const isEditing = editingBathId === bath.id && editingSection === "bathrooms";
                  const fixtures = [bath.shower && "Shower", bath.toilet && "Toilet", bath.bathtub && "Bathtub"]
                    .filter(Boolean)
                    .join(", ");
                  const assignedNames = bath.allResidents
                    ? "All residents"
                    : bath.assignedRoomIds
                        .map((rid) => sub.rooms.find((r) => r.id === rid)?.name || rid)
                        .join(", ") || "—";
                  return (
                    <Fragment key={bath.id}>
                      <tr
                        className={`border-b border-slate-100 ${isEditing ? "bg-sky-50/40" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                      >
                        <td className={TD}>
                          <p className="font-semibold text-slate-900">{bath.name || `Bathroom ${idx + 1}`}</p>
                          {bath.photoDataUrls.length > 0 ? (
                            <div className="mt-2">
                              <InlinePhotoStrip urls={bath.photoDataUrls.slice(0, 3)} emptyLabel="" />
                            </div>
                          ) : null}
                        </td>
                        <td className={TD}>{bath.location || "—"}</td>
                        <td className={TD}>{fixtures || "—"}</td>
                        <td className={TD}>{assignedNames}</td>
                        <td className={`${TD} text-right`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => (isEditing ? closeSection() : startEditBath(bath))}
                              className={isEditing ? EDIT_BTN_ON : EDIT_BTN_OFF}
                            >
                              {isEditing ? "Cancel" : "Edit"}
                            </button>
                            {!isEditing ? (
                              <button
                                type="button"
                                onClick={() => removeBathroom(bath.id)}
                                className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isEditing && bathDraft ? (
                        <tr className="border-b border-sky-100">
                          <td colSpan={5} className="bg-sky-50/20 px-4 py-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className={LABEL}>Bathroom name</label>
                                <input
                                  type="text"
                                  value={bathDraft.name}
                                  onChange={(e) => setBathDraft((d) => d ? { ...d, name: e.target.value } : d)}
                                  className={INPUT}
                                />
                              </div>
                              <div>
                                <label className={LABEL}>Location</label>
                                <div className="space-y-2">
                                  <select
                                    value={locationSelectValue(bathDraft.location, locationLevelOptions)}
                                    onChange={(e) =>
                                      setBathDraft((d) => {
                                        if (!d) return d;
                                        const nextValue = e.target.value;
                                        if (!nextValue) return { ...d, location: "" };
                                        if (nextValue === LOCATION_LEVEL_CUSTOM) {
                                          if (locationLevelOptions.includes(d.location.trim())) return { ...d, location: "" };
                                          return d;
                                        }
                                        return { ...d, location: nextValue };
                                      })
                                    }
                                    className={INPUT}
                                  >
                                    <option value="">Select location</option>
                                    {locationLevelOptions.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                    <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                                  </select>
                                  {locationSelectValue(bathDraft.location, locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                                    <input
                                      type="text"
                                      value={bathDraft.location}
                                      onChange={(e) => setBathDraft((d) => d ? { ...d, location: e.target.value } : d)}
                                      className={INPUT}
                                      placeholder="Custom location"
                                    />
                                  ) : null}
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <label className={`${LABEL} mb-2`}>Fixtures & finishes</label>
                                <AmenityChipPicker
                                  presets={BATHROOM_EXTRA_AMENITY_PRESETS}
                                  value={bathDraft.amenitiesText}
                                  onChange={(v) => setBathDraft((d) => d ? { ...d, amenitiesText: v } : d)}
                                  extraPlaceholder="Rain shower, towel warmer…"
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className={LABEL}>Fixtures</label>
                                {(["shower", "toilet", "bathtub"] as const).map((f) => (
                                  <label key={f} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 capitalize">
                                    <input
                                      type="checkbox"
                                      checked={bathDraft[f]}
                                      onChange={(e) => setBathDraft((d) => d ? { ...d, [f]: e.target.checked } : d)}
                                      className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                                    />
                                    {f}
                                  </label>
                                ))}
                              </div>
                              <div className="sm:col-span-2">
                                <label className={LABEL}>Bathroom photos</label>
                                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          void onPickBathPhotos(e.target.files);
                                          e.target.value = "";
                                        }}
                                      />
                                      {mediaUploadingKeys.has(`bath-photos-${bathDraft.id}`) ? "Uploading..." : "Upload photos"}
                                    </label>
                                  </div>
                                  <div className="mt-3">
                                    <InlinePhotoStrip
                                      urls={bathDraft.photoDataUrls}
                                      emptyLabel="No bathroom photos on this listing yet."
                                      onRemove={(photoIndex) =>
                                        setBathDraft((draft) =>
                                          draft
                                            ? {
                                                ...draft,
                                                photoDataUrls: draft.photoDataUrls.filter((_, index) => index !== photoIndex),
                                              }
                                            : draft,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <label className={LABEL}>Bathroom video</label>
                                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                      <input
                                        type="file"
                                        accept="video/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          void onPickBathVideo(e.target.files?.[0] ?? null);
                                          e.target.value = "";
                                        }}
                                      />
                                      {mediaUploadingKeys.has(`bath-video-${bathDraft.id}`)
                                        ? "Uploading..."
                                        : bathDraft.videoDataUrl
                                          ? "Replace video"
                                          : "Upload video"}
                                    </label>
                                    {bathDraft.videoDataUrl ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                        onClick={() => setBathDraft((draft) => (draft ? { ...draft, videoDataUrl: null } : draft))}
                                      >
                                        Remove video
                                      </button>
                                    ) : null}
                                  </div>
                                  {bathDraft.videoDataUrl ? (
                                    <video
                                      src={bathDraft.videoDataUrl}
                                      controls
                                      playsInline
                                      className="mt-3 max-h-64 w-full rounded-lg border border-slate-200 bg-black object-contain"
                                    />
                                  ) : (
                                    <p className="mt-3 text-xs text-slate-400">No bathroom video on this listing yet.</p>
                                  )}
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <label className={LABEL}>Assigned rooms</label>
                                <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={bathDraft.allResidents ?? false}
                                    onChange={(e) => setBathDraft((d) => d ? { ...d, allResidents: e.target.checked } : d)}
                                    className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                                  />
                                  Available to all residents
                                </label>
                                {!bathDraft.allResidents ? (
                                  <div className="space-y-2 rounded-xl border border-sky-100 bg-white/90 p-3">
                                    {(bathDraft.assignedRoomIds.length ? bathDraft.assignedRoomIds : [""]).map((roomId, roomIndex) => (
                                      <div key={`${bathDraft.id}-room-select-${roomIndex}-${roomId || "empty"}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                        <select
                                          value={roomId}
                                          onChange={(e) =>
                                            setBathDraft((d) => {
                                              if (!d) return d;
                                              const previousId = d.assignedRoomIds[roomIndex] ?? "";
                                              const assignedRoomIds = updateSelectedIdAt(d.assignedRoomIds, roomIndex, e.target.value);
                                              const accessKindByRoomId = { ...(d.accessKindByRoomId ?? {}) };
                                              if (previousId && previousId !== e.target.value) delete accessKindByRoomId[previousId];
                                              if (e.target.value && previousId && previousId !== e.target.value && d.accessKindByRoomId?.[previousId]) {
                                                accessKindByRoomId[e.target.value] = d.accessKindByRoomId[previousId];
                                              }
                                              return { ...d, assignedRoomIds, accessKindByRoomId };
                                            })
                                          }
                                          className={INPUT}
                                        >
                                          <option value="">Select room</option>
                                          {sub.rooms.map((r) => (
                                            <option
                                              key={r.id}
                                              value={r.id}
                                              disabled={r.id !== roomId && bathDraft.assignedRoomIds.includes(r.id)}
                                            >
                                              {r.name || `Room ${sub.rooms.indexOf(r) + 1}`}
                                            </option>
                                          ))}
                                        </select>
                                        <select
                                          value={(roomId && bathDraft.accessKindByRoomId?.[roomId]) ?? ""}
                                          onChange={(e) =>
                                            setBathDraft((d) => {
                                              if (!d || !roomId) return d;
                                              const accessKindByRoomId = { ...(d.accessKindByRoomId ?? {}) };
                                              const value = e.target.value as "" | ManagerBathroomRoomAccessKind;
                                              if (value) accessKindByRoomId[roomId] = value;
                                              else delete accessKindByRoomId[roomId];
                                              return { ...d, accessKindByRoomId };
                                            })
                                          }
                                          className={INPUT}
                                          disabled={!roomId}
                                        >
                                          <option value="">Auto-detect setup</option>
                                          <option value="ensuite">En suite</option>
                                          <option value="shared">Shared</option>
                                          <option value="hall">Hall / common</option>
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setBathDraft((d) => {
                                              if (!d) return d;
                                              const targetId = d.assignedRoomIds[roomIndex];
                                              const assignedRoomIds = d.assignedRoomIds.filter((_, idx2) => idx2 !== roomIndex);
                                              const accessKindByRoomId = { ...(d.accessKindByRoomId ?? {}) };
                                              if (targetId) delete accessKindByRoomId[targetId];
                                              return { ...d, assignedRoomIds, accessKindByRoomId };
                                            })
                                          }
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setBathDraft((d) => (d ? { ...d, assignedRoomIds: [...d.assignedRoomIds, ""] } : d))
                                      }
                                      className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                                    >
                                      + Add room
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <SaveRow onSave={saveBath} onCancel={closeSection} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SHARED SPACES ── */}
      <div className={`${SECTION_WRAP} border-sky-100`}>
        <div className={`${SECTION_HEAD} border-sky-100 bg-sky-50/60`}>
          <div className="flex items-center gap-2">
            <p className={`${SECTION_TITLE} text-sky-700`}>Shared spaces</p>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-600">
              {sub.sharedSpaces.length}
            </span>
          </div>
          <button type="button" onClick={addSpace} className={ADD_BTN}>
            + Add space
          </button>
        </div>
        {sub.sharedSpaces.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No shared spaces added yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sub.sharedSpaces.map((space) => {
              const isEditing = editingSpaceId === space.id && editingSection === "spaces";
              return (
                <Fragment key={space.id}>
                  <div className={`px-4 py-3 ${isEditing ? "bg-sky-50/30" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{space.name || "Unnamed space"}</p>
                          {space.location ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                              {space.location}
                            </span>
                          ) : null}
                        </div>
                        {space.detail?.trim() ? (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{space.detail}</p>
                        ) : null}
                        {space.amenitiesText?.trim() ? (
                          <p className="mt-0.5 text-xs text-slate-400">{space.amenitiesText}</p>
                        ) : null}
                        {space.photoDataUrls.length > 0 ? (
                          <div className="mt-2">
                            <InlinePhotoStrip urls={space.photoDataUrls.slice(0, 3)} emptyLabel="" />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => (isEditing ? closeSection() : startEditSpace(space))}
                          className={isEditing ? EDIT_BTN_ON : EDIT_BTN_OFF}
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                        {!isEditing ? (
                          <button
                            type="button"
                            onClick={() => removeSpace(space.id)}
                            className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {isEditing && spaceDraft ? (
                    <div className="border-t border-sky-100 bg-sky-50/20 px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={LABEL}>Space name</label>
                          <input
                            type="text"
                            value={spaceDraft.name}
                            onChange={(e) => setSpaceDraft((d) => d ? { ...d, name: e.target.value } : d)}
                            className={INPUT}
                            placeholder="e.g. Kitchen & dining"
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Location</label>
                          <div className="space-y-2">
                            <select
                              value={locationSelectValue(spaceDraft.location, locationLevelOptions)}
                              onChange={(e) =>
                                setSpaceDraft((d) => {
                                  if (!d) return d;
                                  const nextValue = e.target.value;
                                  if (!nextValue) return { ...d, location: "" };
                                  if (nextValue === LOCATION_LEVEL_CUSTOM) {
                                    if (locationLevelOptions.includes(d.location.trim())) return { ...d, location: "" };
                                    return d;
                                  }
                                  return { ...d, location: nextValue };
                                })
                              }
                              className={INPUT}
                            >
                              <option value="">Select location</option>
                              {locationLevelOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                              <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                            </select>
                            {locationSelectValue(spaceDraft.location, locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                              <input
                                type="text"
                                value={spaceDraft.location}
                                onChange={(e) => setSpaceDraft((d) => d ? { ...d, location: e.target.value } : d)}
                                className={INPUT}
                                placeholder="Custom location"
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Description / rules</label>
                          <AutoResizeTextarea
                            rows={3}
                            value={spaceDraft.detail}
                            onChange={(e) => setSpaceDraft((d) => d ? { ...d, detail: e.target.value } : d)}
                            className={TEXTAREA}
                            placeholder="Appliances, cleanup expectations, access hours…"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={`${LABEL} mb-2`}>Amenities / equipment</label>
                          <AmenityChipPicker
                            presets={SHARED_SPACE_AMENITY_PRESETS}
                            value={spaceDraft.amenitiesText}
                            onChange={(v) => setSpaceDraft((d) => d ? { ...d, amenitiesText: v } : d)}
                            extraPlaceholder="Ice maker, wine fridge…"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Shared space photos</label>
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    void onPickSpacePhotos(e.target.files);
                                    e.target.value = "";
                                  }}
                                />
                                {mediaUploadingKeys.has(`space-photos-${spaceDraft.id}`) ? "Uploading..." : "Upload photos"}
                              </label>
                            </div>
                            <div className="mt-3">
                              <InlinePhotoStrip
                                urls={spaceDraft.photoDataUrls}
                                emptyLabel="No shared-space photos on this listing yet."
                                onRemove={(photoIndex) =>
                                  setSpaceDraft((draft) =>
                                    draft
                                      ? {
                                          ...draft,
                                          photoDataUrls: draft.photoDataUrls.filter((_, index) => index !== photoIndex),
                                        }
                                      : draft,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Shared space video</label>
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                <input
                                  type="file"
                                  accept="video/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    void onPickSpaceVideo(e.target.files?.[0] ?? null);
                                    e.target.value = "";
                                  }}
                                />
                                {mediaUploadingKeys.has(`space-video-${spaceDraft.id}`)
                                  ? "Uploading..."
                                  : spaceDraft.videoDataUrl
                                    ? "Replace video"
                                    : "Upload video"}
                              </label>
                              {spaceDraft.videoDataUrl ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                  onClick={() => setSpaceDraft((draft) => (draft ? { ...draft, videoDataUrl: null } : draft))}
                                >
                                  Remove video
                                </button>
                              ) : null}
                            </div>
                            {spaceDraft.videoDataUrl ? (
                              <video
                                src={spaceDraft.videoDataUrl}
                                controls
                                playsInline
                                className="mt-3 max-h-64 w-full rounded-lg border border-slate-200 bg-black object-contain"
                              />
                            ) : (
                              <p className="mt-3 text-xs text-slate-400">No shared-space video on this listing yet.</p>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Room access</label>
                          <div className="space-y-2 rounded-xl border border-sky-100 bg-white/90 p-3">
                            {(spaceDraft.roomAccessIds.length ? spaceDraft.roomAccessIds : [""]).map((roomId, roomIndex) => (
                              <div key={`${spaceDraft.id}-access-${roomIndex}-${roomId || "empty"}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <select
                                  value={roomId}
                                  onChange={(e) =>
                                    setSpaceDraft((d) => (d ? { ...d, roomAccessIds: updateSelectedIdAt(d.roomAccessIds, roomIndex, e.target.value) } : d))
                                  }
                                  className={INPUT}
                                >
                                  <option value="">Select room</option>
                                  {sub.rooms.map((r) => (
                                    <option
                                      key={r.id}
                                      value={r.id}
                                      disabled={r.id !== roomId && spaceDraft.roomAccessIds.includes(r.id)}
                                    >
                                      {r.name || `Room ${sub.rooms.indexOf(r) + 1}`}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSpaceDraft((d) => (d ? { ...d, roomAccessIds: d.roomAccessIds.filter((_, idx2) => idx2 !== roomIndex) } : d))
                                  }
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setSpaceDraft((d) => (d ? { ...d, roomAccessIds: [...d.roomAccessIds, ""] } : d))
                              }
                              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                            >
                              + Add room
                            </button>
                          </div>
                        </div>
                      </div>
                      <SaveRow onSave={saveSpace} onCancel={closeSection} />
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── LEASE & PRICING ── */}
      <div className={`${SECTION_WRAP} border-sky-100`}>
        <SectionHeader
          title="Lease & pricing"
          color="sky"
          isEditing={editingSection === "lease"}
          onEdit={() => (editingSection === "lease" ? setEditingSection(null) : startEditLease())}
        />
        {editingSection === "lease" ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={LABEL}>Application fee</label>
                <input
                  type="text"
                  value={leaseDraft.applicationFee ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, applicationFee: e.target.value }))}
                  className={INPUT}
                  placeholder="$50"
                />
              </div>
              <div>
                <label className={LABEL}>Security deposit</label>
                <input
                  type="text"
                  value={leaseDraft.securityDeposit ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, securityDeposit: e.target.value }))}
                  className={INPUT}
                  placeholder="$1,200"
                />
              </div>
              <div>
                <label className={LABEL}>Move-in fee</label>
                <input
                  type="text"
                  value={leaseDraft.moveInFee ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, moveInFee: e.target.value }))}
                  className={INPUT}
                  placeholder="$200"
                />
              </div>
              <div>
                <label className={LABEL}>Parking (monthly)</label>
                <input
                  type="text"
                  value={leaseDraft.parkingMonthly ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, parkingMonthly: e.target.value }))}
                  className={INPUT}
                  placeholder="$100"
                />
              </div>
              <div>
                <label className={LABEL}>HOA (monthly)</label>
                <input
                  type="text"
                  value={leaseDraft.hoaMonthly ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, hoaMonthly: e.target.value }))}
                  className={INPUT}
                  placeholder="$50"
                />
              </div>
              <div>
                <label className={LABEL}>Other monthly fees</label>
                <input
                  type="text"
                  value={leaseDraft.otherMonthlyFees ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, otherMonthlyFees: e.target.value }))}
                  className={INPUT}
                  placeholder="$25"
                />
              </div>
              <div>
                <label className={LABEL}>Month-to-month surcharge</label>
                <input
                  type="text"
                  value={leaseDraft.monthToMonthSurcharge ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, monthToMonthSurcharge: e.target.value }))}
                  className={INPUT}
                  placeholder="$50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>House costs detail</label>
                <AutoResizeTextarea
                  rows={2}
                  value={leaseDraft.houseCostsDetail ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, houseCostsDetail: e.target.value }))}
                  className={TEXTAREA}
                  placeholder="Utilities included, split equally among residents…"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={LABEL}>Lease terms</label>
                <AutoResizeTextarea
                  rows={4}
                  value={leaseDraft.leaseTermsBody ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, leaseTermsBody: e.target.value }))}
                  className={TEXTAREA}
                  placeholder="Minimum lease length, renewal options, notice period…"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={LABEL}>Payment at signing (included)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PAYMENT_AT_SIGNING_OPTIONS.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={(leaseDraft.paymentAtSigningIncludes ?? []).includes(o.id)}
                        onChange={(e) => {
                          setLeaseDraft((d) => {
                            const cur = d.paymentAtSigningIncludes ?? [];
                            const next = e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id);
                            return { ...d, paymentAtSigningIncludes: next };
                          });
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-sky-600"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className={`${LABEL} mb-2`}>Payment methods</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={leaseDraft.zellePaymentsEnabled ?? false}
                      onChange={(e) => setLeaseDraft((d) => ({ ...d, zellePaymentsEnabled: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                    />
                    Zelle payments
                  </label>
                  {leaseDraft.zellePaymentsEnabled ? (
                    <input
                      type="text"
                      value={leaseDraft.zelleContact ?? ""}
                      onChange={(e) => setLeaseDraft((d) => ({ ...d, zelleContact: e.target.value }))}
                      className={INPUT}
                      placeholder="Zelle phone or email"
                    />
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={leaseDraft.venmoPaymentsEnabled ?? false}
                      onChange={(e) => setLeaseDraft((d) => ({ ...d, venmoPaymentsEnabled: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                    />
                    Venmo payments
                  </label>
                  {leaseDraft.venmoPaymentsEnabled ? (
                    <input
                      type="text"
                      value={leaseDraft.venmoContact ?? ""}
                      onChange={(e) => setLeaseDraft((d) => ({ ...d, venmoContact: e.target.value }))}
                      className={INPUT}
                      placeholder="Venmo username"
                    />
                  ) : null}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={leaseDraft.shortTermRentalsAllowed ?? false}
                    onChange={(e) => setLeaseDraft((d) => ({ ...d, shortTermRentalsAllowed: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                  />
                  Short-term rentals allowed
                </label>
                {leaseDraft.shortTermRentalsAllowed ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Daily cost</label>
                      <input
                        type="text"
                        value={leaseDraft.shortTermDailyCost ?? ""}
                        onChange={(e) => setLeaseDraft((d) => ({ ...d, shortTermDailyCost: e.target.value }))}
                        className={INPUT}
                        placeholder="$85/day"
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Short-term deposit</label>
                      <input
                        type="text"
                        value={leaseDraft.shortTermDeposit ?? ""}
                        onChange={(e) => setLeaseDraft((d) => ({ ...d, shortTermDeposit: e.target.value }))}
                        className={INPUT}
                        placeholder="$500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Short-term requirements</label>
                      <AutoResizeTextarea
                        rows={2}
                        value={leaseDraft.shortTermRequirements ?? ""}
                        onChange={(e) => setLeaseDraft((d) => ({ ...d, shortTermRequirements: e.target.value }))}
                        className={TEXTAREA}
                        placeholder="Minimum 7 nights, ID required…"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <SaveRow onSave={saveLease} onCancel={() => setEditingSection(null)} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[
              { key: "App fee", val: sub.applicationFee || "—" },
              { key: "Security deposit", val: sub.securityDeposit || "—" },
              { key: "Move-in fee", val: sub.moveInFee || "—" },
              { key: "Parking", val: sub.parkingMonthly || "—" },
              { key: "HOA", val: sub.hoaMonthly || "—" },
              { key: "Other fees", val: sub.otherMonthlyFees || "—" },
              { key: "M-to-M surcharge", val: sub.monthToMonthSurcharge || "—" },
              { key: "House costs", val: sub.houseCostsDetail || "—" },
              {
                key: "At signing",
                val:
                  sub.paymentAtSigningIncludes
                    .map((id) => PAYMENT_AT_SIGNING_OPTIONS.find((o) => o.id === id)?.label)
                    .filter(Boolean)
                    .join(", ") || "—",
              },
              { key: "Lease terms", val: sub.leaseTermsBody || "—" },
              {
                key: "Payments",
                val: [sub.zellePaymentsEnabled && `Zelle (${sub.zelleContact || "no contact"})`, sub.venmoPaymentsEnabled && `Venmo (${sub.venmoContact || "no contact"})`]
                  .filter(Boolean)
                  .join(", ") || "—",
              },
              sub.shortTermRentalsAllowed
                ? {
                    key: "Short-term",
                    val: [sub.shortTermDailyCost, sub.shortTermDeposit].filter(Boolean).join(" · ") || "Enabled",
                  }
                : null,
            ]
              .filter((x): x is { key: string; val: string } => x !== null)
              .map(({ key, val }) => (
                <div key={key} className={KV_ROW}>
                  <span className={KV_KEY}>{key}</span>
                  <span className={KV_VAL}>{val}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── AMENITIES & QUICK FACTS ── */}
      <div className={`${SECTION_WRAP} border-emerald-100`}>
        <SectionHeader
          title="Amenities & quick facts"
          color="emerald"
          isEditing={editingSection === "amenities"}
          onEdit={() => (editingSection === "amenities" ? setEditingSection(null) : startEditAmenities())}
        />
        {editingSection === "amenities" ? (
          <div className="p-4">
            <div className="grid gap-4">
              <div>
                <label className={`${LABEL} mb-2`}>Building / house amenities</label>
                <AmenityChipPicker
                  presets={HOUSE_WIDE_AMENITY_PRESETS}
                  value={amenitiesDraft}
                  onChange={setAmenitiesDraft}
                  extraPlaceholder="Rooftop access, sauna…"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className={LABEL}>Quick facts (sidebar on listing)</label>
                  <button
                    type="button"
                    onClick={() => setQfDraft((d) => [...d, emptyQuickFactRow()])}
                    className={ADD_BTN}
                  >
                    + Add fact
                  </button>
                </div>
                {qfDraft.length === 0 ? (
                  <p className="text-xs text-slate-400">No custom quick facts — listing auto-derives defaults.</p>
                ) : (
                  <div className="space-y-2">
                    {qfDraft.map((qf, qi) => (
                      <div key={qf.id} className="flex gap-2">
                        <input
                          type="text"
                          value={qf.label}
                          onChange={(e) =>
                            setQfDraft((d) => d.map((q, i) => (i === qi ? { ...q, label: e.target.value } : q)))
                          }
                          className={INPUT}
                          placeholder="Label"
                        />
                        <input
                          type="text"
                          value={qf.value}
                          onChange={(e) =>
                            setQfDraft((d) => d.map((q, i) => (i === qi ? { ...q, value: e.target.value } : q)))
                          }
                          className={INPUT}
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          onClick={() => setQfDraft((d) => d.filter((_, i) => i !== qi))}
                          className="shrink-0 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <SaveRow onSave={saveAmenities} onCancel={() => setEditingSection(null)} />
          </div>
        ) : (
          <div className="px-4 py-3 space-y-3">
            {sub.amenitiesText?.trim() ? (
              <div>
                <p className={`${LABEL} mb-1`}>Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {sub.amenitiesText
                    .split(/[\n,]+/)
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .map((a) => (
                      <span key={a} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700">
                        {a}
                      </span>
                    ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No amenities listed yet.</p>
            )}
            {sub.quickFacts.length > 0 ? (
              <div>
                <p className={`${LABEL} mb-1`}>Quick facts</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  {sub.quickFacts.map((qf) => (
                    <div key={qf.id} className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-400">{qf.label}:</span>
                      <span className="text-xs text-slate-700">{qf.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── HOUSE DETAILS (PORTAL NOTE) ── */}
      {noteKey ? (
        <div className={`${SECTION_WRAP} border-emerald-100`}>
          <div className={`${SECTION_HEAD} border-emerald-100 bg-emerald-50/60`}>
            <div className="flex items-center gap-2">
              <p className={`${SECTION_TITLE} text-emerald-700`}>House details</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Portal only</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (houseEditing) {
                  setHouseEditing(false);
                } else {
                  setHouseDraft({
                    houseDescription: portalNote.houseDescription ?? "",
                    houseRulesText: portalNote.houseRulesText ?? "",
                    generalHouseInfo: sub.generalHouseInfo ?? "",
                  });
                  setHouseEditing(true);
                }
              }}
              className={houseEditing ? EDIT_BTN_ON : EDIT_BTN_OFF}
            >
              {houseEditing ? "Cancel" : "Edit"}
            </button>
          </div>
          {houseEditing ? (
            <div className="p-4">
              <div className="grid gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <label className={LABEL}>House description</label>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">Manager only</span>
                  </div>
                  <AutoResizeTextarea
                    rows={4}
                    value={houseDraft.houseDescription ?? ""}
                    onChange={(e) => setHouseDraft((d) => ({ ...d, houseDescription: e.target.value }))}
                    className={TEXTAREA}
                    placeholder="Internal notes about the house…"
                  />
                </div>
                <div>
                  <label className={LABEL}>House rules</label>
                  <AutoResizeTextarea
                    rows={3}
                    value={houseDraft.houseRulesText ?? ""}
                    onChange={(e) => setHouseDraft((d) => ({ ...d, houseRulesText: e.target.value }))}
                    className={TEXTAREA}
                    placeholder="Quiet hours, guests, smoking, pets…"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <label className={LABEL}>General house info</label>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">Residents only</span>
                  </div>
                  <AutoResizeTextarea
                    rows={4}
                    value={houseDraft.generalHouseInfo ?? ""}
                    onChange={(e) => setHouseDraft((d) => ({ ...d, generalHouseInfo: e.target.value }))}
                    className={TEXTAREA}
                    placeholder="Wi-Fi network & password, gate/door codes, laundry tips, trash schedule…"
                  />
                </div>
              </div>
              <SaveRow onSave={saveHouseDetails} onCancel={() => setHouseEditing(false)} />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {[
                { label: "Description", value: portalNote.houseDescription, badge: "Manager only" },
                { label: "Rules", value: portalNote.houseRulesText, badge: null },
                { label: "General info", value: sub.generalHouseInfo, badge: "Residents only" },
              ]
                .filter(({ value }) => value?.trim())
                .map(({ label, value, badge }) => (
                  <div key={label} className="flex gap-4 px-4 py-3">
                    <div className="w-24 shrink-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                      {badge ? (
                        <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">{badge}</span>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{value}</p>
                  </div>
                ))}
              {!portalNote.houseDescription?.trim() && !portalNote.houseRulesText?.trim() && !sub.generalHouseInfo?.trim() ? (
                <p className="px-4 py-3 text-sm text-slate-400">No house details yet — click Edit to add.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* ── SERVICES ── */}
      <div className={`${SECTION_WRAP} border-slate-200`}>
        <SectionHeader
          title="Services offered"
          color="slate"
          isEditing={false}
          editLabel="+ Add"
          onEdit={() => {
            setEditingOffer(null);
            setServiceForm({ name: "", description: "", price: "", deposit: "", restrictToResidents: false, selectedEmails: [] });
            setServiceModalOpen(true);
          }}
        />
        <div className="p-4">
          {serviceOffers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {serviceOffers.map((offer) => (
                <div key={offer.id} className={`flex flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.05)] ${offer.available ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{offer.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${offer.available ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80" : "bg-slate-100 text-slate-500 ring-slate-200/80"}`}>
                      {offer.available ? "Active" : "Paused"}
                    </span>
                  </div>
                  {offer.price ? <span className="mt-1 text-xs font-medium text-slate-500">{offer.price}</span> : null}
                  {offer.description ? <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{offer.description}</p> : null}
                  {offer.residentEmails?.length ? (
                    <p className="mt-1.5 text-[10px] text-slate-400">Visible to {offer.residentEmails.length} resident{offer.residentEmails.length === 1 ? "" : "s"} only</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => {
                      setEditingOffer(offer);
                      setServiceForm({
                        name: offer.name, description: offer.description, price: offer.price, deposit: offer.deposit ?? "",
                        restrictToResidents: Boolean(offer.residentEmails?.length),
                        selectedEmails: offer.residentEmails ?? [],
                      });
                      setServiceModalOpen(true);
                    }} className={EDIT_BTN_OFF}>Edit</button>
                    <button type="button" onClick={() => { if (userId) { toggleAmenityOfferAvailability(offer.id, userId); reloadOffers(); } }} className={EDIT_BTN_OFF}>
                      {offer.available ? "Pause" : "Resume"}
                    </button>
                    <button type="button" onClick={() => { if (userId) { deleteAmenityOffer(offer.id, userId); reloadOffers(); } }} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">No services yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">Add optional paid or free services residents can request — like weekly cleaning, linen sets, or storage.</p>
              <button type="button" onClick={() => { setEditingOffer(null); setServiceForm({ name: "", description: "", price: "", deposit: "", restrictToResidents: false, selectedEmails: [] }); setServiceModalOpen(true); }} className={`mt-4 ${ADD_BTN}`}>+ Add service</button>
            </div>
          )}
        </div>
      </div>
    </div>

    <Modal
      open={serviceModalOpen}
      title={editingOffer ? "Edit service" : "Add service"}
      onClose={() => setServiceModalOpen(false)}
      panelClassName="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
    >
      <div className="grid gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-600">Service name *</p>
          <input value={serviceForm.name} onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly cleaning, Linen set" className={INPUT} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Price</p>
            <input value={serviceForm.price} onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. $25, Free" className={INPUT} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Deposit (optional)</p>
            <input value={serviceForm.deposit} onChange={(e) => setServiceForm((f) => ({ ...f, deposit: e.target.value }))} placeholder="e.g. $50" className={INPUT} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-600">Description</p>
          <textarea rows={3} value={serviceForm.description} onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))} placeholder="What's included, how it works…" className={TEXTAREA} />
        </div>
        {propertyResidents.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={serviceForm.restrictToResidents}
                onChange={(e) => setServiceForm((f) => ({ ...f, restrictToResidents: e.target.checked, selectedEmails: e.target.checked ? f.selectedEmails : [] }))}
              />
              Restrict to specific residents
            </label>
            {serviceForm.restrictToResidents ? (
              <div className="mt-2 space-y-1.5 pl-6">
                {propertyResidents.map((r) => {
                  const email = r.email!.trim().toLowerCase();
                  return (
                    <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={serviceForm.selectedEmails.includes(email)}
                        onChange={(e) => setServiceForm((f) => ({
                          ...f,
                          selectedEmails: e.target.checked
                            ? [...f.selectedEmails, email]
                            : f.selectedEmails.filter((x) => x !== email),
                        }))}
                      />
                      {r.name || email}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className={CANCEL_BTN} onClick={() => setServiceModalOpen(false)}>Cancel</button>
        <button type="button" className={SAVE_BTN} onClick={handleSaveService} disabled={!serviceForm.name.trim()}>
          {editingOffer ? "Save changes" : "Add service"}
        </button>
      </div>
    </Modal>
    </>
  );
}

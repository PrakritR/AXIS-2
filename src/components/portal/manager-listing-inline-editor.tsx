"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type {
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
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
  LISTING_ROOM_FLOOR_LEVEL_OPTIONS,
  LISTING_STORIES_OPTIONS,
  LISTING_TOTAL_BATH_OPTIONS,
} from "@/data/manager-listing-presets";
import type { PortalListingNote } from "@/lib/portal-listing-notes";
import { getPortalListingNote, savePortalListingNote, savePortalRoomNote } from "@/lib/portal-listing-notes";

// ─── shared style constants ──────────────────────────────────────────────────

const TH = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400";
const TD = "px-3 py-2.5 text-sm text-slate-700";
const LABEL = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";
const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200";
const TEXTAREA = `${INPUT} resize-y`;
const SAVE_BTN =
  "rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60";
const CANCEL_BTN =
  "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";
const SECTION_WRAP = "mt-4 overflow-hidden rounded-2xl border bg-white";
const SECTION_HEAD = "flex items-center justify-between gap-2 border-b px-4 py-2.5";
const SECTION_TITLE = "text-xs font-bold uppercase tracking-[0.14em]";
const EDIT_BTN_OFF =
  "rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50";
const EDIT_BTN_ON =
  "rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100";
const ADD_BTN =
  "rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600";
const KV_ROW = "flex gap-4 border-b border-slate-100 px-4 py-2.5 last:border-0";
const KV_KEY = "w-36 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400";
const KV_VAL = "text-sm text-slate-700 whitespace-pre-wrap";

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

function rid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

// ─── main component ───────────────────────────────────────────────────────────

export function ManagerListingInlineEditor({
  sub,
  noteKey,
  onSaveSub,
  showToast,
  isListed,
}: {
  sub: ManagerListingSubmissionV1;
  noteKey: string | null;
  onSaveSub: (updated: ManagerListingSubmissionV1) => void;
  showToast: (msg: string) => void;
  isListed?: boolean;
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
  const [leaseDraft, setLeaseDraft] = useState<Partial<ManagerListingSubmissionV1>>({});
  const [amenitiesDraft, setAmenitiesDraft] = useState("");
  const [qfDraft, setQfDraft] = useState<ManagerQuickFactRow[]>([]);

  // ── portal notes state (house details) ────────────────────────────────────
  const [notesTick, setNotesTick] = useState(0);
  const portalNote = useMemo(
    () => (noteKey ? getPortalListingNote(noteKey) : ({} as PortalListingNote)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteKey, notesTick],
  );
  const [houseEditing, setHouseEditing] = useState(false);
  const [houseDraft, setHouseDraft] = useState<PortalListingNote>({});

  // ── helpers ───────────────────────────────────────────────────────────────
  const saveSub = useCallback(
    (updated: ManagerListingSubmissionV1, msg: string) => {
      onSaveSub(updated);
      showToast(isListed ? `${msg} (sent for re-approval)` : msg);
    },
    [onSaveSub, showToast, isListed],
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
    // Also save move-in instructions to portal note for highest-priority override
    if (noteKey && roomDraft.moveInInstructions?.trim()) {
      savePortalRoomNote(noteKey, roomDraft.id, { moveInInstructions: roomDraft.moveInInstructions });
      setNotesTick((t) => t + 1);
    }
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
    const updatedBaths = sub.bathrooms.map((b) => (b.id === bathDraft.id ? bathDraft : b));
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
    const updatedSpaces = sub.sharedSpaces.map((s) => (s.id === spaceDraft.id ? spaceDraft : s));
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
    savePortalListingNote(noteKey, houseDraft);
    showToast("House details saved.");
    setHouseEditing(false);
    setNotesTick((t) => t + 1);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
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
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
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
            <textarea
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

      {/* ── ROOMS ── */}
      <div className={`${SECTION_WRAP} border-indigo-100`}>
        <div className={`${SECTION_HEAD} border-indigo-100 bg-indigo-50/60`}>
          <div className="flex items-center gap-2">
            <p className={`${SECTION_TITLE} text-indigo-700`}>Rooms</p>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
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
                  <th className={TH}>Move-in date</th>
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
                      <tr className={`border-b border-slate-100 ${isEditing ? "bg-indigo-50/40" : rowBg}`}>
                        <td className={TD}>
                          <span className="text-xs font-semibold text-slate-400">{idx + 1}</span>
                        </td>
                        <td className={TD}>
                          <p className="font-semibold text-slate-900">{room.name || `Room ${idx + 1}`}</p>
                          {room.detail?.trim() ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{room.detail}</p>
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
                        <td className={TD}>{room.moveInAvailableDate || "—"}</td>
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
                        <tr className="border-b border-indigo-100">
                          <td colSpan={8} className="bg-indigo-50/20 px-4 py-4">
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
                                <label className={LABEL}>Move-in available date</label>
                                <input
                                  type="date"
                                  value={roomDraft.moveInAvailableDate}
                                  onChange={(e) =>
                                    setRoomDraft((d) => d ? { ...d, moveInAvailableDate: e.target.value } : d)
                                  }
                                  className={INPUT}
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
                              <div>
                                <label className={LABEL}>Furnishing</label>
                                <input
                                  type="text"
                                  value={roomDraft.furnishing}
                                  onChange={(e) => setRoomDraft((d) => d ? { ...d, furnishing: e.target.value } : d)}
                                  className={INPUT}
                                  placeholder="Bed, desk, chair"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-2">
                                <label className={LABEL}>Room amenities (one per line)</label>
                                <textarea
                                  rows={2}
                                  value={roomDraft.roomAmenitiesText}
                                  onChange={(e) =>
                                    setRoomDraft((d) => d ? { ...d, roomAmenitiesText: e.target.value } : d)
                                  }
                                  className={TEXTAREA}
                                  placeholder="Private balcony&#10;Walk-in closet"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className={LABEL}>Room description</label>
                                <textarea
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
                                  <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 normal-case tracking-normal">
                                    Shown to resident
                                  </span>
                                </label>
                                <textarea
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
      <div className={`${SECTION_WRAP} border-violet-100`}>
        <div className={`${SECTION_HEAD} border-violet-100 bg-violet-50/60`}>
          <div className="flex items-center gap-2">
            <p className={`${SECTION_TITLE} text-violet-700`}>Bathrooms</p>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
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
                        className={`border-b border-slate-100 ${isEditing ? "bg-violet-50/40" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                      >
                        <td className={TD}>
                          <p className="font-semibold text-slate-900">{bath.name || `Bathroom ${idx + 1}`}</p>
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
                        <tr className="border-b border-violet-100">
                          <td colSpan={5} className="bg-violet-50/20 px-4 py-4">
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
                                <input
                                  type="text"
                                  value={bathDraft.location}
                                  onChange={(e) => setBathDraft((d) => d ? { ...d, location: e.target.value } : d)}
                                  className={INPUT}
                                  placeholder="e.g. 2nd floor hallway"
                                />
                              </div>
                              <div>
                                <label className={LABEL}>Amenities / finishes</label>
                                <textarea
                                  rows={2}
                                  value={bathDraft.amenitiesText}
                                  onChange={(e) => setBathDraft((d) => d ? { ...d, amenitiesText: e.target.value } : d)}
                                  className={TEXTAREA}
                                  placeholder="Double vanity, heated floor…"
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
                                      className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                                    />
                                    {f}
                                  </label>
                                ))}
                              </div>
                              <div className="sm:col-span-2">
                                <label className={LABEL}>Assigned rooms</label>
                                <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={bathDraft.allResidents ?? false}
                                    onChange={(e) => setBathDraft((d) => d ? { ...d, allResidents: e.target.checked } : d)}
                                    className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                                  />
                                  Available to all residents
                                </label>
                                {!bathDraft.allResidents ? (
                                  <div className="flex flex-wrap gap-2">
                                    {sub.rooms.map((r) => (
                                      <label key={r.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                        <input
                                          type="checkbox"
                                          checked={bathDraft.assignedRoomIds.includes(r.id)}
                                          onChange={(e) => {
                                            setBathDraft((d) => {
                                              if (!d) return d;
                                              const ids = e.target.checked
                                                ? [...d.assignedRoomIds, r.id]
                                                : d.assignedRoomIds.filter((x) => x !== r.id);
                                              return { ...d, assignedRoomIds: ids };
                                            });
                                          }}
                                          className="h-3.5 w-3.5 rounded border-slate-300 accent-violet-600"
                                        />
                                        {r.name || `Room ${sub.rooms.indexOf(r) + 1}`}
                                      </label>
                                    ))}
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
                          <input
                            type="text"
                            value={spaceDraft.location}
                            onChange={(e) => setSpaceDraft((d) => d ? { ...d, location: e.target.value } : d)}
                            className={INPUT}
                            placeholder="e.g. Main floor"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Description / rules</label>
                          <textarea
                            rows={3}
                            value={spaceDraft.detail}
                            onChange={(e) => setSpaceDraft((d) => d ? { ...d, detail: e.target.value } : d)}
                            className={TEXTAREA}
                            placeholder="Appliances, cleanup expectations, access hours…"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Amenities / equipment</label>
                          <textarea
                            rows={2}
                            value={spaceDraft.amenitiesText}
                            onChange={(e) => setSpaceDraft((d) => d ? { ...d, amenitiesText: e.target.value } : d)}
                            className={TEXTAREA}
                            placeholder="Washer, dryer, dishwasher…"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Room access</label>
                          <div className="flex flex-wrap gap-2">
                            {sub.rooms.map((r) => (
                              <label key={r.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={spaceDraft.roomAccessIds.includes(r.id)}
                                  onChange={(e) => {
                                    setSpaceDraft((d) => {
                                      if (!d) return d;
                                      const ids = e.target.checked
                                        ? [...d.roomAccessIds, r.id]
                                        : d.roomAccessIds.filter((x) => x !== r.id);
                                      return { ...d, roomAccessIds: ids };
                                    });
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-300 accent-sky-600"
                                />
                                {r.name || `Room ${sub.rooms.indexOf(r) + 1}`}
                              </label>
                            ))}
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
      <div className={`${SECTION_WRAP} border-amber-100`}>
        <SectionHeader
          title="Lease & pricing"
          color="amber"
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
                <textarea
                  rows={2}
                  value={leaseDraft.houseCostsDetail ?? ""}
                  onChange={(e) => setLeaseDraft((d) => ({ ...d, houseCostsDetail: e.target.value }))}
                  className={TEXTAREA}
                  placeholder="Utilities included, split equally among residents…"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={LABEL}>Lease terms</label>
                <textarea
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
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-amber-600"
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
                      className="h-4 w-4 rounded border-slate-300 accent-amber-600"
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
                      className="h-4 w-4 rounded border-slate-300 accent-amber-600"
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
                    className="h-4 w-4 rounded border-slate-300 accent-amber-600"
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
                      <textarea
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
                <label className={LABEL}>Building / house amenities (one per line)</label>
                <textarea
                  rows={5}
                  value={amenitiesDraft}
                  onChange={(e) => setAmenitiesDraft(e.target.value)}
                  className={TEXTAREA}
                  placeholder="High-speed WiFi&#10;In-unit laundry&#10;Backyard&#10;Garage parking"
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
                  <textarea
                    rows={4}
                    value={houseDraft.houseDescription ?? ""}
                    onChange={(e) => setHouseDraft((d) => ({ ...d, houseDescription: e.target.value }))}
                    className={TEXTAREA}
                    placeholder="Internal notes about the house…"
                  />
                </div>
                <div>
                  <label className={LABEL}>House rules</label>
                  <textarea
                    rows={3}
                    value={houseDraft.houseRulesText ?? ""}
                    onChange={(e) => setHouseDraft((d) => ({ ...d, houseRulesText: e.target.value }))}
                    className={TEXTAREA}
                    placeholder="Quiet hours, guests, smoking, pets…"
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
              {!portalNote.houseDescription?.trim() && !portalNote.houseRulesText?.trim() ? (
                <p className="px-4 py-3 text-sm text-slate-400">No house details yet — click Edit to add.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

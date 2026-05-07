"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import type { MockProperty } from "@/data/types";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  adminKpiCounts,
  deleteManagerLiveListing,
  deleteUnlistedManagerProperty,
  listAdminRow,
  publicListingHrefForPropertyRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  removeRejectedProperty,
  restoreRejectedToPending,
  returnRequestChangeToPending,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import {
  PROPERTY_PIPELINE_EVENT,
  countManagerManagedPropertiesForUser,
  deletePendingSubmissionForManager,
  mirrorLocalPropertyPipelineToServer,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import {
  legacyAdminFieldsToSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";

// ---------- Portal-only notes store ----------
// Completely decoupled from the listing submission / approval flow.
// Keyed by "<managerUserId>:<listingId|pendingId>" → per-listing note blob.
const PORTAL_NOTES_KEY = "axis_portal_notes_v1";
type PortalRoomNote = {
  name?: string;
  detail?: string;
  amenitiesText?: string;
  furnishing?: string;
  availability?: string;
  utilitiesEstimate?: string;
  moveInAvailableDate?: string;
  moveInInstructions?: string;
  monthlyRent?: number;
};
type PortalListingNote = {
  tagline?: string;
  houseOverview?: string;
  amenitiesText?: string;
  houseRulesText?: string;
  rooms?: Record<string, PortalRoomNote>;
};
type PortalNotesStore = Record<string, PortalListingNote>;
function readPortalNotesStore(): PortalNotesStore {
  try { return JSON.parse(localStorage.getItem(PORTAL_NOTES_KEY) ?? "{}") as PortalNotesStore; } catch { return {}; }
}
function getPortalListingNote(noteKey: string): PortalListingNote {
  return readPortalNotesStore()[noteKey] ?? {};
}
function savePortalListingNote(noteKey: string, patch: Partial<PortalListingNote>): void {
  const store = readPortalNotesStore();
  store[noteKey] = { ...(store[noteKey] ?? {}), ...patch };
  localStorage.setItem(PORTAL_NOTES_KEY, JSON.stringify(store));
}
function savePortalRoomNote(noteKey: string, roomId: string, patch: PortalRoomNote): void {
  const store = readPortalNotesStore();
  const listing = store[noteKey] ?? {};
  listing.rooms = { ...(listing.rooms ?? {}), [roomId]: { ...(listing.rooms?.[roomId] ?? {}), ...patch } };
  store[noteKey] = listing;
  localStorage.setItem(PORTAL_NOTES_KEY, JSON.stringify(store));
}

function submissionForPendingEdit(row: ManagerPendingPropertyRow): ManagerListingSubmissionV1 {
  const raw = row.submission ? row.submission : legacyAdminFieldsToSubmission(row);
  return normalizeManagerListingSubmissionV1(raw);
}

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = Number.parseFloat(String(p.rentLabel).replace(/[^\d.]/g, "")) || 0;
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: p.buildingName,
      address: p.address,
      zip: p.zip,
      neighborhood: p.neighborhood,
      unitLabel: p.unitLabel,
      beds: p.beds,
      baths: p.baths,
      monthlyRent: rentNum,
      petFriendly: p.petFriendly,
      tagline: p.tagline,
    }),
  );
}

/** Lets the browser paint after click before heavy localStorage writes (better INP on delete/unlist). */
function deferCatalogMutation(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

const MANAGER_STAGES = [
  { key: "pending", label: "Pending review", buckets: [0, 1] as AdminPropertyBucketIndex[] },
  { key: "listed", label: "Listed", buckets: [2] as AdminPropertyBucketIndex[] },
  { key: "unlisted", label: "Unlisted", buckets: [3] as AdminPropertyBucketIndex[] },
  { key: "rejected", label: "Rejected", buckets: [4] as AdminPropertyBucketIndex[] },
] as const;

type ManagerStageKey = (typeof MANAGER_STAGES)[number]["key"];

const EMPTY_COPY: Record<ManagerStageKey, string> = {
  pending: "Nothing awaiting review.",
  listed: "No listed properties.",
  unlisted: "No unlisted properties.",
  rejected: "No rejected properties.",
};

const BANNER_COPY: Record<ManagerStageKey, string> = {
  pending: "New submissions and listings that need updates appear here until prakritramachandran@gmail.com clears them to go live.",
  listed: "Live on Rent with Axis — published listings you can unlist or remove.",
  unlisted: "These listings are off the public site. You can relist or delete them from your queue.",
  rejected: "Rejected submissions stay here until you restore them to pending or delete them permanently.",
};

function managerStageFromParam(raw: string | null): ManagerStageKey {
  return MANAGER_STAGES.some((stage) => stage.key === raw) ? (raw as ManagerStageKey) : "pending";
}

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "amber" | "slate" | "rose";
}) {
  const styles = {
    green: "border-emerald-200/90 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200/90 bg-amber-50 text-amber-950",
    slate: "border-slate-200/90 bg-slate-50 text-slate-700",
    rose: "border-rose-200/90 bg-rose-50 text-rose-900",
  } as const;
  const dot = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
    rose: "bg-rose-500",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[variant]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Deduplicate and humanise furnishing string (e.g. "Bed, desk, and chair, Chair" → "Bed, desk & Chair"). */
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

/** Normalise utilities to "$175" — strip /month, /mo suffixes and ensure $ prefix. */
function normUtility(raw: string): string {
  const t = raw.trim().replace(/\/mo(nth)?\.?$/i, "").trim();
  if (!t) return "—";
  const num = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num) && num > 0) return `$${num}`;
  return t;
}

function rowStatus(bucket: AdminPropertyBucketIndex): { label: string; variant: "green" | "amber" | "slate" | "rose" } {
  switch (bucket) {
    case 0:
      return { label: "Pending review", variant: "amber" };
    case 1:
      return { label: "Approved · edits requested", variant: "amber" };
    case 2:
      return { label: "Listed", variant: "green" };
    case 3:
      return { label: "Unlisted", variant: "slate" };
    default:
      return { label: "Rejected", variant: "rose" };
  }
}

function ManagerPropertyInlineDetails({
  bucket,
  row,
  onUpdated,
  showToast,
  managerUserId,
}: {
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
}) {
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
  const listingId = row?.listingId;
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState<PortalRoomNote>({});
  const [savingRoom, setSavingRoom] = useState(false);
  const [houseEditing, setHouseEditing] = useState(false);
  const [houseDraft, setHouseDraft] = useState<PortalListingNote>({});
  const [savingHouse, setSavingHouse] = useState(false);
  const [notesTick, setNotesTick] = useState(0);

  const portalSub = useMemo<{ sub: ManagerListingSubmissionV1; saveMode: "pending" | "listing"; saveId: string } | null>(() => {
    if (!managerUserId || !row) return null;
    if (bucket === 0) {
      if (row.adminRefId.startsWith("mgr-")) {
        const p = readExtraListingsForUser(managerUserId).find((x) => x.id === row.adminRefId);
        return p ? { sub: submissionForListedEdit(p), saveMode: "listing", saveId: row.adminRefId } : null;
      }
      const p = readPendingManagerPropertiesForUser(managerUserId).find((r) => r.id === row.adminRefId);
      return p ? { sub: submissionForPendingEdit(p), saveMode: "pending", saveId: row.adminRefId } : null;
    }
    if (bucket === 2 && row.listingId) {
      const p = readExtraListingsForUser(managerUserId).find((x) => x.id === row.listingId);
      return p ? { sub: submissionForListedEdit(p), saveMode: "listing", saveId: row.listingId } : null;
    }
    return null;
  }, [managerUserId, row, bucket]);

  const baseRooms = portalSub?.sub.rooms ?? [];

  // noteKey is stable per listing — used as the portal notes store key.
  const noteKey = useMemo(
    () => (managerUserId && portalSub ? `${managerUserId}:${portalSub.saveId}` : null),
    [managerUserId, portalSub],
  );
  const portalNote = useMemo(
    () => (noteKey ? getPortalListingNote(noteKey) : ({} as PortalListingNote)),
    // notesTick triggers a re-read after each save
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteKey, notesTick],
  );

  // Merge portal room notes (description, amenities, etc.) on top of submission rooms for display.
  const rooms = useMemo(() => {
    const roomNotes = portalNote.rooms ?? {};
    return baseRooms.map((r) => {
      const note = roomNotes[r.id];
      if (!note) return r;
      const patch: Partial<ManagerRoomSubmission> = {};
      if (note.name !== undefined) patch.name = note.name;
      if (note.detail !== undefined) patch.detail = note.detail;
      if (note.amenitiesText !== undefined) patch.roomAmenitiesText = note.amenitiesText;
      if (note.furnishing !== undefined) patch.furnishing = note.furnishing;
      if (note.availability !== undefined) patch.availability = note.availability;
      if (note.utilitiesEstimate !== undefined) patch.utilitiesEstimate = note.utilitiesEstimate;
      if (note.moveInAvailableDate !== undefined) patch.moveInAvailableDate = note.moveInAvailableDate;
      if (note.moveInInstructions !== undefined) patch.moveInInstructions = note.moveInInstructions;
      if (note.monthlyRent !== undefined) patch.monthlyRent = note.monthlyRent;
      return { ...r, ...patch };
    });
  }, [baseRooms, portalNote]);

  useEffect(() => {
    if (!row) {
      const timer = window.setTimeout(() => setListingEditorOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/manager/subscription", { credentials: "include" });
        const body = (await res.json()) as { tier?: string | null };
        if (!cancelled && res.ok) setSkuTier(body.tier ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const editorInitial = useMemo(() => {
    if (!listingEditorOpen || !portalSub) return null;
    return portalSub.sub;
  }, [listingEditorOpen, portalSub]);

  const openRoomEdit = useCallback(
    (room: ManagerRoomSubmission) => {
      const existingNote = noteKey ? (getPortalListingNote(noteKey).rooms?.[room.id] ?? {}) : {};
      setEditingRoomId(room.id);
      setRoomDraft({
        name: existingNote.name ?? room.name,
        detail: existingNote.detail ?? room.detail,
        amenitiesText: existingNote.amenitiesText ?? room.roomAmenitiesText,
        furnishing: existingNote.furnishing ?? room.furnishing,
        monthlyRent: existingNote.monthlyRent ?? room.monthlyRent,
        availability: existingNote.availability ?? room.availability,
        utilitiesEstimate: existingNote.utilitiesEstimate ?? room.utilitiesEstimate,
        moveInAvailableDate: existingNote.moveInAvailableDate ?? room.moveInAvailableDate,
        moveInInstructions: existingNote.moveInInstructions ?? room.moveInInstructions,
      });
    },
    [noteKey],
  );

  const saveRoomEdits = useCallback(() => {
    if (!noteKey || !editingRoomId) return;
    setSavingRoom(true);
    const patch: PortalRoomNote = {
      ...roomDraft,
      utilitiesEstimate: (roomDraft.utilitiesEstimate ?? "").replace(/\/mo(nth)?\.?$/i, "").trim(),
    };
    savePortalRoomNote(noteKey, editingRoomId, patch);
    setSavingRoom(false);
    showToast("Room details saved.");
    setEditingRoomId(null);
    setNotesTick((t) => t + 1);
  }, [noteKey, editingRoomId, roomDraft, showToast]);

  const saveHouseEdits = useCallback(() => {
    if (!noteKey) return;
    setSavingHouse(true);
    savePortalListingNote(noteKey, houseDraft);
    setSavingHouse(false);
    showToast("House details saved.");
    setHouseEditing(false);
    setNotesTick((t) => t + 1);
  }, [noteKey, houseDraft, showToast]);

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
  };

  if (!row || !mock) return null;
  const publicHref = publicListingHrefForPropertyRow(row);

  const openInlineEditor = () => {
    if (!managerUserId) {
      showToast("Sign in to edit.");
      return;
    }
    if (bucket === 0) {
      if (row.adminRefId.startsWith("mgr-")) {
        const hit = readExtraListingsForUser(managerUserId).find((x) => x.id === row.adminRefId);
        if (!hit) {
          showToast("Could not load this listing.");
          return;
        }
      } else {
        const hit = readPendingManagerPropertiesForUser(managerUserId).find((r) => r.id === row.adminRefId);
        if (!hit) {
          showToast("Could not load this submission.");
          return;
        }
      }
    }
    if (bucket === 2 && row.listingId) {
      const hit = readExtraListingsForUser(managerUserId).find((x) => x.id === row.listingId);
      if (!hit) {
        showToast("Could not load this listing.");
        return;
      }
    }
    setListingEditorOpen(true);
  };

  const footer = (
    <div className="flex flex-col gap-2">
      {bucket === 1 && row.editRequestNote?.trim() ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Requested changes</p>
          <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{row.editRequestNote.trim()}</p>
        </div>
      ) : null}

      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Actions</p>

      {bucket === 0 ? (
        <>
          <p className="text-xs text-slate-500">
            {row.adminRefId.startsWith("mgr-")
              ? "This listing was edited and is off the public site until prakritramachandran@gmail.com approves it again. You can keep editing here."
              : "Listing approval is handled by prakritramachandran@gmail.com. Edit below without leaving this preview; only that admin can approve, request changes, or reject a listing."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={openInlineEditor}>
              {row.adminRefId.startsWith("mgr-") ? "Edit listing" : "Edit submission"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => {
                if (row.adminRefId.startsWith("mgr-")) {
                  if (!window.confirm("Permanently delete this listing from your catalog?")) return;
                  deferCatalogMutation(() => run("Listing deleted.", deleteManagerLiveListing(row.adminRefId, managerUserId)));
                  return;
                }
                if (!window.confirm("Delete this pending submission? You can create a new listing later.")) return;
                deferCatalogMutation(() =>
                  run("Submission deleted.", deletePendingSubmissionForManager(row.adminRefId, managerUserId)),
                );
              }}
            >
              {row.adminRefId.startsWith("mgr-") ? "Delete listing" : "Delete submission"}
            </Button>
          </div>
        </>
      ) : null}

      {bucket === 1 ? (
        <>
          <p className="text-xs text-slate-500">
            Return this to your pending queue to edit and resubmit — it will appear under Pending again.
          </p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              deferCatalogMutation(() =>
                run("Returned to pending — you can edit and resubmit.", returnRequestChangeToPending(row.adminRefId, managerUserId)),
              )
            }
          >
            Move to pending & revise
          </Button>
        </>
      ) : null}

      {bucket === 2 && listingId ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              deferCatalogMutation(() => run("Listing unlisted.", unlistManagerListing(listingId, managerUserId)))
            }
          >
            Unlist
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() => {
              if (!window.confirm("Permanently delete this listing? It will be removed from your catalog.")) return;
              deferCatalogMutation(() => run("Listing deleted.", deleteManagerLiveListing(listingId, managerUserId)));
            }}
          >
            Delete listing
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={openInlineEditor}>
            Edit listing
          </Button>
          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              View listing
            </Link>
          ) : null}
        </>
      ) : null}

      {bucket === 3 ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              deferCatalogMutation(() => {
                const id = listAdminRow(row, managerUserId);
                if (!id) {
                  showToast("Could not relist.");
                  return;
                }
                showToast("Listing is live again.");
                onUpdated();
              });
            }}
          >
            Relist on Rent with Axis
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() => {
              if (!window.confirm("Remove this unlisted property from your queue permanently?")) return;
              deferCatalogMutation(() =>
                run("Removed from queue.", deleteUnlistedManagerProperty(row.adminRefId, managerUserId)),
              );
            }}
          >
            Delete from queue
          </Button>
        </>
      ) : null}

      {bucket === 4 ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              deferCatalogMutation(() =>
                run("Restored to pending approval.", restoreRejectedToPending(row.adminRefId, managerUserId)),
              )
            }
          >
            Move to pending approval
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
            onClick={() =>
              deferCatalogMutation(() => run("Property removed.", removeRejectedProperty(row.adminRefId, managerUserId)))
            }
          >
            Delete property
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-32px_rgba(15,23,42,0.45)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Details</p>
            <h3 className="mt-2 text-base font-semibold text-slate-950">{mock.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{mock.address}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{mock.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.rentLabel}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {mock.beds} bd / {mock.baths} ba
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.available}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{mock.neighborhood}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">{footer}</div>
        </div>

        {portalSub ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">House details</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Portal only</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (houseEditing) {
                    setHouseEditing(false);
                  } else {
                    setHouseDraft({
                      tagline: portalNote.tagline ?? "",
                      houseOverview: portalNote.houseOverview ?? "",
                      amenitiesText: portalNote.amenitiesText ?? "",
                      houseRulesText: portalNote.houseRulesText ?? "",
                    });
                    setHouseEditing(true);
                  }
                }}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  houseEditing
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {houseEditing ? "Cancel" : "Edit"}
              </button>
            </div>
            {houseEditing ? (
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tagline</label>
                    <input
                      type="text"
                      value={houseDraft.tagline}
                      onChange={(e) => setHouseDraft((d) => ({ ...d, tagline: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                      placeholder="One-line hook shown on the listing card…"
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">House overview</label>
                    <textarea
                      rows={4}
                      value={houseDraft.houseOverview}
                      onChange={(e) => setHouseDraft((d) => ({ ...d, houseOverview: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                      placeholder="Describe the house, vibe, location, ideal tenant…"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">House amenities</label>
                    <textarea
                      rows={3}
                      value={houseDraft.amenitiesText}
                      onChange={(e) => setHouseDraft((d) => ({ ...d, amenitiesText: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                      placeholder="One per line or comma-separated — e.g. Washer/dryer, Backyard, Parking"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">House rules</label>
                    <textarea
                      rows={3}
                      value={houseDraft.houseRulesText}
                      onChange={(e) => setHouseDraft((d) => ({ ...d, houseRulesText: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                      placeholder="Quiet hours, guests, smoking, pets…"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={savingHouse}
                    onClick={saveHouseEdits}
                    className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingHouse ? "Saving…" : "Save house details"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHouseEditing(false)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {[
                  { label: "Tagline", value: portalNote.tagline },
                  { label: "Overview", value: portalNote.houseOverview },
                  { label: "Amenities", value: portalNote.amenitiesText },
                  { label: "Rules", value: portalNote.houseRulesText },
                ]
                  .filter(({ value }) => value?.trim())
                  .map(({ label, value }) => (
                    <div key={label} className="flex gap-4 px-4 py-3">
                      <p className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{value}</p>
                    </div>
                  ))}
                {!portalNote.tagline?.trim() && !portalNote.houseOverview?.trim() && !portalNote.amenitiesText?.trim() && !portalNote.houseRulesText?.trim() ? (
                  <p className="px-4 py-3 text-sm text-slate-400">No house details yet — click Edit to add.</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {rooms.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-indigo-100 bg-white">
            <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Room details</p>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                Portal only
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">#</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Room</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Floor</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rent / mo</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Availability</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Est. utilities</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Move-in date</th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Furnishing</th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room, index) => {
                    const isEditing = editingRoomId === room.id;
                    const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/40";
                    return (
                      <Fragment key={room.id}>
                        <tr className={`border-b border-slate-100 ${isEditing ? "bg-indigo-50/40" : rowBg}`}>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{room.name || `Room ${index + 1}`}</p>
                            {room.detail?.trim() ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{room.detail}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{room.floor || "—"}</td>
                          <td className="px-4 py-3">
                            {room.monthlyRent > 0 ? (
                              <span className="font-semibold text-slate-900">${room.monthlyRent.toLocaleString()}</span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{room.availability || "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{normUtility(room.utilitiesEstimate)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{room.moveInAvailableDate || "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{normFurnishing(room.furnishing)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingRoomId(null);
                                } else {
                                  openRoomEdit(room);
                                }
                              }}
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                                isEditing
                                  ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {isEditing ? "Cancel" : "Edit"}
                            </button>
                          </td>
                        </tr>
                        {isEditing ? (
                          <tr className="border-b border-indigo-100">
                            <td colSpan={9} className="bg-indigo-50/30 px-4 py-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Room name</label>
                                  <input
                                    type="text"
                                    value={roomDraft.name ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, name: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="e.g. Master bedroom"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Furnishing</label>
                                  <input
                                    type="text"
                                    value={roomDraft.furnishing ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, furnishing: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="e.g. Fully furnished"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Description</label>
                                  <textarea
                                    rows={3}
                                    value={roomDraft.detail ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, detail: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="Describe this room's features, layout, or notes…"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Amenities</label>
                                  <textarea
                                    rows={2}
                                    value={roomDraft.amenitiesText ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, amenitiesText: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="Comma-separated or one per line — e.g. Ensuite bath, Walk-in closet, AC"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Monthly rent ($)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={roomDraft.monthlyRent ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, monthlyRent: Number(e.target.value) }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="1500"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Availability</label>
                                  <input
                                    type="text"
                                    value={roomDraft.availability ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, availability: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="e.g. Available now"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Est. utilities / mo</label>
                                  <input
                                    type="text"
                                    value={roomDraft.utilitiesEstimate ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, utilitiesEstimate: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="e.g. 120"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Move-in date</label>
                                  <input
                                    type="date"
                                    value={roomDraft.moveInAvailableDate ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, moveInAvailableDate: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Move-in instructions</label>
                                  <textarea
                                    rows={2}
                                    value={roomDraft.moveInInstructions ?? ""}
                                    onChange={(e) => setRoomDraft((d) => ({ ...d, moveInInstructions: e.target.value }))}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                    placeholder="Keys, parking, access codes, what to bring…"
                                  />
                                </div>
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  disabled={savingRoom}
                                  onClick={saveRoomEdits}
                                  className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                                >
                                  {savingRoom ? "Saving…" : "Save room"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRoomId(null)}
                                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
      {listingEditorOpen && editorInitial && managerUserId ? (
        <ManagerAddListingForm
          key={`preview-edit-${bucket}-${row.adminRefId}-${row.listingId ?? "pending"}`}
          showToast={showToast}
          skuTier={skuTier}
          propCountBeforeSubmit={countManagerManagedPropertiesForUser(managerUserId)}
          editPendingId={bucket === 0 && !row.adminRefId.startsWith("mgr-") ? row.adminRefId : null}
          editListingId={
            bucket === 2 && row.listingId
              ? row.listingId
              : bucket === 0 && row.adminRefId.startsWith("mgr-")
                ? (row.listingId ?? row.adminRefId)
                : null
          }
          initialSubmission={editorInitial}
          onClose={() => setListingEditorOpen(false)}
          onSubmitted={() => {
            setListingEditorOpen(false);
            onUpdated();
          }}
        />
      ) : null}
    </>
  );
}

export function ManagerHousePropertiesPanel({ showToast }: { showToast: (m: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const activeStage = managerStageFromParam(searchParams.get("status"));

  const setActiveStage = useCallback((stage: ManagerStageKey) => {
    const next = new URLSearchParams(searchParams.toString());
    if (stage === "pending") next.delete("status");
    else next.set("status", stage);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    void syncPropertyPipelineFromServer().then(() => {
      setTick((t) => t + 1);
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, []);

  const kpiValues = useMemo(() => {
    void tick;
    return adminKpiCounts(managerUserId);
  }, [tick, managerUserId]);

  const stageCounts = useMemo(
    () => ({
      pending: kpiValues[0] + kpiValues[1],
      listed: kpiValues[2],
      unlisted: kpiValues[3],
      rejected: kpiValues[4],
    }),
    [kpiValues],
  );

  const rows = useMemo(() => {
    void tick;
    if (!managerUserId) return [] as Array<{ sourceBucket: AdminPropertyBucketIndex; row: AdminPropertyRow }>;
    const stage = MANAGER_STAGES.find((item) => item.key === activeStage);
    if (!stage) return [];
    return stage.buckets.flatMap((bucket) =>
      readAdminPropertyRows(bucket, managerUserId).map((row) => ({ sourceBucket: bucket, row })),
    );
  }, [tick, managerUserId, activeStage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setExpandedRowKey(null), 0);
    return () => window.clearTimeout(timer);
  }, [activeStage]);

  useEffect(() => {
    if (activeStage !== "pending") return;
    if ((stageCounts.pending ?? 0) === 0 && (stageCounts.listed ?? 0) > 0) {
      setActiveStage("listed");
    }
  }, [activeStage, stageCounts, setActiveStage]);

  if (!authReady) {
    return <p className="text-sm text-slate-500">Loading your properties…</p>;
  }
  if (!managerUserId) {
    return <p className="text-sm text-slate-600">Sign in to view and manage your properties.</p>;
  }

  return (
    <>
      <div className="mt-1 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {MANAGER_STAGES.map((stage) => (
          <button
            key={stage.key}
            type="button"
            onClick={() => setActiveStage(stage.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 sm:px-4 sm:text-sm ${
              activeStage === stage.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {stage.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeStage === stage.key ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
              }`}
            >
              {stageCounts[stage.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">{BANNER_COPY[activeStage]}</div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-4`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
            <AxisHeaderMarkTile>
              <HouseIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 max-w-sm text-sm font-medium text-slate-500">{EMPTY_COPY[activeStage]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sourceBucket, row }) => {
                  const rowKey = row.adminRefId + (row.listingId ?? "");
                  const expanded = expandedRowKey === rowKey;
                  const status = rowStatus(sourceBucket);

                  return (
                    <Fragment key={rowKey}>
                      <tr className={PORTAL_TABLE_TR}>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-medium text-slate-900">
                            {row.buildingName} · {row.unitLabel}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                            {row.address}
                            {row.zip ? `, ${row.zip}` : ""}
                          </p>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="text-xs text-slate-600">
                            <span className="font-medium text-slate-800">${row.monthlyRent}</span>/mo · {row.beds} bd / {row.baths}{" "}
                            ba · {row.neighborhood}
                          </p>
                          {row.tagline.trim() ? <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{row.tagline}</p> : null}
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <StatusPill label={status.label} variant={status.variant} />
                        </td>
                        <td className={`${PORTAL_TABLE_TD} text-right`}>
                          <Button
                            type="button"
                            variant="outline"
                            className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                            onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                            aria-expanded={expanded}
                          >
                            {expanded ? "Hide details" : "More details"}
                          </Button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${rowKey}-details`} className="border-b border-slate-100">
                          <td colSpan={4} className="bg-slate-50/40 px-4 py-4">
                            <ManagerPropertyInlineDetails
                              bucket={sourceBucket}
                              row={row}
                              onUpdated={() => setTick((t) => t + 1)}
                              showToast={showToast}
                              managerUserId={managerUserId}
                            />
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
    </>
  );
}

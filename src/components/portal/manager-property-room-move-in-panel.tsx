"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
import { PortalDetailHeader } from "@/components/portal/portal-list-detail-shell";
import { MoveInMediaFields } from "@/components/portal/move-in-media-fields";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import {
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import type { ManagerListingSubmissionV1, ManagerRoomSubmission } from "@/lib/manager-listing-submission";
import { isEntireHomeListing } from "@/lib/manager-listing-submission";
import { sortRoomIndicesByFloor } from "@/lib/listing-floor-order";
import { cn } from "@/lib/utils";

type RoomSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function MoveInInstructionsField({
  moveInInstructions,
  disabled,
  onInstructionsChange,
}: {
  moveInInstructions: string;
  disabled: boolean;
  onInstructionsChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted">
        Move-in instructions
        <span className="ml-1.5 font-normal text-muted">— shown to placed residents</span>
      </label>
      <Textarea
        rows={6}
        className="mt-1 text-sm"
        disabled={disabled}
        value={moveInInstructions}
        onChange={(e) => onInstructionsChange(e.target.value)}
        placeholder="Keys, parking, access codes, what to bring…"
      />
    </div>
  );
}

function roomMoveInSummary(room: ManagerRoomSubmission): string {
  const parts: string[] = [];
  if (room.moveInInstructions?.trim()) parts.push("Instructions set");
  if ((room.moveInPhotoDataUrls?.length ?? 0) > 0) parts.push(`${room.moveInPhotoDataUrls!.length} photo(s)`);
  if (room.moveInVideoDataUrl) parts.push("Video");
  if (parts.length > 0) return parts.join(" · ");
  return "No move-in details yet";
}

function roomMediaMatches(a: ManagerRoomSubmission, b: ManagerRoomSubmission): boolean {
  const aPhotos = a.moveInPhotoDataUrls ?? [];
  const bPhotos = b.moveInPhotoDataUrls ?? [];
  return (
    aPhotos.length === bPhotos.length &&
    aPhotos.every((url, index) => url === bPhotos[index]) &&
    (a.moveInVideoDataUrl ?? null) === (b.moveInVideoDataUrl ?? null)
  );
}

export function ManagerPropertyRoomMoveInPanel({
  sub,
  saveTarget,
  managerUserId,
  canEdit,
  onUpdated,
  showToast,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: RoomSaveTarget;
  managerUserId: string | null;
  canEdit: boolean;
  onUpdated: () => void;
  showToast: (message: string) => void;
}) {
  const entireHome = isEntireHomeListing(sub);
  const roomIndices = useMemo(() => sortRoomIndicesByFloor(sub.rooms), [sub.rooms]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draftByRoomId, setDraftByRoomId] = useState<Record<string, ManagerRoomSubmission>>({});
  const [houseInstructions, setHouseInstructions] = useState(sub.houseMoveInInstructions ?? "");
  const [housePhotos, setHousePhotos] = useState(sub.houseMoveInPhotoDataUrls ?? []);
  const [houseVideo, setHouseVideo] = useState(sub.houseMoveInVideoDataUrl ?? null);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [savingHouse, setSavingHouse] = useState(false);

  useEffect(() => {
    setDraftByRoomId(Object.fromEntries(sub.rooms.map((room) => [room.id, room])));
    setHouseInstructions(sub.houseMoveInInstructions ?? "");
    setHousePhotos(sub.houseMoveInPhotoDataUrls ?? []);
    setHouseVideo(sub.houseMoveInVideoDataUrl ?? null);
    setSelectedRoomId((current) =>
      current && sub.rooms.some((room) => room.id === current) ? current : null,
    );
  }, [sub]);

  const persistSubmission = (nextSub: ManagerListingSubmissionV1, successMessage: string) => {
    if (!managerUserId || !saveTarget || !canEdit) return false;
    let ok = false;
    if (saveTarget.mode === "pending") {
      ok = updatePendingManagerProperty(saveTarget.saveId, nextSub, managerUserId);
    } else if (saveTarget.mode === "listing") {
      ok = updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, nextSub);
    } else if (saveTarget.mode === "requestChange") {
      ok = updateRequestChangeProperty(saveTarget.saveId, managerUserId, nextSub);
    }
    if (!ok) {
      showToast("Could not save move-in details.");
      return false;
    }
    showToast(successMessage);
    onUpdated();
    return true;
  };

  const roomDraft = (room: ManagerRoomSubmission) => draftByRoomId[room.id] ?? room;

  const roomDirty = (room: ManagerRoomSubmission) => {
    const draft = roomDraft(room);
    return (
      (draft.moveInInstructions ?? "") !== (room.moveInInstructions ?? "") || !roomMediaMatches(draft, room)
    );
  };

  const saveRoom = (room: ManagerRoomSubmission) => {
    const draft = roomDraft(room);
    setSavingRoomId(room.id);
    persistSubmission(
      {
        ...sub,
        rooms: sub.rooms.map((r) =>
          r.id === room.id
            ? {
                ...r,
                moveInInstructions: draft.moveInInstructions ?? "",
                moveInPhotoDataUrls: [...(draft.moveInPhotoDataUrls ?? [])],
                moveInVideoDataUrl: draft.moveInVideoDataUrl ?? null,
              }
            : r,
        ),
      },
      "Move-in details saved.",
    );
    setSavingRoomId(null);
  };

  const houseDirty =
    houseInstructions !== (sub.houseMoveInInstructions ?? "") ||
    housePhotos.join("|") !== (sub.houseMoveInPhotoDataUrls ?? []).join("|") ||
    (houseVideo ?? null) !== (sub.houseMoveInVideoDataUrl ?? null);

  const saveHouse = () => {
    setSavingHouse(true);
    persistSubmission(
      {
        ...sub,
        houseMoveInInstructions: houseInstructions,
        houseMoveInPhotoDataUrls: [...housePhotos],
        houseMoveInVideoDataUrl: houseVideo,
      },
      "Move-in details saved.",
    );
    setSavingHouse(false);
  };

  if (entireHome) {
    return (
      <PortalPropertyDetailSection
        actions={
          canEdit ? (
            <Button
              type="button"
              variant="primary"
              className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
              data-attr="house-move-in-save"
              disabled={!houseDirty || savingHouse}
              onClick={saveHouse}
            >
              {savingHouse ? "Saving…" : "Save"}
            </Button>
          ) : null
        }
      >
        <div className="px-1">
          <p className="text-sm text-muted">
            Whole-home move-in details shown to placed residents.
          </p>
          <div className="mt-4">
            <MoveInInstructionsField
              moveInInstructions={houseInstructions}
              disabled={!canEdit}
              onInstructionsChange={setHouseInstructions}
            />
            <MoveInMediaFields
              photoDataUrls={housePhotos}
              videoDataUrl={houseVideo}
              disabled={!canEdit}
              onPhotosChange={setHousePhotos}
              onVideoChange={setHouseVideo}
              onError={showToast}
            />
          </div>
        </div>
      </PortalPropertyDetailSection>
    );
  }

  if (sub.rooms.length === 0) {
    return (
      <PortalPropertyDetailSection>
        <p className="px-1 text-sm text-muted">Add rooms in Edit listing to set per-room move-in details.</p>
      </PortalPropertyDetailSection>
    );
  }

  if (selectedRoomId) {
    const roomIndex = sub.rooms.findIndex((room) => room.id === selectedRoomId);
    const room = roomIndex >= 0 ? sub.rooms[roomIndex]! : null;
    if (!room) {
      return null;
    }
    const draft = roomDraft(room);
    const label = room.name.trim() || `Room ${roomIndex + 1}`;
    const dirty = roomDirty(room);

    return (
      <PortalPropertyDetailSection
        actions={
          canEdit ? (
            <Button
              type="button"
              variant="primary"
              className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
              data-attr="room-move-in-save"
              disabled={!dirty || savingRoomId === room.id}
              onClick={() => saveRoom(room)}
            >
              {savingRoomId === room.id ? "Saving…" : "Save"}
            </Button>
          ) : null
        }
      >
        <PortalDetailHeader
          bare
          title={label}
          subtitle={room.floor.trim() || undefined}
          onBack={() => setSelectedRoomId(null)}
          backLabel="Rooms"
          hideBackText
          dataAttrBack="property-move-in-back"
        />
        <div className="mt-4 px-1">
          <MoveInInstructionsField
            moveInInstructions={draft.moveInInstructions ?? ""}
            disabled={!canEdit}
            onInstructionsChange={(value) =>
              setDraftByRoomId((prev) => ({
                ...prev,
                [room.id]: { ...draft, moveInInstructions: value },
              }))
            }
          />
          <MoveInMediaFields
            photoDataUrls={draft.moveInPhotoDataUrls ?? []}
            videoDataUrl={draft.moveInVideoDataUrl ?? null}
            disabled={!canEdit}
            onPhotosChange={(urls) =>
              setDraftByRoomId((prev) => ({
                ...prev,
                [room.id]: { ...draft, moveInPhotoDataUrls: urls },
              }))
            }
            onVideoChange={(url) =>
              setDraftByRoomId((prev) => ({
                ...prev,
                [room.id]: { ...draft, moveInVideoDataUrl: url },
              }))
            }
            onError={showToast}
          />
        </div>
      </PortalPropertyDetailSection>
    );
  }

  return (
    <PortalPropertyDetailSection>
      <p className="mb-3 px-1 text-sm text-muted">
        Select a room to add access notes for placed residents.
      </p>
      <div className="divide-y divide-border/50">
        {roomIndices.map((index) => {
          const room = sub.rooms[index]!;
          const label = room.name.trim() || `Room ${index + 1}`;

          return (
            <button
              key={room.id}
              type="button"
              data-attr={`property-move-in-room-${room.id}`}
              className={cn(
                PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
                "w-full cursor-pointer rounded-lg px-1 text-left transition hover:bg-accent/20",
              )}
              onClick={() => setSelectedRoomId(room.id)}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[room.floor.trim() || null, roomMoveInSummary(room)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              </div>
            </button>
          );
        })}
      </div>
    </PortalPropertyDetailSection>
  );
}

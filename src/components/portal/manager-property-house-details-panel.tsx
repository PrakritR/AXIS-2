"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import {
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  getPortalListingNote,
  savePortalListingNote,
  type PortalListingNote,
} from "@/lib/portal-listing-notes";

type HouseSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function HouseDetailRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string | null | undefined;
  badge?: string | null;
}) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div className="flex gap-4 border-t border-border px-4 py-3 first:border-t-0">
      <div className="w-28 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {badge ? (
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              badge === "Manager only" ? "portal-badge-notice" : "portal-badge-info"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

export function ManagerPropertyHouseDetailsPanel({
  noteKey,
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
}: {
  noteKey: string | null;
  sub: ManagerListingSubmissionV1;
  saveTarget: HouseSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  const [notesTick, setNotesTick] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState<PortalListingNote>({});

  const portalNote = useMemo(
    () => (noteKey ? getPortalListingNote(noteKey) : ({} as PortalListingNote)),
    [noteKey, notesTick],
  );

  const houseDescription = sub.houseDescription?.trim() || portalNote.houseDescription?.trim() || "";
  const houseRulesText = sub.houseRulesText?.trim() || portalNote.houseRulesText?.trim() || "";
  const generalHouseInfo = sub.generalHouseInfo?.trim() || portalNote.generalHouseInfo?.trim() || "";
  const wifiNetworkName = sub.wifiNetworkName?.trim() || portalNote.wifiNetworkName?.trim() || "";
  const wifiPassword = sub.wifiPassword?.trim() || portalNote.wifiPassword?.trim() || "";
  const wifiLine = [
    wifiNetworkName ? `Network: ${wifiNetworkName}` : "",
    wifiPassword ? `Password: ${wifiPassword}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const hasAny = Boolean(houseDescription || houseRulesText || generalHouseInfo || wifiLine);

  if (!noteKey) return null;

  const startEdit = () => {
    setDraft({
      houseDescription: sub.houseDescription ?? portalNote.houseDescription ?? "",
      houseRulesText: sub.houseRulesText ?? portalNote.houseRulesText ?? "",
      generalHouseInfo: sub.generalHouseInfo ?? portalNote.generalHouseInfo ?? "",
      wifiNetworkName: sub.wifiNetworkName ?? portalNote.wifiNetworkName ?? "",
      wifiPassword: sub.wifiPassword ?? portalNote.wifiPassword ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const save = () => {
    if (!noteKey || !managerUserId) return;
    const next: ManagerListingSubmissionV1 = {
      ...sub,
      houseDescription: draft.houseDescription ?? "",
      houseRulesText: draft.houseRulesText ?? "",
      generalHouseInfo: draft.generalHouseInfo ?? "",
      wifiNetworkName: draft.wifiNetworkName ?? "",
      wifiPassword: draft.wifiPassword ?? "",
    };
    let ok = false;
    if (saveTarget?.mode === "pending") {
      ok = updatePendingManagerProperty(saveTarget.saveId, next, managerUserId);
    } else if (saveTarget?.mode === "listing") {
      ok = updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, next);
    } else if (saveTarget?.mode === "requestChange") {
      ok = updateRequestChangeProperty(saveTarget.saveId, managerUserId, next);
    }
    if (!ok) {
      showToast("Could not save house details.");
      return;
    }
    savePortalListingNote(noteKey, {
      houseDescription: draft.houseDescription,
      houseRulesText: draft.houseRulesText,
      generalHouseInfo: draft.generalHouseInfo,
      wifiNetworkName: draft.wifiNetworkName,
      wifiPassword: draft.wifiPassword,
    });
    showToast("House details saved.");
    setModalOpen(false);
    setNotesTick((t) => t + 1);
    onUpdated();
  };

  const editForm = (
    <div className="space-y-4">
      <div>
        <div className="mb-0.5 flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">House description</p>
          <span className="portal-badge-notice rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Manager only</span>
        </div>
        <Textarea
          rows={4}
          value={draft.houseDescription ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, houseDescription: e.target.value }))}
          placeholder="Internal notes about the house…"
          className="mt-1"
        />
      </div>
      <div>
        <div className="mb-0.5 flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">House rules</p>
          <span className="portal-badge-info rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Residents only</span>
        </div>
        <Textarea
          rows={3}
          value={draft.houseRulesText ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, houseRulesText: e.target.value }))}
          placeholder="Quiet hours, guests, smoking, pets…"
          className="mt-1"
        />
      </div>
      <div>
        <div className="mb-0.5 flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">General house info</p>
          <span className="portal-badge-info rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Residents only</span>
        </div>
        <Textarea
          rows={4}
          value={draft.generalHouseInfo ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, generalHouseInfo: e.target.value }))}
          placeholder="Gate/door codes, laundry tips, trash schedule…"
          className="mt-1"
        />
      </div>
      <div>
        <div className="mb-0.5 flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">Wi-Fi</p>
          <span className="portal-badge-info rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Residents only</span>
        </div>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <Input
            value={draft.wifiNetworkName ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, wifiNetworkName: e.target.value }))}
            placeholder="Wi-Fi network name (SSID)"
          />
          <Input
            value={draft.wifiPassword ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, wifiPassword: e.target.value }))}
            placeholder="Wi-Fi password"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" className="rounded-full" onClick={save}>
          Save house details
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={closeModal}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <PortalCollapsibleSection
        title="House details"
        titleAddon={
          <span className="portal-badge-info rounded-full px-2 py-0.5 text-[10px] font-semibold">Portal only</span>
        }
        expanded={expanded}
        onExpandedChange={setExpanded}
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="house-details-edit"
            onClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
          >
            Edit
          </Button>
        }
        toggleDataAttr="house-details-section-toggle"
      >
        <div>
          <HouseDetailRow label="Description" value={houseDescription} badge="Manager only" />
          <HouseDetailRow label="House rules" value={houseRulesText} />
          <HouseDetailRow label="General info" value={generalHouseInfo} badge="Residents only" />
          <HouseDetailRow label="Wi-Fi" value={wifiLine} badge="Residents only" />
          {!hasAny ? (
            <p className="px-4 py-3 text-sm text-muted">No house details yet — click Edit to add.</p>
          ) : null}
        </div>
      </PortalCollapsibleSection>

      <Modal open={modalOpen} title="House details" onClose={closeModal} panelClassName="max-w-2xl">
        {editForm}
      </Modal>
    </>
  );
}

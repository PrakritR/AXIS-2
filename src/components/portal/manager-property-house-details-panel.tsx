"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
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

function FieldBlock({
  label,
  badge,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  badge?: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {badge ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              badge === "Manager only" ? "portal-badge-notice" : "portal-badge-info"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
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
  const [dirty, setDirty] = useState(false);

  const portalNote = useMemo(
    () => (noteKey ? getPortalListingNote(noteKey) : ({} as PortalListingNote)),
    [noteKey, notesTick],
  );

  const baseline = useMemo(
    () => ({
      houseDescription: sub.houseDescription?.trim() || portalNote.houseDescription?.trim() || "",
      houseRulesText: sub.houseRulesText?.trim() || portalNote.houseRulesText?.trim() || "",
      generalHouseInfo: sub.generalHouseInfo?.trim() || portalNote.generalHouseInfo?.trim() || "",
    }),
    [sub, portalNote],
  );

  const [draft, setDraft] = useState(baseline);

  useEffect(() => {
    if (!dirty) setDraft(baseline);
  }, [baseline, dirty]);

  if (!noteKey) return null;

  const save = () => {
    if (!noteKey || !managerUserId) return;
    const next: ManagerListingSubmissionV1 = {
      ...sub,
      houseDescription: draft.houseDescription ?? "",
      houseRulesText: draft.houseRulesText ?? "",
      generalHouseInfo: draft.generalHouseInfo ?? "",
      wifiNetworkName: "",
      wifiPassword: "",
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
    });
    showToast("House details saved.");
    setDirty(false);
    setNotesTick((t) => t + 1);
    onUpdated();
  };

  const updateField = (key: keyof typeof draft, value: string) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <PortalPropertyDetailSection
      actions={
        <Button
          type="button"
          variant="primary"
          className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
          data-attr="house-details-save"
          disabled={!dirty}
          onClick={save}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-6">
        <FieldBlock
        label="House description"
        badge="Manager only"
        value={draft.houseDescription}
        onChange={(v) => updateField("houseDescription", v)}
        placeholder="Internal notes about the house…"
      />
      <FieldBlock
        label="House rules"
        badge="Residents only"
        value={draft.houseRulesText}
        onChange={(v) => updateField("houseRulesText", v)}
        placeholder="Quiet hours, guests, smoking, pets…"
        rows={3}
      />
      <FieldBlock
        label="General house info"
        badge="Residents only"
        value={draft.generalHouseInfo}
        onChange={(v) => updateField("generalHouseInfo", v)}
        placeholder="Gate/door codes, laundry tips, trash schedule…"
      />
      </div>
    </PortalPropertyDetailSection>
  );
}

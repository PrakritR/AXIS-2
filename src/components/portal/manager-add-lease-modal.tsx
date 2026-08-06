"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, MODAL_FIELD_LABEL_CLASS, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseRegenerateConfirmModal } from "@/components/portal/lease-regenerate-confirm-modal";
import { UploadedLeaseReviewModal } from "@/components/portal/uploaded-lease-review-modal";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  confirmUploadedLeaseParse,
  ensureManagerReviewLeaseForApplication,
  generateLeaseHtmlForRow,
  leaseAllowsManagerDocumentEdits,
  leaseGenerationSupportedForRow,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  UPLOADED_LEASE_REVIEW_REQUIRED_MESSAGE,
} from "@/lib/lease-pipeline-storage";
import { retryUploadedLeaseParse, uploadAndParseLeasePdf } from "@/lib/uploaded-lease-parse.client";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import type { UploadedLeaseFieldKey } from "@/lib/uploaded-lease-extraction";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

/** Property name only — strips " · 9 rooms", unit labels, and legacy id suffixes. */
function displayPropertyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(" · ")[0]!
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

type PropertyLeaseOption = {
  propertyId: string;
  propertyLabel: string;
};

function buildManagerPropertyOptions(managerUserId: string | null): PropertyLeaseOption[] {
  if (!managerUserId) return [];
  const seen = new Map<string, PropertyLeaseOption>();

  for (const property of readExtraListingsForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel(property.buildingName.trim() || property.title);
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }

  for (const property of readPendingManagerPropertiesForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel(property.buildingName.trim());
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }

  return [...seen.values()].sort((a, b) =>
    a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" }),
  );
}

type ApprovedResidentOption = {
  applicationId: string;
  residentName: string;
  residentEmail: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
};

function residentBelongsToProperty(resident: ApprovedResidentOption, property: PropertyLeaseOption): boolean {
  if (resident.propertyId && resident.propertyId === property.propertyId) return true;
  return resident.propertyLabel.toLowerCase() === property.propertyLabel.toLowerCase();
}

function buildApprovedResidentOptions(managerUserId: string | null): ApprovedResidentOption[] {
  return readManagerApplicationRows()
    .filter(
      (row) =>
        row.bucket === "approved" &&
        applicationVisibleToPortalUser(row, managerUserId) &&
        row.name?.trim() &&
        row.email?.trim().includes("@"),
    )
    .map((row) => {
      const propertyLabel = displayPropertyLabel(row.property?.trim() || "");
      const propertyId =
        row.assignedPropertyId?.trim() ||
        row.propertyId?.trim() ||
        (propertyLabel ? `prop_mgr_${propertyLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : "");
      const roomLabel =
        getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "")
          .split(" · ")[0]
          ?.trim() ||
        row.manualResidentDetails?.roomNumber?.trim() ||
        "";
      return {
        applicationId: row.id,
        residentName: row.name.trim(),
        residentEmail: row.email!.trim().toLowerCase(),
        propertyId,
        propertyLabel: propertyLabel || "Property",
        roomLabel,
      };
    })
    .sort((a, b) => {
      const byProperty = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (byProperty !== 0) return byProperty;
      return a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
    });
}

export function ManagerAddLeaseModal({
  open,
  onClose,
  onSubmitted,
  managerUserId,
  initialApplicationId,
  initialPropertyId,
  onOpenLease,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  managerUserId: string | null;
  initialApplicationId?: string;
  initialPropertyId?: string;
  onOpenLease?: (leaseId: string) => void;
}) {
  const { showToast } = useAppUi();
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyId, setPropertyId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [importReviewLeaseId, setImportReviewLeaseId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onApplications = () => setApplicationTick((n) => n + 1);
    const onProperties = () => setPropertyTick((n) => n + 1);
    void syncManagerApplicationsFromServer({ force: true, managerUserId: managerUserId ?? undefined }).then(onApplications);
    void syncPropertyPipelineFromServer({ force: true }).then(onProperties);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, onApplications);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProperties);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, onApplications);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProperties);
    };
  }, [open, managerUserId]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyOptions(managerUserId);
  }, [managerUserId, propertyTick]);

  const residents = useMemo(() => {
    void applicationTick;
    return buildApprovedResidentOptions(managerUserId);
  }, [applicationTick, managerUserId]);

  const selectedProperty = useMemo(
    () => propertyOptions.find((row) => row.propertyId === propertyId) ?? null,
    [propertyId, propertyOptions],
  );

  const residentsForProperty = useMemo(() => {
    if (!selectedProperty) return [];
    return residents.filter((row) => residentBelongsToProperty(row, selectedProperty));
  }, [residents, selectedProperty]);

  const selectedResident = useMemo(
    () => residents.find((row) => row.applicationId === applicationId) ?? null,
    [applicationId, residents],
  );

  useEffect(() => {
    if (!open) return;
    setImportReviewLeaseId(null);
    setRegenerateOpen(false);
    if (!initialApplicationId && !initialPropertyId) {
      setPropertyId("");
      setApplicationId("");
      return;
    }
    const resident = initialApplicationId
      ? residents.find((row) => row.applicationId === initialApplicationId)
      : null;
    if (resident) {
      setPropertyId(resident.propertyId);
      setApplicationId(resident.applicationId);
      return;
    }
    setPropertyId(initialPropertyId?.trim() || "");
    setApplicationId("");
  }, [open, initialApplicationId, initialPropertyId, residents]);

  function ensureLeaseRow(): { ok: true; rowId: string } | { ok: false } {
    if (!propertyId || !applicationId) {
      showToast("Select a property and resident.");
      return { ok: false };
    }
    const ensured = ensureManagerReviewLeaseForApplication(applicationId, managerUserId);
    if (!ensured.ok) {
      showToast(ensured.error);
      return { ok: false };
    }
    return { ok: true, rowId: ensured.row.id };
  }

  async function handleUpload(file: File) {
    const ensured = ensureLeaseRow();
    if (!ensured.ok) return;
    setBusy(true);
    const result = await uploadAndParseLeasePdf(ensured.rowId, file, managerUserId);
    setBusy(false);
    if (uploadRef.current) uploadRef.current.value = "";
    if (!result.ok) {
      showToast(result.error ?? "Upload failed.");
      return;
    }
    onSubmitted();
    if (result.saveError) {
      showToast(`Lease PDF uploaded, but its PropLane reading was not stored: ${result.saveError}`);
      onOpenLease?.(ensured.rowId);
      onClose();
      return;
    }
    if (!result.parse) {
      showToast("Lease PDF uploaded.");
      onOpenLease?.(ensured.rowId);
      onClose();
      return;
    }
    setImportReviewLeaseId(ensured.rowId);
    showToast(
      result.parse.status === "parsed"
        ? `Lease imported into PropLane format (${result.parse.sections.length} sections). ${UPLOADED_LEASE_REVIEW_REQUIRED_MESSAGE}`
        : `Lease PDF uploaded, but PropLane could not read its text. ${UPLOADED_LEASE_REVIEW_REQUIRED_MESSAGE}`,
    );
  }

  function openGenerateConfirm() {
    const ensured = ensureLeaseRow();
    if (!ensured.ok) return;
    const row = readLeasePipeline(managerUserId).find((candidate) => candidate.id === ensured.rowId);
    if (!row) {
      showToast("Lease row not found.");
      return;
    }
    if (!leaseAllowsManagerDocumentEdits(row)) {
      showToast("This lease can no longer be edited.");
      return;
    }
    const gate = leaseGenerationSupportedForRow(row);
    if (!gate.ok) {
      showToast(gate.error);
      return;
    }
    setRegenerateOpen(true);
  }

  function runGenerate() {
    const ensured = ensureLeaseRow();
    if (!ensured.ok) return;
    setGenerating(true);
    window.setTimeout(() => {
      try {
        const result = generateLeaseHtmlForRow(ensured.rowId, managerUserId, { discardManagerEdits: true });
        if (result.ok) {
          onSubmitted();
          showToast(`Lease generated (v${result.version}).`);
          onOpenLease?.(ensured.rowId);
          onClose();
        } else {
          showToast(result.error);
        }
      } finally {
        setGenerating(false);
        setRegenerateOpen(false);
      }
    }, 0);
  }

  const reviewRow = importReviewLeaseId
    ? readLeasePipeline(managerUserId).find((row) => row.id === importReviewLeaseId) ?? null
    : null;

  const noProperties = propertyOptions.length === 0;
  const compactField = "min-h-9 rounded-xl px-3 py-1.5 text-sm";

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (!busy && !generating) onClose();
        }}
        title="Add lease"
        description="Choose a property and resident, then upload a signed PDF or generate a lease."
        dataAttr="manager-add-lease-modal"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={MODAL_FIELD_LABEL_CLASS}>Property</span>
            <Select
              id="add-lease-property"
              className={compactField}
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setApplicationId("");
              }}
              disabled={busy || generating || noProperties}
              data-attr="add-lease-property"
            >
              <option value="">{noProperties ? "No properties in portfolio" : "Select property"}</option>
              {propertyOptions.map((option) => (
                <option key={option.propertyId} value={option.propertyId}>
                  {option.propertyLabel}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={MODAL_FIELD_LABEL_CLASS}>Resident</span>
            <Select
              id="add-lease-resident"
              className={compactField}
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              disabled={busy || generating || !propertyId || residentsForProperty.length === 0}
              data-attr="add-lease-resident"
            >
              <option value="">
                {!propertyId
                  ? "Select property first"
                  : residentsForProperty.length === 0
                    ? "No approved residents at this property"
                    : "Select resident"}
              </option>
              {residentsForProperty.map((row) => (
                <option key={row.applicationId} value={row.applicationId}>
                  {row.residentName}
                  {row.roomLabel ? ` · ${row.roomLabel}` : ""}
                </option>
              ))}
            </Select>
          </label>
          {selectedResident ? (
            <p className="text-sm text-muted sm:col-span-2">
              Lease will be added for{" "}
              <span className="font-medium text-foreground">{selectedResident.residentName}</span>
              {selectedResident.roomLabel ? ` (${selectedResident.roomLabel})` : ""} at{" "}
              <span className="font-medium text-foreground">{selectedResident.propertyLabel}</span>.
            </p>
          ) : null}
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy || generating}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            data-attr="add-lease-generate"
            disabled={!applicationId || busy || generating}
            onClick={openGenerateConfirm}
          >
            {generating ? "Generating…" : "Generate lease"}
          </Button>
          <Button
            type="button"
            variant="primary"
            data-attr="add-lease-upload"
            disabled={!applicationId || busy || generating}
            onClick={() => uploadRef.current?.click()}
          >
            {busy ? "Uploading…" : "Upload PDF"}
          </Button>
        </ModalFooter>
      </Modal>

      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />

      <LeaseRegenerateConfirmModal
        open={regenerateOpen}
        busy={generating}
        replacesManagerEdits={false}
        onClose={() => {
          if (!generating) setRegenerateOpen(false);
        }}
        onConfirm={runGenerate}
      />

      {reviewRow?.uploadedLeaseParse ? (
        <UploadedLeaseReviewModal
          open
          row={reviewRow}
          parse={reviewRow.uploadedLeaseParse}
          onClose={() => {
            setImportReviewLeaseId(null);
            onOpenLease?.(reviewRow.id);
            onClose();
          }}
          onConfirm={({ overrides, note }) => {
            const result = confirmUploadedLeaseParse(reviewRow.id, {
              managerUserId,
              overrides: overrides as Partial<Record<UploadedLeaseFieldKey, string>>,
              note,
            });
            if (!result.ok) {
              showToast(result.error ?? "Could not confirm the imported lease.");
              return;
            }
            onSubmitted();
            setImportReviewLeaseId(null);
            void syncLeasePipelineFromServer(managerUserId, { force: true });
            showToast("Imported lease confirmed. It can now be sent for signature.");
            onOpenLease?.(reviewRow.id);
            onClose();
          }}
          onRetryRead={async () => {
            const result = await retryUploadedLeaseParse(reviewRow.id, managerUserId);
            if (!result.ok) {
              showToast(result.error ?? "Could not read that lease PDF.");
              return;
            }
            await syncLeasePipelineFromServer(managerUserId, { force: true });
            onSubmitted();
          }}
        />
      ) : null}
    </>
  );
}

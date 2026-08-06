"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, MODAL_FIELD_LABEL_CLASS, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { APPLICATION_STARTED_EMAIL_SUBJECT } from "@/lib/application-started-email";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  clearRentalWizardDraft,
  saveRentalWizardDraft,
  saveRentalWizardDraftAxisId,
} from "@/lib/rental-application/drafts";
import {
  findInProgressRowForTarget,
  isInProgressApplicationRow,
  mintApplicationAxisId,
  syncInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";

const NEW_RESIDENT_ID = "__new_resident__";

function displayPropertyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(" · ")[0]!
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

type PropertyOption = { propertyId: string; propertyLabel: string };

function buildManagerPropertyOptions(managerUserId: string | null): PropertyOption[] {
  if (!managerUserId) return [];
  const seen = new Map<string, PropertyOption>();
  for (const property of readExtraListingsForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel((property.buildingName ?? "").trim() || property.title || "");
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }
  for (const property of readPendingManagerPropertiesForUser(managerUserId)) {
    const propertyId = property.id.trim();
    if (!propertyId || seen.has(propertyId)) continue;
    const propertyLabel = displayPropertyLabel((property.buildingName ?? "").trim() || "");
    if (!propertyLabel) continue;
    seen.set(propertyId, { propertyId, propertyLabel });
  }
  return [...seen.values()].sort((a, b) =>
    a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" }),
  );
}

type ResidentOption = {
  id: string;
  residentName: string;
  residentEmail: string;
  propertyId: string;
  propertyLabel: string;
  hint?: string;
};

function residentBelongsToProperty(resident: ResidentOption, property: PropertyOption): boolean {
  if (resident.propertyId && resident.propertyId === property.propertyId) return true;
  return resident.propertyLabel.toLowerCase() === property.propertyLabel.toLowerCase();
}

function buildResidentOptions(managerUserId: string | null): ResidentOption[] {
  const seen = new Map<string, ResidentOption>();
  for (const row of readManagerApplicationRows()) {
    if (!applicationVisibleToPortalUser(row, managerUserId)) continue;
    if (!row.email?.trim().includes("@") || !row.name?.trim()) continue;
    if (!isCurrentResidentApplicationRow(row) && !isInProgressApplicationRow(row)) continue;

    const propertyLabel = displayPropertyLabel(row.property?.trim() || "");
    const propertyId =
      row.assignedPropertyId?.trim() ||
      row.propertyId?.trim() ||
      row.application?.propertyId?.trim() ||
      (propertyLabel ? `prop_mgr_${propertyLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : "");
    const email = row.email.trim().toLowerCase();
    const key = `${propertyId}::${email}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      id: row.id,
      residentName: row.name.trim(),
      residentEmail: email,
      propertyId,
      propertyLabel: propertyLabel || "Property",
      hint: isInProgressApplicationRow(row) ? "In progress" : undefined,
    });
  }
  return [...seen.values()].sort((a, b) => {
    const byProperty = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
    if (byProperty !== 0) return byProperty;
    return a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
  });
}

function initManagerApplicationDraft(input: {
  propertyId: string;
  residentEmail: string;
  residentName?: string;
  managerUserId: string | null;
}): string {
  const email = input.residentEmail.trim().toLowerCase();
  const inProgress = readManagerApplicationRows().filter(
    (row) =>
      isInProgressApplicationRow(row) &&
      row.email?.trim().toLowerCase() === email,
  );
  const existing = findInProgressRowForTarget(inProgress, { propertyId: input.propertyId });

  clearRentalWizardDraft();
  if (existing?.application) {
    saveRentalWizardDraftAxisId(existing.id);
    const form = {
      ...createInitialRentalWizardState(),
      ...existing.application,
      propertyId: input.propertyId,
      email,
      fullLegalName: existing.application.fullLegalName?.trim() || existing.name?.trim() || input.residentName?.trim() || "",
    };
    saveRentalWizardDraft(form);
    return existing.id;
  }

  const axisId = mintApplicationAxisId();
  saveRentalWizardDraftAxisId(axisId);
  const form = {
    ...createInitialRentalWizardState(),
    propertyId: input.propertyId,
    email,
    fullLegalName: input.residentName?.trim() || "",
  };
  saveRentalWizardDraft(form);
  syncInProgressApplicationRow({
    axisId,
    form,
    residentEmail: email,
    wizardStep: 1,
    wizardMaxStepReached: 1,
  });
  return axisId;
}

export function ManagerApplicationOnBehalfModal({
  open,
  onClose,
  onSubmitted,
  managerUserId,
  basePath = "/portal",
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  managerUserId: string | null;
  basePath?: string;
}) {
  const { showToast } = useAppUi();
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [phase, setPhase] = useState<"pick" | "wizard" | "send">("pick");
  const [propertyId, setPropertyId] = useState("");
  const [residentId, setResidentId] = useState("");
  const [newResidentEmail, setNewResidentEmail] = useState("");
  const [activeAxisId, setActiveAxisId] = useState<string | null>(null);
  const [activeEmail, setActiveEmail] = useState("");
  const [activeName, setActiveName] = useState("");
  const [sendPreview, setSendPreview] = useState<{ to: string; subject: string; text: string } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);

  const reset = useCallback(() => {
    setPhase("pick");
    setPropertyId("");
    setResidentId("");
    setNewResidentEmail("");
    setActiveAxisId(null);
    setActiveEmail("");
    setActiveName("");
    setSendPreview(null);
    setSendBusy(false);
    setPreviewBusy(false);
    clearRentalWizardDraft();
  }, []);

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

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyOptions(managerUserId);
  }, [managerUserId, propertyTick]);

  const residentOptions = useMemo(() => {
    void applicationTick;
    return buildResidentOptions(managerUserId);
  }, [applicationTick, managerUserId]);

  const selectedProperty = useMemo(
    () => propertyOptions.find((row) => row.propertyId === propertyId) ?? null,
    [propertyId, propertyOptions],
  );

  const residentsForProperty = useMemo(() => {
    if (!selectedProperty) return [];
    return residentOptions.filter((row) => residentBelongsToProperty(row, selectedProperty));
  }, [residentOptions, selectedProperty]);

  const selectedResident = useMemo(
    () => residentsForProperty.find((row) => row.id === residentId) ?? null,
    [residentId, residentsForProperty],
  );

  const resolvedEmail = residentId === NEW_RESIDENT_ID ? newResidentEmail.trim().toLowerCase() : selectedResident?.residentEmail ?? "";
  const resolvedName = selectedResident?.residentName ?? "";

  const canStartWizard = Boolean(
    propertyId &&
      residentId &&
      (residentId !== NEW_RESIDENT_ID || /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(resolvedEmail)),
  );

  const handleClose = () => {
    reset();
    onClose();
  };

  const startWizard = () => {
    if (!canStartWizard) {
      showToast("Select a property and resident.");
      return;
    }
    const axisId = initManagerApplicationDraft({
      propertyId,
      residentEmail: resolvedEmail,
      residentName: resolvedName,
      managerUserId,
    });
    setActiveAxisId(axisId);
    setActiveEmail(resolvedEmail);
    setActiveName(resolvedName);
    setPhase("wizard");
    onSubmitted();
  };

  const openSendPreview = async (axisId: string) => {
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/portal/send-manager-application-started", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: axisId, preview: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        preview?: { to?: string; subject?: string; text?: string };
      };
      if (!res.ok || !data.ok || !data.preview) {
        showToast(data.error ?? "Could not load the email preview.");
        return;
      }
      setSendPreview({
        to: data.preview.to ?? resolvedEmail,
        subject: data.preview.subject ?? APPLICATION_STARTED_EMAIL_SUBJECT,
        text: data.preview.text ?? "",
      });
      setActiveAxisId(axisId);
      setPhase("send");
    } catch {
      showToast("Could not load the email preview.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const sendToResident = async () => {
    if (!activeAxisId) return;
    setSendBusy(true);
    try {
      const res = await fetch("/api/portal/send-manager-application-started", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: activeAxisId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; skipped?: boolean };
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Could not send the application email.");
        return;
      }
      showToast(data.skipped ? "Sandbox account — email skipped." : "Application email sent to resident.");
      onSubmitted();
      handleClose();
    } catch {
      showToast("Could not send the application email.");
    } finally {
      setSendBusy(false);
    }
  };

  const compactField = "min-h-9 rounded-xl px-3 py-1.5 text-sm";
  const noProperties = propertyOptions.length === 0;

  return (
    <>
      <Modal
        open={open && phase === "pick"}
        onClose={handleClose}
        title="Add application"
        description="Choose a property and resident, then complete the application on their behalf."
        dataAttr="manager-add-application-modal"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={MODAL_FIELD_LABEL_CLASS}>Property</span>
            <NativeSelect
              className={compactField}
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setResidentId("");
                setNewResidentEmail("");
              }}
              disabled={noProperties}
              data-attr="add-application-property"
            >
              <option value="">{noProperties ? "No properties in portfolio" : "Select property"}</option>
              {propertyOptions.map((option) => (
                <option key={option.propertyId} value={option.propertyId}>
                  {option.propertyLabel}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={MODAL_FIELD_LABEL_CLASS}>Resident</span>
            <NativeSelect
              className={compactField}
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              disabled={!propertyId}
              data-attr="add-application-resident"
            >
              <option value="">
                {!propertyId
                  ? "Select property first"
                  : "Select resident"}
              </option>
              <option value={NEW_RESIDENT_ID}>New resident…</option>
              {residentsForProperty.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.residentName}
                  {row.hint ? ` · ${row.hint}` : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
          {residentId === NEW_RESIDENT_ID ? (
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span className={MODAL_FIELD_LABEL_CLASS}>Resident email</span>
              <Input
                className={compactField}
                type="email"
                value={newResidentEmail}
                onChange={(e) => setNewResidentEmail(e.target.value)}
                placeholder="resident@example.com"
                autoComplete="off"
                data-attr="add-application-new-email"
              />
            </label>
          ) : null}
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            data-attr="add-application-continue"
            disabled={!canStartWizard}
            onClick={startWizard}
          >
            Continue to application
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={open && phase === "wizard"}
        onClose={handleClose}
        title={activeName ? `Application for ${activeName}` : "Application"}
        description="Complete the application, then send it to the resident to review and finish."
        fullPage
        dense
        panelClassName="max-w-4xl"
        dataAttr="manager-application-on-behalf-wizard"
      >
        {phase === "wizard" && activeAxisId ? (
          <RentalApplicationWizard
            showToast={showToast}
            mode="manager"
            layout="embedded"
            linkedPropertyId={propertyId}
            sessionEmail={activeEmail}
            exitPath={`${basePath}/applications/incomplete`}
            onManagerSendToResident={({ axisId }) => {
              void openSendPreview(axisId);
            }}
            onManagerCancel={handleClose}
            managerActionBusy={previewBusy}
          />
        ) : null}
      </Modal>

      <PortalNotificationPreviewModal
        open={phase === "send" && sendPreview !== null}
        title="Send application to resident"
        onClose={() => {
          setSendPreview(null);
          setPhase("wizard");
        }}
        recipient={sendPreview?.to ?? ""}
        subject={sendPreview?.subject ?? APPLICATION_STARTED_EMAIL_SUBJECT}
        body={sendPreview?.text ?? ""}
        intro="The resident can continue the application and create their PropLane account from this email."
        showSkipMessage={false}
        confirmLabel="Send email"
        confirmBusy={sendBusy}
        confirmBusyLabel="Sending…"
        onConfirm={() => void sendToResident()}
      />
    </>
  );
}

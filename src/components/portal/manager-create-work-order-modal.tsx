"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import {
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  parseMoneyAmount,
  recordWorkOrderResidentCharge,
} from "@/lib/household-charges";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  writeManagerWorkOrderRows,
} from "@/lib/manager-work-orders-storage";

type WorkOrderCategory = "cleaning" | "plumbing" | "mold" | "electrical" | "hvac" | "general";

type PropertyOption = { propertyId: string; propertyLabel: string };

type ResidentOption = {
  residentName: string;
  residentEmail: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  assignedRoomChoice?: string;
};

function displayPropertyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(" · ")[0]!
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

function buildPropertyOptions(managerUserId: string | null): PropertyOption[] {
  if (!managerUserId) return [];
  const seen = new Map<string, PropertyOption>();
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

function buildResidentOptions(managerUserId: string | null): ResidentOption[] {
  return readManagerApplicationRows()
    .filter(
      (row) =>
        isCurrentResidentApplicationRow(row) &&
        applicationVisibleToPortalUser(row, managerUserId) &&
        row.name?.trim() &&
        row.email?.trim().includes("@"),
    )
    .map((row) => {
      const propertyLabel = displayPropertyLabel(row.property?.trim() || "");
      const propertyId =
        row.assignedPropertyId?.trim() ||
        row.propertyId?.trim() ||
        row.application?.propertyId?.trim() ||
        "";
      const roomLabel =
        getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "")
          .split(" · ")[0]
          ?.trim() ||
        row.manualResidentDetails?.roomNumber?.trim() ||
        "";
      return {
        residentName: row.name.trim(),
        residentEmail: row.email!.trim().toLowerCase(),
        propertyId,
        propertyLabel: propertyLabel || "Property",
        roomLabel,
        assignedRoomChoice: row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim(),
      };
    })
    .sort((a, b) => {
      const byProperty = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (byProperty !== 0) return byProperty;
      return a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
    });
}

function residentMatchesProperty(resident: ResidentOption, property: PropertyOption): boolean {
  if (resident.propertyId && resident.propertyId === property.propertyId) return true;
  return resident.propertyLabel.toLowerCase() === property.propertyLabel.toLowerCase();
}

const CATEGORY_LABELS: Record<WorkOrderCategory, string> = {
  cleaning: "Cleaning",
  plumbing: "Plumbing",
  mold: "Mold remediation",
  electrical: "Electrical",
  hvac: "HVAC",
  general: "General maintenance",
};

export function ManagerCreateWorkOrderModal({
  open,
  onClose,
  onSubmitted,
  managerUserId,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: (bucket: ManagerWorkOrderBucket) => void;
  managerUserId: string | null;
  defaultPropertyId?: string;
}) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WorkOrderCategory>("general");
  const [priority, setPriority] = useState("Medium");
  const [propertyId, setPropertyId] = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [cost, setCost] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"none" | "pending" | "paid">("paid");
  const [bucket, setBucket] = useState<ManagerWorkOrderBucket>("completed");

  useEffect(() => {
    if (!open) return;
    void syncPropertyPipelineFromServer().then(() => setTick((t) => t + 1));
    void syncManagerApplicationsFromServer().then(() => setTick((t) => t + 1));
    const onProps = () => setTick((t) => t + 1);
    const onApps = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProps);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProps);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setTitle("");
      setDescription("");
      setCategory("general");
      setPriority("Medium");
      setPropertyId(defaultPropertyId?.trim() || "");
      setResidentEmail("");
      setCost("");
      setPaymentStatus("paid");
      setBucket("completed");
    });
  }, [open, defaultPropertyId]);

  const propertyOptions = useMemo(() => {
    void tick;
    return buildPropertyOptions(managerUserId);
  }, [managerUserId, tick]);

  const residentOptions = useMemo(() => {
    void tick;
    return buildResidentOptions(managerUserId);
  }, [managerUserId, tick]);

  const residentsForProperty = useMemo(() => {
    const property = propertyOptions.find((p) => p.propertyId === propertyId);
    if (!property) return residentOptions;
    return residentOptions.filter((r) => residentMatchesProperty(r, property));
  }, [propertyId, propertyOptions, residentOptions]);

  const selectedResident = useMemo(
    () => residentOptions.find((r) => r.residentEmail === residentEmail) ?? null,
    [residentEmail, residentOptions],
  );

  const selectedProperty = useMemo(
    () => propertyOptions.find((p) => p.propertyId === propertyId) ?? null,
    [propertyId, propertyOptions],
  );

  const submit = () => {
    if (busy) return;
    if (!title.trim()) {
      showToast("Add a title for the work order.");
      return;
    }
    if (!propertyId || !selectedProperty) {
      showToast("Choose a property.");
      return;
    }
    if (!residentEmail || !selectedResident) {
      showToast("Choose a resident.");
      return;
    }
    const amt = cost.trim() ? parseMoneyAmount(cost) : 0;
    if (cost.trim() && (!Number.isFinite(amt) || amt <= 0)) {
      showToast("Enter a valid cost or leave it blank.");
      return;
    }
    if (amt > 0 && paymentStatus === "none") {
      showToast("Choose whether the resident payment is pending or already paid.");
      return;
    }

    setBusy(true);
    try {
      const now = new Date();
      const id = `MGR-WO-${now.getTime()}`;
      const costLabel = amt > 0 ? `$${amt.toFixed(2)}` : "—";
      const statusLabel =
        bucket === "completed" ? "Completed" : bucket === "scheduled" ? "Scheduled" : "Logged";
      const row: DemoManagerWorkOrderRow = {
        id,
        propertyName: selectedProperty.propertyLabel,
        propertyId,
        assignedPropertyId: propertyId,
        assignedRoomChoice: selectedResident.assignedRoomChoice,
        managerUserId,
        unit: selectedResident.roomLabel || "—",
        title: title.trim(),
        priority,
        status: statusLabel,
        bucket,
        description:
          description.trim() ||
          `${CATEGORY_LABELS[category]} — logged by manager.${amt > 0 ? ` Cost: ${costLabel}.` : ""}`,
        scheduled: bucket === "scheduled" ? now.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—",
        scheduledAtIso: bucket === "scheduled" ? now.toISOString() : undefined,
        cost: costLabel,
        residentName: selectedResident.residentName,
        residentEmail: selectedResident.residentEmail,
        category,
        managerInitiated: true,
        completedAt: bucket === "completed" ? now.toISOString() : undefined,
        workDoneSummary: bucket === "completed" ? title.trim() : undefined,
      };

      if (amt > 0 && paymentStatus !== "none") {
        const effectiveManagerId = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
        const charge = recordWorkOrderResidentCharge({
          managerUserId: effectiveManagerId,
          workOrderId: id,
          propertyId,
          propertyLabel: selectedProperty.propertyLabel,
          unit: selectedResident.roomLabel || "—",
          workOrderTitle: title.trim(),
          amountInput: cost,
          residentEmail: selectedResident.residentEmail,
          residentName: selectedResident.residentName,
          initialStatus: paymentStatus === "paid" ? "paid" : "pending",
        });
        if (!charge) {
          showToast("Could not create the payment line. The work order was not saved.");
          return;
        }
      }

      writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);

      showToast(
        amt > 0 && paymentStatus === "paid"
          ? "Work order logged and payment recorded as paid."
          : amt > 0
            ? "Work order logged with a pending payment line."
            : "Work order logged.",
      );
      onSubmitted(bucket);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log work order">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Record work you already performed (e.g. lockout assistance) with optional cost and payment status for Finances.
        </p>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Title *
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lockout assistance"
            disabled={busy}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Details
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was done, when, any notes for your records…"
            disabled={busy}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <Select value={category} onChange={(e) => setCategory(e.target.value as WorkOrderCategory)} disabled={busy}>
              {(Object.keys(CATEGORY_LABELS) as WorkOrderCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Priority
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </Select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Property *
          <Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setResidentEmail(""); }} disabled={busy}>
            <option value="">Select property</option>
            {propertyOptions.map((p) => (
              <option key={p.propertyId} value={p.propertyId}>
                {p.propertyLabel}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Resident *
          <Select value={residentEmail} onChange={(e) => setResidentEmail(e.target.value)} disabled={busy || !propertyId}>
            <option value="">{propertyId ? "Select resident" : "Choose a property first"}</option>
            {residentsForProperty.map((r) => (
              <option key={r.residentEmail} value={r.residentEmail}>
                {r.residentName}{r.roomLabel ? ` · ${r.roomLabel}` : ""}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Cost (USD)
            <Input
              type="text"
              inputMode="decimal"
              value={cost}
              onChange={(e) => {
                const next = e.target.value;
                setCost(next);
                if (!next.trim()) setPaymentStatus("none");
                else if (paymentStatus === "none") setPaymentStatus("paid");
              }}
              placeholder="e.g. 25"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Payment status
            <Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as "none" | "pending" | "paid")}
              disabled={busy || !cost.trim()}
            >
              <option value="none">No charge</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </Select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Status
          <Select value={bucket} onChange={(e) => setBucket(e.target.value as ManagerWorkOrderBucket)} disabled={busy}>
            <option value="completed">Completed — work already done</option>
            <option value="open">Open — needs scheduling</option>
            <option value="scheduled">Scheduled — visit planned</option>
          </Select>
        </label>

        <div className="flex justify-start gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save work order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

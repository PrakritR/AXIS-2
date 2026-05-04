"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_HEAD_ROW,
} from "@/components/portal/portal-data-table";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  createManagerCharge,
  chargeDueLabel,
  deleteHouseholdCharge,
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  findPendingWorkOrderCharge,
  markHouseholdChargePaid,
  parseMoneyAmount,
  readChargesForManagerResident,
  recordWorkOrderResidentCharge,
  syncHouseholdChargesFromServer,
  updateHouseholdChargeAmount,
  type HouseholdCharge,
} from "@/lib/household-charges";
import {
  appendManagerApplicationRow,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  writeManagerApplicationRows,
  MANAGER_APPLICATIONS_EVENT,
  normalizeApplicationAxisId,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomChoiceLabel, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  appendLeaseThreadMessage,
  deleteLeasePipelineRow,
  generateLeaseHtmlForRow,
  managerSignLease,
  LEASE_PIPELINE_EVENT,
  managerUploadLeasePdf,
  readLeasePipeline,
  residentCanViewLeaseRow,
  sendLeaseBackToManager,
  sendLeaseToResident,
  syncLeasePipelineFromServer,
  downloadLeaseFromRow,
  printLeaseAsPdf,
  hasBothLeaseSignatures,
  residentHasSignedLease,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  deleteManagerWorkOrderRow,
} from "@/lib/manager-work-orders-storage";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  persistInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";

type ActiveResident = {
  id: string;
  name: string;
  email: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  signedMonthlyRent: number | null;
  axisId: string;
  manuallyAdded?: boolean;
  moveInInstructions?: string;
  manualResidentDetails?: NonNullable<import("@/data/demo-portal").DemoApplicantRow["manualResidentDetails"]>;
  isPrevious: boolean;
};

type ResidentsTabId = "current" | "previous";

const PREVIOUS_RESIDENT_STAGE_TOKENS = ["moved out", "previous", "past", "former", "inactive"];

function isPreviousResidentRow(row: DemoApplicantRow): boolean {
  const moveOut = row.manualResidentDetails?.moveOutDate?.trim();
  if (moveOut) {
    const moveOutDate = new Date(`${moveOut}T23:59:59`);
    if (!Number.isNaN(moveOutDate.getTime()) && moveOutDate.getTime() < Date.now()) {
      return true;
    }
  }
  const stage = row.stage.trim().toLowerCase();
  return PREVIOUS_RESIDENT_STAGE_TOKENS.some((token) => stage.includes(token));
}

const AR_LEASE_TERM_CUSTOM = "__custom__";
const AR_LEASE_TERM_PRESETS = ["Month-to-month", "12 months", "6 months", "3 months"] as const;

function statusPill(status: "pending" | "paid") {
  return status === "paid"
    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
    : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
}

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function previewLine(body: string, max = 120) {
  const normalized = body.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s: string): string | null {
  if (!s.trim()) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatScheduledLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ResidentWorkOrderCostEditor({
  row,
  onSaved,
  managerUserId,
}: {
  row: DemoManagerWorkOrderRow;
  onSaved: () => void;
  managerUserId: string | null;
}) {
  const { showToast } = useAppUi();
  const [hcTick, setHcTick] = useState(0);
  const initialVal = row.cost !== "—" && row.cost.trim() ? row.cost.replace(/^\$/, "") : "";
  const [val, setVal] = useState(initialVal);
  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const pendingCharge = findPendingWorkOrderCharge(row.id);
  void hcTick;

  if (row.bucket === "completed") {
    return <span className="text-slate-700">{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</span>;
  }

  if (pendingCharge) {
    return <span className="text-xs text-slate-600">Pending payment · {pendingCharge.balanceLabel}</span>;
  }

  const apply = () => {
    const trimmed = val.trim();
    if (!trimmed) {
      updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: "—" }));
      onSaved();
      showToast("Cost cleared.");
      return;
    }
    const amt = parseMoneyAmount(trimmed);
    if (!Number.isFinite(amt) || amt < 0) {
      showToast("Enter a valid dollar amount (0 or more) or clear the field.");
      return;
    }
    updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: `$${amt.toFixed(2)}` }));
    const residentEmail = row.residentEmail?.trim() ?? "";
    const residentName = row.residentName?.trim() ?? "";
    const createdCharge =
      residentEmail && residentEmail.includes("@")
        ? recordWorkOrderResidentCharge({
            managerUserId: managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
            workOrderId: row.id,
            propertyLabel: row.propertyName,
            unit: row.unit,
            workOrderTitle: row.title,
            amountInput: trimmed,
            residentEmail,
            residentName,
          })
        : null;
    onSaved();
    showToast(createdCharge ? "Cost saved and payment created." : "Cost saved — visible to the resident.");
  };

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="e.g. 75"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 w-[5.5rem] rounded-md text-xs"
      />
      <Button type="button" variant="outline" className="h-8 rounded-full px-2 py-0 text-[10px]" onClick={apply}>
        Save
      </Button>
    </div>
  );
}

function chargeEditAmountValue(charge: HouseholdCharge): string {
  return String(centsFromLabel(charge.balanceLabel) / 100 || centsFromLabel(charge.amountLabel) / 100 || "").replace(/\.0+$/, "");
}

export function ManagerResidents({ tabId = "current" }: { tabId?: ResidentsTabId }) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [workOrderTick, setWorkOrderTick] = useState(0);
  const [inboxTick, setInboxTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentsTab, setResidentsTab] = useState<ResidentsTabId>(tabId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [editChargeId, setEditChargeId] = useState<string | null>(null);
  const [editChargeKind, setEditChargeKind] = useState<HouseholdCharge["kind"] | null>(null);
  const [chargeTitle, setChargeTitle] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeBlocksLease, setChargeBlocksLease] = useState(false);
  const [chargeTab, setChargeTab] = useState<"pending" | "paid">("pending");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [uploadingLeaseRowId, setUploadingLeaseRowId] = useState<string | null>(null);
  const [generatingLeaseRowId, setGeneratingLeaseRowId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [signingLease, setSigningLease] = useState<LeasePipelineRow | null>(null);
  const [visitAtById, setVisitAtById] = useState<Record<string, string>>({});

  // Add resident manually
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [arName, setArName] = useState("");
  const [arEmail, setArEmail] = useState("");
  const [arPropertyId, setArPropertyId] = useState("");
  const [arRoomId, setArRoomId] = useState("");
  const [arLeaseTerm, setArLeaseTerm] = useState("");
  const [arMoveInDate, setArMoveInDate] = useState("");
  const [arMoveOutDate, setArMoveOutDate] = useState("");
  const [arRent, setArRent] = useState("");
  const [arUtilities, setArUtilities] = useState("");
  const [arMoveInFee, setArMoveInFee] = useState("");
  const [arSecurityDeposit, setArSecurityDeposit] = useState("");
  const [arNotes, setArNotes] = useState("");

  // Per-resident move-in instructions editing
  const [editMoveInId, setEditMoveInId] = useState<string | null>(null);
  const [editMoveInText, setEditMoveInText] = useState("");

  useEffect(() => {
    setResidentsTab(tabId);
  }, [tabId]);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    const onStorage = (e: StorageEvent) => {
      if (e.key === HOUSEHOLD_CHARGES_SESSION_KEY) on();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const onLease = () => setLeaseTick((n) => n + 1);
    const onWorkOrder = () => setWorkOrderTick((n) => n + 1);
    const onInbox = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const detail = (evt as CustomEvent<{ key?: string }>).detail;
        if (detail?.key && detail.key !== MANAGER_INBOX_STORAGE_KEY) return;
      }
      setInboxTick((n) => n + 1);
    };
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    };
  }, []);

  useEffect(() => {
    const bump = () => setPropertyTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    void Promise.allSettled([
      syncPropertyPipelineFromServer(),
      syncManagerApplicationsFromServer(),
      syncLeasePipelineFromServer(userId),
      syncManagerWorkOrdersFromServer(),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(),
    ]).then(() => {
      if (!cancelled) {
        setPropertyTick((n) => n + 1);
        setHcTick((n) => n + 1);
      }
    });
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY).then(() => {
      if (!cancelled) setInboxTick((n) => n + 1);
    });
    void syncManagerWorkOrdersFromServer().then(() => {
      if (!cancelled) setWorkOrderTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const emails = [
      ...new Set(
        readManagerApplicationRows()
          .filter(
            (row) =>
              row.bucket === "approved" &&
              row.email?.trim() &&
              applicationVisibleToPortalUser(row, userId),
          )
          .map((row) => row.email!.trim().toLowerCase()),
      ),
    ];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      return fetch("/api/manager/resident-account-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { emails?: string[] };
          if (!cancelled && res.ok) {
            setResidentAccountEmails(new Set((body.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean)));
          }
        })
        .catch(() => {
          if (!cancelled) setResidentAccountEmails(new Set());
        });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hcTick, propertyTick]);

  const residents = useMemo<ActiveResident[]>(() => {
    void hcTick;
    return readManagerApplicationRows()
      .filter((row) => row.bucket === "approved" && row.email?.trim() && applicationVisibleToPortalUser(row, userId))
      .filter((row) => {
        if (isPreviousResidentRow(row)) return true;
        return row.manuallyAdded || residentAccountEmails.has(row.email!.trim().toLowerCase());
      })
      .map((row) => {
        const propId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
        const prop = propId ? getPropertyById(propId) : null;
        const roomLabel =
          row.manualResidentDetails?.roomNumber?.trim() ||
          getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "").split(" · ")[0]?.trim() ||
          "";
        return {
          id: row.id,
          name: row.name,
          email: row.email!.trim(),
          propertyId: propId,
          propertyLabel: prop?.title?.trim() || row.property,
          roomLabel,
          signedMonthlyRent: row.signedMonthlyRent ?? null,
          axisId: normalizeApplicationAxisId(row.id),
          manuallyAdded: row.manuallyAdded,
          moveInInstructions: row.moveInInstructions,
          manualResidentDetails: row.manualResidentDetails,
          isPrevious: isPreviousResidentRow(row),
        };
      });
  }, [userId, hcTick, residentAccountEmails]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    const labelById = new Map<string, string>();
    if (userId) {
      for (const p of readExtraListingsForUser(userId)) {
        labelById.set(p.id, (p.title || p.buildingName || p.address || p.id).trim());
      }
      for (const p of readPendingManagerPropertiesForUser(userId)) {
        const label = [p.buildingName, p.address].filter(Boolean).join(" · ").trim() || p.id;
        labelById.set(p.id, label);
      }
    }
    for (const r of residents) {
      if (r.propertyId && !labelById.has(r.propertyId)) {
        labelById.set(r.propertyId, r.propertyLabel || r.propertyId);
      }
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [residents, userId, propertyTick]);

  const arRoomOptions = useMemo(() => {
    if (!arPropertyId || !userId) return [];
    const listing = readExtraListingsForUser(userId).find((p) => p.id === arPropertyId);
    if (!listing?.listingSubmission) return [];
    const sub = normalizeManagerListingSubmissionV1(listing.listingSubmission);
    return sub.rooms.map((r) => ({ id: r.id, name: r.name || r.id, monthlyRent: r.monthlyRent }));
  }, [arPropertyId, userId, propertyTick]);

  const arLeaseTermSelectValue = useMemo(() => {
    if (!arLeaseTerm.trim()) return "";
    return AR_LEASE_TERM_PRESETS.includes(arLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])
      ? arLeaseTerm
      : AR_LEASE_TERM_CUSTOM;
  }, [arLeaseTerm]);

  const isMonthToMonthLease = arLeaseTerm === "Month-to-month";

  useEffect(() => {
    if (isMonthToMonthLease && arMoveOutDate) {
      setArMoveOutDate("");
    }
  }, [isMonthToMonthLease, arMoveOutDate]);

  const filtered = useMemo(() => {
    const inTab = residents.filter((resident) => (residentsTab === "current" ? !resident.isPrevious : resident.isPrevious));
    const base = propertyFilter
      ? inTab.filter((r) => r.propertyId === propertyFilter)
      : inTab;
    return [...base].sort((a, b) => {
      const propCmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (propCmp !== 0) return propCmp;
      const aNum = parseInt(a.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      const bNum = parseInt(b.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      return aNum - bNum;
    });
  }, [residents, residentsTab, propertyFilter]);

  const currentResidentsCount = useMemo(() => residents.filter((resident) => !resident.isPrevious).length, [residents]);
  const previousResidentsCount = useMemo(() => residents.filter((resident) => resident.isPrevious).length, [residents]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  useEffect(() => {
    if (selectedId) setChargeTab("pending");
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (!filtered.some((resident) => resident.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const residentCharges = useMemo<HouseholdCharge[]>(() => {
    void hcTick;
    if (!selected?.email) return [];
    return readChargesForManagerResident(selected.email, userId ?? null);
  }, [selected, hcTick, userId]);

  const residentLease = useMemo<LeasePipelineRow | null>(() => {
    void leaseTick;
    if (!selected?.email) return null;
    const email = selected.email.trim().toLowerCase();
    const rows = readLeasePipeline(userId).filter((row) => row.residentEmail.trim().toLowerCase() === email);
    rows.sort((a, b) => {
      const visibleDelta = Number(residentCanViewLeaseRow(b)) - Number(residentCanViewLeaseRow(a));
      if (visibleDelta !== 0) return visibleDelta;
      const rank = (row: LeasePipelineRow) => {
        switch (row.status) {
          case "Fully Signed":
            return 5;
          case "Manager Signature Pending":
            return 4;
          case "Resident Signature Pending":
            return 3;
          case "Manager Review":
            return 2;
          case "Admin Review":
            return 1;
          default:
            return 0;
        }
      };
      const rankDelta = rank(b) - rank(a);
      if (rankDelta !== 0) return rankDelta;
      const aTs = Date.parse(a.updatedAtIso || "");
      const bTs = Date.parse(b.updatedAtIso || "");
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });
    return rows[0] ?? null;
  }, [leaseTick, selected, userId]);

  const residentWorkOrders = useMemo(() => {
    void workOrderTick;
    if (!selected?.email) return [];
    const email = selected.email.trim().toLowerCase();
    return readManagerWorkOrderRows()
      .filter((row) => row.residentEmail?.trim().toLowerCase() === email)
      .sort((a, b) => {
        const bucketOrder = { open: 0, scheduled: 1, completed: 2 } as const;
        const cmp = bucketOrder[a.bucket] - bucketOrder[b.bucket];
        if (cmp !== 0) return cmp;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });
  }, [selected, workOrderTick]);

  const residentInboxThreads = useMemo<PersistedInboxThread[]>(() => {
    void inboxTick;
    if (!selected?.email) return [];
    const email = selected.email.trim().toLowerCase();
    return loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
      .filter((thread) => thread.email.trim().toLowerCase() === email)
      .sort((a, b) => String(b.time).localeCompare(String(a.time)));
  }, [selected, inboxTick]);

  const chargeCounts = useMemo(
    () => ({
      pending: residentCharges.filter((c) => c.status === "pending").length,
      paid: residentCharges.filter((c) => c.status === "paid").length,
    }),
    [residentCharges],
  );

  const visibleCharges = useMemo(
    () => residentCharges.filter((c) => c.status === chargeTab),
    [residentCharges, chargeTab],
  );

  const pendingBalance = useMemo(
    () =>
      residentCharges
        .filter((c) => c.status === "pending")
        .reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0),
    [residentCharges],
  );

  function openAddCharge() {
    setChargeTitle("");
    setChargeAmount("");
    setChargeBlocksLease(false);
    setEditChargeId(null);
    setEditChargeKind(null);
    setAddChargeOpen(true);
  }

  function openEditCharge(charge: HouseholdCharge) {
    setEditChargeId(charge.id);
    setEditChargeKind(charge.kind);
    setChargeTitle(charge.title);
    setChargeAmount(chargeEditAmountValue(charge));
    setChargeBlocksLease(charge.blocksLeaseUntilPaid);
    setAddChargeOpen(true);
  }

  function submitCharge() {
    if (!selected) return;
    const amount = Number.parseFloat(chargeAmount);
    if (!chargeTitle.trim()) {
      showToast("Enter a charge title.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid amount.");
      return;
    }
    if (editChargeId) {
      const updated = updateHouseholdChargeAmount(editChargeId, amount, userId ?? null, chargeTitle.trim());
      if (updated) {
        if (selected && editChargeKind) {
          const nextRows = readManagerApplicationRows().map((row) => {
            if (row.id !== selected.id || !row.application) return row;
            if (editChargeKind === "security_deposit") {
              return { ...row, application: { ...row.application, managerSecurityDepositOverride: String(amount) } };
            }
            if (editChargeKind === "move_in_fee") {
              return { ...row, application: { ...row.application, managerMoveInFeeOverride: String(amount) } };
            }
            if (editChargeKind === "utilities" || editChargeKind === "prorated_utilities") {
              return { ...row, application: { ...row.application, managerUtilitiesOverride: String(amount) } };
            }
            if (editChargeKind === "first_month_rent" || editChargeKind === "prorated_rent" || editChargeKind === "rent") {
              return {
                ...row,
                signedMonthlyRent: amount,
                application: { ...row.application, managerRentOverride: String(amount) },
              };
            }
            return row;
          });
          writeManagerApplicationRows(nextRows);
        }
        showToast("Charge updated.");
        setAddChargeOpen(false);
        setEditChargeId(null);
        setEditChargeKind(null);
        setChargeTab("pending");
      } else {
        showToast("Could not update charge.");
      }
      return;
    }
    const result = createManagerCharge({
      residentEmail: selected.email,
      residentName: selected.name,
      propertyId: selected.propertyId || "unknown",
      propertyLabel: selected.propertyLabel,
      managerUserId: userId ?? null,
      title: chargeTitle.trim(),
      amount,
      blocksLeaseUntilPaid: chargeBlocksLease,
    });
    if (result) {
      showToast("Charge added.");
      setAddChargeOpen(false);
      setChargeTab("pending");
    } else {
      showToast("Could not add charge.");
    }
  }

  function sendResidentMessage() {
    if (!selected) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();
    if (!subject || !body) {
      showToast("Add a subject and message.");
      return;
    }
    const when = new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const next = [
      {
        id: `sent_${Date.now()}`,
        folder: "sent" as const,
        from: "You",
        email: selected.email,
        subject,
        preview: previewLine(body),
        body,
        time: when,
        unread: false,
      },
      ...loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []),
    ];
    persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
    setMessageSubject("");
    setMessageBody("");
    setMessageOpen(false);
    setInboxTick((n) => n + 1);
    showToast("Message saved to this resident thread.");
  }

  function saveManualResident() {
    if (!arName.trim()) { showToast("Enter the resident's name."); return; }
    if (!arEmail.trim()) { showToast("Enter the resident's email."); return; }
    const rent = arRent.trim() ? Number(arRent.replace(/[^\d.]/g, "")) : null;
    const utilities = arUtilities.trim() ? Number(arUtilities.replace(/[^\d.]/g, "")) : null;
    const moveInFee = arMoveInFee.trim() ? Number(arMoveInFee.replace(/[^\d.]/g, "")) : null;
    const secDeposit = arSecurityDeposit.trim() ? Number(arSecurityDeposit.replace(/[^\d.]/g, "")) : null;
    const axisId = `AXIS-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    const propLabel = arPropertyId
      ? (propertyOptions.find((p) => p.id === arPropertyId)?.label ?? arPropertyId)
      : "—";
    const propId = arPropertyId || "manual";
    const selectedRoomLabel = arRoomId ? arRoomOptions.find((room) => room.id === arRoomId)?.name?.trim() ?? "" : "";
    appendManagerApplicationRow({
      id: axisId,
      name: arName.trim(),
      email: arEmail.trim(),
      property: propLabel,
      stage: "Active",
      bucket: "approved",
      detail: "",
      assignedPropertyId: arPropertyId || undefined,
      assignedRoomChoice: arPropertyId && arRoomId ? `${arPropertyId}${LISTING_ROOM_CHOICE_SEP}${arRoomId}` : undefined,
      signedMonthlyRent: rent ?? undefined,
      managerUserId: userId ?? undefined,
      manuallyAdded: true,
      manualResidentDetails: {
        moveInDate: arMoveInDate || undefined,
        moveOutDate: arMoveOutDate || undefined,
        monthlyUtilities: utilities ?? undefined,
        moveInFee: moveInFee ?? undefined,
        securityDeposit: secDeposit ?? undefined,
        roomNumber: selectedRoomLabel || undefined,
        leaseTerm: arLeaseTerm || undefined,
        notes: arNotes.trim() || undefined,
      },
    });
    // Auto-create pending charges for every monetary field filled in
    const chargeBase = {
      residentEmail: arEmail.trim(),
      residentName: arName.trim(),
      propertyId: propId,
      propertyLabel: propLabel,
      managerUserId: userId ?? null,
    };
    if (rent && rent > 0) createManagerCharge({ ...chargeBase, title: "First month rent", amount: rent, blocksLeaseUntilPaid: true });
    if (secDeposit && secDeposit > 0) createManagerCharge({ ...chargeBase, title: "Security deposit", amount: secDeposit, blocksLeaseUntilPaid: true });
    if (moveInFee && moveInFee > 0) createManagerCharge({ ...chargeBase, title: "Move-in fee", amount: moveInFee, blocksLeaseUntilPaid: true });
    if (utilities && utilities > 0) createManagerCharge({ ...chargeBase, title: "First month utilities", amount: utilities });
    void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
    setChargeTab("pending");
    setArName(""); setArEmail(""); setArPropertyId(""); setArRoomId(""); setArLeaseTerm("");
    setArMoveInDate(""); setArMoveOutDate(""); setArRent(""); setArUtilities("");
    setArMoveInFee(""); setArSecurityDeposit(""); setArNotes("");
    setAddResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast(`Resident added — Axis ID: ${axisId}`);
  }

  function saveMoveInInstructions() {
    if (!editMoveInId) return;
    const rows = readManagerApplicationRows().map((row) =>
      row.id === editMoveInId ? { ...row, moveInInstructions: editMoveInText.trim() || undefined } : row,
    );
    writeManagerApplicationRows(rows);
    setEditMoveInId(null);
    setHcTick((n) => n + 1);
    showToast("Move-in instructions saved.");
  }

  function deleteSelectedResident() {
    if (!selected) return;
    if (!window.confirm(`Delete resident ${selected.name || selected.email}? This cannot be undone.`)) return;

    const allRows = readManagerApplicationRows();
    if (!allRows.some((row) => row.id === selected.id)) {
      showToast("Resident not found.");
      return;
    }
    writeManagerApplicationRows(allRows.filter((row) => row.id !== selected.id));

    const residentEmail = selected.email.trim().toLowerCase();
    const residentCharges = readChargesForManagerResident(selected.email, userId ?? null);
    for (const charge of residentCharges) {
      deleteHouseholdCharge(charge.id, userId ?? null);
    }

    const residentLeases = readLeasePipeline(userId).filter(
      (row) => row.residentEmail.trim().toLowerCase() === residentEmail,
    );
    for (const leaseRow of residentLeases) {
      deleteLeasePipelineRow(leaseRow.id);
    }

    const residentWorkOrders = readManagerWorkOrderRows().filter(
      (row) => row.residentEmail?.trim().toLowerCase() === residentEmail,
    );
    for (const workOrder of residentWorkOrders) {
      deleteManagerWorkOrderRow(workOrder.id);
    }

    const nextInbox = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []).filter(
      (thread) => thread.email.trim().toLowerCase() !== residentEmail,
    );
    persistInbox(MANAGER_INBOX_STORAGE_KEY, nextInbox);

    setSelectedId(null);
    setHcTick((n) => n + 1);
    setLeaseTick((n) => n + 1);
    setWorkOrderTick((n) => n + 1);
    setInboxTick((n) => n + 1);
    showToast("Resident deleted.");
  }

  function markPaid(chargeId: string) {
    if (markHouseholdChargePaid(chargeId, userId ?? null)) {
      showToast("Marked as paid.");
      setHcTick((n) => n + 1);
      void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
    }
  }

  function generateLeaseDeferred(rowId: string) {
    if (generatingLeaseRowId) return;
    setGeneratingLeaseRowId(rowId);
    window.setTimeout(() => {
      try {
        const result = generateLeaseHtmlForRow(rowId);
        if (result.ok) {
          setLeaseTick((n) => n + 1);
          showToast(`Lease generated (v${result.version}).`);
        } else {
          showToast(result.error);
        }
      } finally {
        setGeneratingLeaseRowId(null);
      }
    }, 0);
  }

  function signLeaseAsManager(row: LeasePipelineRow) {
    if (row.managerUploadedPdf?.dataUrl) {
      showToast("Uploaded PDF leases should be signed offline and re-uploaded, not electronically signed here.");
      return;
    }
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign the lease before you can countersign.");
      return;
    }
    setSigningLease(row);
  }

  function handleManagerModalSign(signatureName: string) {
    if (!signingLease) return false;
    if (managerSignLease(signingLease.id, signatureName.trim())) {
      setLeaseTick((n) => n + 1);
      showToast(
        hasBothLeaseSignatures({
          ...signingLease,
          managerSignature: { role: "manager", name: signatureName.trim(), signedAtIso: new Date().toISOString() },
        })
          ? "Lease fully signed."
          : "Manager signature saved.",
      );
      setSigningLease(null);
      return true;
    } else {
      showToast("Could not sign lease.");
      return false;
    }
  }

  return (
    <>
      {signingLease ? (
        <LeaseSigningModal
          row={signingLease}
          signerName=""
          signerRoleLabel="Manager / authorized agent name"
          agreementLabel="Residential Room Rental Agreement"
          onSign={handleManagerModalSign}
          onClose={() => setSigningLease(null)}
        />
      ) : null}
      <ManagerPortalPageShell
        title="Residents"
        titleAside={
          <>
            <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200/90 bg-slate-100/70 p-1">
              <button
                type="button"
                onClick={() => setResidentsTab("current")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  residentsTab === "current" ? "bg-slate-900 text-white" : "bg-transparent text-slate-600 hover:bg-white"
                }`}
              >
                Current ({currentResidentsCount})
              </button>
              <button
                type="button"
                onClick={() => setResidentsTab("previous")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  residentsTab === "previous" ? "bg-slate-900 text-white" : "bg-transparent text-slate-600 hover:bg-white"
                }`}
              >
                Previous ({previousResidentsCount})
              </button>
            </div>
            <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setAddResidentOpen(true)}>
              + Add resident
            </Button>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
          </>
        }
      >
      {filtered.length === 0 ? (
        <PortalDataTableEmpty
          message={
            residents.length === 0
              ? "No residents yet. Residents appear here after approval and once they create an Axis resident account."
              : residentsTab === "current"
                ? "No current residents match the current filter."
                : "No previous residents match the current filter."
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[680px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Email</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Monthly rent</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((res) => (
                  <Fragment key={res.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{res.name || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.email}</td>
                      <td className={PORTAL_TABLE_TD}>{res.propertyLabel || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.roomLabel || "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                        {res.signedMonthlyRent ? `$${res.signedMonthlyRent.toFixed(2)}/mo` : "—"}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full px-3 py-1 text-xs"
                          onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
                        >
                          {selectedId === res.id ? "Close" : "Manage"}
                        </Button>
                      </td>
                    </tr>
                    {selectedId === res.id && selected ? (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/60 px-4 py-5">
                          <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-rose-50"
                                  onClick={deleteSelectedResident}
                                >
                                  Delete resident
                                </Button>
                              </div>
                              <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <span className="text-slate-500">Axis ID</span>
                                  <p className="font-mono font-medium text-slate-900">{selected.axisId}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Email</span>
                                  <p className="font-medium text-slate-900">{selected.email}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Property</span>
                                  <p className="font-medium text-slate-900">{selected.propertyLabel || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Room</span>
                                  <p className="font-medium text-slate-900">{selected.roomLabel || "—"}</p>
                                </div>
                                {selected.signedMonthlyRent ? (
                                  <div>
                                    <span className="text-slate-500">Monthly rent</span>
                                    <p className="font-semibold text-slate-900">${selected.signedMonthlyRent.toFixed(2)}/mo</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveInDate ? (
                                  <div>
                                    <span className="text-slate-500">Move-in date</span>
                                    <p className="font-medium text-slate-900">{selected.manualResidentDetails.moveInDate}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveOutDate ? (
                                  <div>
                                    <span className="text-slate-500">Move-out date</span>
                                    <p className="font-medium text-slate-900">{selected.manualResidentDetails.moveOutDate}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.monthlyUtilities ? (
                                  <div>
                                    <span className="text-slate-500">Monthly utilities</span>
                                    <p className="font-medium text-slate-900">${selected.manualResidentDetails.monthlyUtilities}/mo</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveInFee ? (
                                  <div>
                                    <span className="text-slate-500">Move-in fee</span>
                                    <p className="font-medium text-slate-900">${selected.manualResidentDetails.moveInFee}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.securityDeposit ? (
                                  <div>
                                    <span className="text-slate-500">Security deposit</span>
                                    <p className="font-medium text-slate-900">${selected.manualResidentDetails.securityDeposit}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.notes ? (
                                  <div className="sm:col-span-2 lg:col-span-3">
                                    <span className="text-slate-500">Notes</span>
                                    <p className="whitespace-pre-wrap font-medium text-slate-900">{selected.manualResidentDetails.notes}</p>
                                  </div>
                                ) : null}
                                <div>
                                  <span className="text-slate-500">Status</span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                                      Active resident
                                    </span>
                                    {selected.manuallyAdded ? (
                                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                        Manually added
                                      </span>
                                    ) : null}
                                    {selected.signedMonthlyRent ? (
                                      <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200/80">
                                        Rent set
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/80">
                                        No rent set
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Move-in instructions</p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Keys, access codes, parking, utilities start, what to bring — shown on the resident Move-in tab.
                                  </p>
                                </div>
                                {editMoveInId !== selected.id ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full px-3 py-1 text-xs"
                                    onClick={() => { setEditMoveInId(selected.id); setEditMoveInText(selected.moveInInstructions ?? ""); }}
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                              </div>
                              {editMoveInId === selected.id ? (
                                <div className="mt-3 space-y-2">
                                  <Textarea
                                    className="min-h-[100px]"
                                    value={editMoveInText}
                                    onChange={(e) => setEditMoveInText(e.target.value)}
                                    placeholder="e.g. Front gate code is 1234. Each room has a lockbox with key inside."
                                  />
                                  <div className="flex gap-2">
                                    <Button type="button" variant="primary" className="rounded-full text-xs" onClick={saveMoveInInstructions}>Save</Button>
                                    <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setEditMoveInId(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                                  {selected.moveInInstructions?.trim() || <span className="text-slate-400">No instructions set yet.</span>}
                                </p>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lease</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {residentLease
                                      ? `${residentLease.status ?? residentLease.stageLabel} · ${residentLease.application?.leaseStart || "No move-in"}${residentLease.application?.leaseEnd ? ` to ${residentLease.application.leaseEnd}` : ""}`
                                      : "No lease created yet for this resident."}
                                  </p>
                                </div>
                                {residentLease ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      disabled={generatingLeaseRowId === residentLease.id}
                                      onClick={() => generateLeaseDeferred(residentLease.id)}
                                    >
                                      {generatingLeaseRowId === residentLease.id ? "Generating..." : "Generate lease"}
                                    </Button>
                                    {!residentLease.managerSignature && residentHasSignedLease(residentLease) && !residentLease.managerUploadedPdf?.dataUrl ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        disabled={!residentLease.generatedHtml}
                                        onClick={() => signLeaseAsManager(residentLease)}
                                      >
                                        Sign as manager
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={() => {
                                        if (residentLease.managerUploadedPdf?.dataUrl) {
                                          downloadLeaseFromRow(residentLease);
                                        } else if (residentLease.generatedHtml) {
                                          printLeaseAsPdf(residentLease);
                                        } else {
                                          showToast("Generate or upload a lease first.");
                                          return;
                                        }
                                        showToast("Lease download started.");
                                      }}
                                    >
                                      Download lease
                                    </Button>
                                    {residentLease.status === "Manager Review" || residentLease.status === "Draft" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          if (!residentAccountEmails.has(selected.email.trim().toLowerCase())) {
                                            showToast("Resident must create their account before the lease can be sent.");
                                            return;
                                          }
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Sent lease to resident for review and signature.");
                                          if (sendLeaseToResident(residentLease.id)) {
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease moved to Resident Signature Pending.");
                                          } else {
                                            showToast("Could not send this lease yet. Generate or upload the active lease document first.");
                                          }
                                        }}
                                      >
                                        Send to resident
                                      </Button>
                                    ) : residentLease.status === "Resident Signature Pending" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Moved lease back to manager review.");
                                          if (sendLeaseBackToManager(residentLease.id)) {
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease moved to Manager Review.");
                                          } else {
                                            showToast("Could not move this lease back right now.");
                                          }
                                        }}
                                      >
                                        Move to manager review
                                      </Button>
                                    ) : null}
                                    <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">
                                      {uploadingLeaseRowId === residentLease.id ? "Uploading..." : "Upload PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="sr-only"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file || !residentLease) return;
                                          setUploadingLeaseRowId(residentLease.id);
                                          const result = await managerUploadLeasePdf(residentLease.id, file);
                                          setUploadingLeaseRowId(null);
                                          e.currentTarget.value = "";
                                          if (result.ok) {
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease PDF uploaded.");
                                          } else {
                                            showToast(result.error ?? "Upload failed.");
                                          }
                                        }}
                                      />
                                    </label>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-rose-50"
                                      onClick={() => {
                                        if (!window.confirm(`Delete the lease for ${selected.name}? This cannot be undone.`)) return;
                                        if (deleteLeasePipelineRow(residentLease.id)) {
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease deleted.");
                                        } else {
                                          showToast("Could not delete lease.");
                                        }
                                      }}
                                    >
                                      Delete lease
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                              {residentLease ? (
                                <div className="mt-4">
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lease document</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Single active lease document. Signatures are applied to this same lease as the workflow advances.
                                    </p>
                                  </div>
                                  <LeaseDocumentPreview
                                    className="mt-3"
                                    row={residentLease}
                                    emptyHint="No lease document yet. Generate or upload one from Manager Review first."
                                  />
                                  {residentLease.thread.length ? (
                                    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lease messages</p>
                                          <p className="mt-1 text-sm text-slate-500">
                                            Resident edit requests and lease-specific updates appear here.
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                          {residentLease.stageLabel}
                                        </span>
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {residentLease.thread.map((message) => (
                                          <div key={message.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              {message.role}
                                              <span className="normal-case tracking-normal text-slate-400">
                                                {" "}
                                                · {new Date(message.at).toLocaleString()}
                                              </span>
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-slate-500">Approve the application and create or generate a lease here for this resident.</p>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Charges</p>
                                <Button
                                  type="button"
                                  variant="primary"
                                  className="rounded-full px-3 py-1 text-xs"
                                  onClick={openAddCharge}
                                >
                                  Add charge
                                </Button>
                              </div>
                              <div className="mt-3 flex gap-2">
                                {(["pending", "paid"] as const).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setChargeTab(t)}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                      chargeTab === t
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    }`}
                                  >
                                    {t === "pending" ? "Pending" : "Paid"}
                                    <span className="ml-1 tabular-nums opacity-90">
                                      ({t === "pending" ? chargeCounts.pending : chargeCounts.paid})
                                    </span>
                                  </button>
                                ))}
                                {pendingBalance > 0 ? (
                                  <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                                    ${(pendingBalance / 100).toFixed(2)} due
                                  </span>
                                ) : null}
                              </div>
                              {visibleCharges.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">
                                  {residentCharges.length === 0
                                    ? "No charges for this resident yet. Approve their application with rent and deposit saved, or add a charge."
                                    : chargeTab === "pending"
                                      ? "No pending charges."
                                      : "No paid charges."}
                                </p>
                              ) : (
                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-200">
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Charge</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Due</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Balance</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Status</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleCharges.map((c) => (
                                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                                          <td className="py-2 pr-4 font-medium text-slate-900">{c.title}</td>
                                          <td className="py-2 pr-4 text-xs text-slate-600">{chargeDueLabel(c)}</td>
                                          <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{c.amountLabel}</td>
                                          <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-800">{c.balanceLabel}</td>
                                          <td className="py-2 pr-4 text-right">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(c.status)}`}>
                                              {c.status === "paid" ? "Paid" : "Pending"}
                                            </span>
                                          </td>
                                          <td className="py-2 text-right">
                                            <div className="flex justify-end gap-2">
                                              {c.status === "pending" ? (
                                                <>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-full px-2 py-0.5 text-xs"
                                                    onClick={() => openEditCharge(c)}
                                                  >
                                                    Edit
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-full px-2 py-0.5 text-xs"
                                                    onClick={() => markPaid(c.id)}
                                                  >
                                                    Mark paid
                                                  </Button>
                                                </>
                                              ) : (
                                                <span className="text-xs text-slate-400">
                                                  {c.paidAt
                                                    ? new Date(c.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                                    : "—"}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Work orders</p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Review and manage work orders submitted by this resident here.
                                  </p>
                                </div>
                              </div>
                              {residentWorkOrders.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">No work orders for this resident yet.</p>
                              ) : (
                                <div className="mt-4 space-y-4">
                                  {residentWorkOrders.map((workOrder) => {
                                    const pendingCharge = findPendingWorkOrderCharge(workOrder.id);
                                    return (
                                      <div key={workOrder.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-base font-semibold text-slate-900">{workOrder.title}</p>
                                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                                {workOrder.priority}
                                              </span>
                                              <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                                {workOrder.status}
                                              </span>
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{workOrder.description}</p>
                                            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preferred arrival</p>
                                                <p className="mt-1 text-slate-800">{workOrder.preferredArrival?.trim() || "Anytime"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visit</p>
                                                <p className="mt-1 text-slate-800">{workOrder.scheduled && workOrder.scheduled !== "—" ? workOrder.scheduled : "Not scheduled"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current cost</p>
                                                <p className="mt-1 text-slate-800">{workOrder.cost !== "—" && workOrder.cost.trim() ? workOrder.cost : "—"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment</p>
                                                <p className="mt-1 text-slate-800">{pendingCharge ? `Pending · ${pendingCharge.balanceLabel}` : "No pending payment"}</p>
                                              </div>
                                            </div>
                                            {workOrder.photoDataUrls?.length ? (
                                              <div className="mt-4">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Photos</p>
                                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                                  {workOrder.photoDataUrls.map((src, index) => (
                                                    <a
                                                      key={`${workOrder.id}-photo-${index}`}
                                                      href={src}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
                                                    >
                                                      <Image
                                                        src={src}
                                                        alt={`Work order photo ${index + 1}`}
                                                        width={240}
                                                        height={180}
                                                        className="h-28 w-full object-cover"
                                                        unoptimized
                                                      />
                                                    </a>
                                                  ))}
                                                </div>
                                              </div>
                                            ) : null}
                                          </div>

                                          <div className="w-full rounded-2xl border border-slate-200 bg-white p-3 lg:w-[22rem]">
                                            <div>
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cost</p>
                                              <div className="mt-2">
                                                <ResidentWorkOrderCostEditor
                                                  key={`${workOrder.id}-${workOrder.cost}`}
                                                  row={workOrder}
                                                  managerUserId={userId ?? null}
                                                  onSaved={() => {
                                                    setWorkOrderTick((n) => n + 1);
                                                    setHcTick((n) => n + 1);
                                                    void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
                                                  }}
                                                />
                                              </div>
                                            </div>
                                            <div className="mt-4">
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visit date & time</p>
                                              <div className="mt-2 flex flex-col gap-2">
                                                <Input
                                                  type="datetime-local"
                                                  value={visitAtById[workOrder.id] ?? toDatetimeLocalValue(workOrder.scheduledAtIso)}
                                                  onChange={(e) =>
                                                    setVisitAtById((prev) => ({ ...prev, [workOrder.id]: e.target.value }))
                                                  }
                                                  className="h-10 rounded-xl text-sm"
                                                />
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="rounded-full"
                                                  onClick={() => {
                                                    const iso = fromDatetimeLocalValue(visitAtById[workOrder.id] ?? "");
                                                    if (!iso) { showToast("Choose a date and time."); return; }
                                                    updateManagerWorkOrder(workOrder.id, (row) => ({
                                                      ...row,
                                                      scheduledAtIso: iso,
                                                      scheduled: formatScheduledLabel(iso),
                                                      bucket: row.bucket === "open" ? "scheduled" : row.bucket,
                                                      status: row.bucket === "open" ? "Scheduled" : row.status,
                                                    }));
                                                    setWorkOrderTick((n) => n + 1);
                                                    showToast("Visit scheduled.");
                                                  }}
                                                >
                                                  Save visit
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                              {workOrder.bucket !== "completed" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="rounded-full"
                                                  onClick={() => {
                                                    updateManagerWorkOrder(workOrder.id, (row) => ({
                                                      ...row,
                                                      bucket: "completed",
                                                      status: "Completed",
                                                    }));
                                                    setWorkOrderTick((n) => n + 1);
                                                    showToast("Work order marked complete.");
                                                  }}
                                                >
                                                  Mark complete
                                                </Button>
                                              ) : null}
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                                                onClick={() => {
                                                  deleteManagerWorkOrderRow(workOrder.id);
                                                  setWorkOrderTick((n) => n + 1);
                                                  setHcTick((n) => n + 1);
                                                  showToast("Work order deleted.");
                                                }}
                                              >
                                                Delete
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Inbox</p>
                                  <p className="mt-1 text-sm text-slate-500">Messages for this specific resident appear here directly.</p>
                                </div>
                                <Button type="button" variant="outline" className="rounded-full px-3 py-1 text-xs" onClick={() => setMessageOpen(true)}>
                                  New message
                                </Button>
                              </div>
                              {residentInboxThreads.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">No messages on file for this resident yet.</p>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  {residentInboxThreads.map((thread) => (
                                    <div key={thread.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-900">{thread.subject}</p>
                                          <p className="text-xs text-slate-500">
                                            {thread.from} · {thread.time}
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
                                          {thread.folder === "sent" ? "Sent" : "Inbox"}
                                        </span>
                                      </div>
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{thread.body}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={addResidentOpen} title="Add resident" onClose={() => setAddResidentOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Creates an active resident record with an Axis ID. No application or lease is generated.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Full name *</span>
              <Input value={arName} onChange={(e) => setArName(e.target.value)} placeholder="Jane Smith" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email *</span>
              <Input type="email" value={arEmail} onChange={(e) => setArEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Property</span>
              <select
                value={arPropertyId}
                onChange={(e) => { setArPropertyId(e.target.value); setArRoomId(""); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Lease term</span>
              <select
                value={arLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === AR_LEASE_TERM_CUSTOM) {
                    if (AR_LEASE_TERM_PRESETS.includes(arLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])) {
                      setArLeaseTerm("");
                    }
                    return;
                  }
                  setArLeaseTerm(selected);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select…</option>
                <option value="Month-to-month">Month-to-month</option>
                <option value="12 months">12 months</option>
                <option value="6 months">6 months</option>
                <option value="3 months">3 months</option>
                <option value={AR_LEASE_TERM_CUSTOM}>Custom…</option>
              </select>
              {arLeaseTermSelectValue === AR_LEASE_TERM_CUSTOM ? (
                <Input
                  className="mt-2"
                  value={arLeaseTerm}
                  onChange={(e) => setArLeaseTerm(e.target.value)}
                  placeholder="e.g. 9 months"
                />
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Room</span>
              {arRoomOptions.length > 0 ? (
                <select
                  value={arRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setArRoomId(roomId);
                    const room = arRoomOptions.find((r) => r.id === roomId);
                    if (room?.monthlyRent && !arRent.trim()) {
                      setArRent(String(room.monthlyRent));
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="">Select room…</option>
                  {arRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.monthlyRent ? ` — $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Monthly rent ($)</span>
              <Input type="number" min={0} step={0.01} value={arRent} onChange={(e) => setArRent(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Monthly utilities ($)</span>
              <Input type="number" min={0} step={0.01} value={arUtilities} onChange={(e) => setArUtilities(e.target.value)} placeholder="175.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Move-in fee ($)</span>
              <Input type="number" min={0} step={0.01} value={arMoveInFee} onChange={(e) => setArMoveInFee(e.target.value)} placeholder="200.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Security deposit ($)</span>
              <Input type="number" min={0} step={0.01} value={arSecurityDeposit} onChange={(e) => setArSecurityDeposit(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Move-in date</span>
              <Input type="date" value={arMoveInDate} onChange={(e) => setArMoveInDate(e.target.value)} />
            </label>
            {!isMonthToMonthLease ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Move-out date</span>
                <Input type="date" value={arMoveOutDate} onChange={(e) => setArMoveOutDate(e.target.value)} />
              </label>
            ) : null}
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Notes</span>
              <Textarea
                className="min-h-[72px]"
                value={arNotes}
                onChange={(e) => setArNotes(e.target.value)}
                placeholder="Any additional details about this resident…"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddResidentOpen(false)}>Cancel</Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveManualResident}>Add resident</Button>
          </div>
        </div>
      </Modal>

      <Modal open={addChargeOpen} title={editChargeId ? "Edit charge" : "Add charge"} onClose={() => setAddChargeOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            {editChargeId ? "Updating" : "Adding"} charge for{" "}
            <span className="font-semibold text-slate-900">{selected?.name || selected?.email}</span>.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Charge title</span>
            <Input
              value={chargeTitle}
              onChange={(e) => setChargeTitle(e.target.value)}
              placeholder="e.g. Late fee, Cleaning fee, Parking"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Amount ($)</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)}
              placeholder="50.00"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chargeBlocksLease}
              onChange={(e) => setChargeBlocksLease(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="font-medium text-slate-700">Block lease signing until paid</span>
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddChargeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={submitCharge}>
              {editChargeId ? "Save changes" : "Add charge"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={messageOpen} title="Message resident" onClose={() => setMessageOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Sending to <span className="font-semibold text-slate-900">{selected?.email || "resident"}</span>.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Subject</span>
            <Input className="mt-1.5" value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="Subject" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Message</span>
            <Textarea
              className="mt-1.5 min-h-[160px]"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Write your message..."
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={sendResidentMessage}>
              Send
            </Button>
          </div>
        </div>
      </Modal>
      </ManagerPortalPageShell>
    </>
  );
}

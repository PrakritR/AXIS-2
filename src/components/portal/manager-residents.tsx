"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import Image from "next/image";
import Link from "next/link";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_FILTER_ACTIONS_MOBILE,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_HEAD_ROW,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseRegenerateConfirmModal } from "@/components/portal/lease-regenerate-confirm-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  ReminderSettingsModal,
  ScheduledMessageEditModal,
  patchScheduledMessage,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import { ChargeReminderList } from "@/components/portal/manager-inbox-schedule-panel";
import { manageableRemindersForCharge } from "@/lib/scheduled-payment-messages";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import {
  createManagerCharge,
  chargeDueLabel,
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  findPendingWorkOrderCharge,
  markHouseholdChargePaid,
  parseMoneyAmount,
  deleteHouseholdCharge,
  readChargesForManagerResident,
  recordApprovedApplicationCharges,
  recordWorkOrderResidentCharge,
  removeResidentHouseholdPaymentData,
  syncHouseholdChargesFromServer,
  updateHouseholdChargeAmount,
  updatePendingRentAmountForResident,
  type HouseholdCharge,
} from "@/lib/household-charges";
import {
  appendManagerApplicationRow,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  upsertApplicationRowToServer,
  writeManagerApplicationRows,
  MANAGER_APPLICATIONS_EVENT,
  normalizeApplicationAxisId,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import { getPropertyById, getRoomChoiceLabel, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  buildMockPropertyFromDraft,
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  buildNewChargeNoticeBody,
  deliverPortalInboxMessage,
} from "@/lib/portal-message-delivery";
import {
  appendLeaseThreadMessage,
  deleteLeasePipelineRow,
  deleteLeasePipelineRowsForResident,
  generateLeaseHtmlForRow,
  hasAnyLeaseSignature,
  leaseGenerationSupportedForRow,
  managerSignLease,
  leaseAllowsManagerDocumentEdits,
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
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  deleteManagerWorkOrdersForResident,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  deleteManagerWorkOrderRow,
} from "@/lib/manager-work-orders-storage";
import {
  SERVICE_REQUESTS_EVENT,
  readServiceRequestsForResident,
  readServiceRequestsForManager,
  approveServiceRequest,
  denyServiceRequest,
  markServiceRequestServicePaid,
  markServiceRequestDepositPaid,
  hasDeposit,
  deleteServiceRequestsForResident,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  invalidatePersistedInboxCache,
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  persistInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
import { formatPacificDate, formatPacificDateTime } from "@/lib/pacific-time";

type ActiveResident = {
  id: string;
  name: string;
  email: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  signedMonthlyRent: number | null;
  leaseStart: string;
  leaseEnd: string;
  axisId: string;
  manuallyAdded?: boolean;
  moveInInstructions?: string;
  manualResidentDetails?: NonNullable<import("@/data/demo-portal").DemoApplicantRow["manualResidentDetails"]>;
  isPrevious: boolean;
  /** null = no Axis account yet; true = resident set their own password; false = still on auto-provisioned default */
  portalSetup: boolean | null;
};

type ResidentsTabId = "current" | "previous";

function shortDateLabel(iso: string): string {
  const parts = iso.trim().split("-").map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return iso;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function isPreviousResidentRow(row: DemoApplicantRow): boolean {
  return !isCurrentResidentApplicationRow(row);
}

const AR_LEASE_TERM_CUSTOM = "__custom__";
const AR_LEASE_TERM_PRESETS = ["Month-to-month", "12 months", "6 months", "3 months"] as const;

function statusPill(status: "pending" | "paid") {
  return status === "paid"
    ? "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
    : "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
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
  return formatPacificDateTime(d);
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
    return <span className="text-muted">{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</span>;
  }

  if (pendingCharge) {
    return <span className="text-xs text-muted">Pending payment · {pendingCharge.balanceLabel}</span>;
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
  const navigate = usePortalNavigate();
  const portalBase = usePaidPortalBasePath();
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  // Per-charge reminder lists show the full saved default schedule, so bypass
  // the Inbox schedule-visibility window (which only gates Inbox → Schedule).
  const { messages: scheduledMessages, settings: reminderSettings, reload: reloadSchedule, setSettings: setReminderSettings } = useScheduledPaymentMessages({ includeHidden: true });
  const [scheduleEdit, setScheduleEdit] = useState<ScheduledPaymentMessage | null>(null);
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false);
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [workOrderTick, setWorkOrderTick] = useState(0);
  const [srTick, setSrTick] = useState(0);
  const [inboxTick, setInboxTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentsTab, setResidentsTab] = useState<ResidentsTabId>(tabId);
  const [prevTabId, setPrevTabId] = useState(tabId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [chargeNoticePreview, setChargeNoticePreview] = useState<{
    title: string;
    amount: number;
    blocksLease: boolean;
  } | null>(null);
  const [chargeNoticeBusy, setChargeNoticeBusy] = useState(false);
  const [editChargeId, setEditChargeId] = useState<string | null>(null);
  const [editChargeKind, setEditChargeKind] = useState<HouseholdCharge["kind"] | null>(null);
  const [chargeTitle, setChargeTitle] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeBlocksLease, setChargeBlocksLease] = useState(false);
  const [chargeTab, setChargeTab] = useState<"pending" | "paid">("pending");
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [portalSetupMap, setPortalSetupMap] = useState<Map<string, boolean>>(new Map());
  const [uploadingLeaseRowId, setUploadingLeaseRowId] = useState<string | null>(null);
  const [generatingLeaseRowId, setGeneratingLeaseRowId] = useState<string | null>(null);
  const [regenerateConfirmLeaseId, setRegenerateConfirmLeaseId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [leaseReminderBusy, setLeaseReminderBusy] = useState(false);
  const [reminderPreview, setReminderPreview] = useState<{ res: ActiveResident; subject: string; body: string } | null>(null);
  const [leaseReminderPreview, setLeaseReminderPreview] = useState<{
    res: ActiveResident;
    leaseId: string;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [leaseSentPreview, setLeaseSentPreview] = useState<{
    res: ActiveResident;
    lease: LeasePipelineRow;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [leaseSendBusy, setLeaseSendBusy] = useState(false);
  const [signingLease, setSigningLease] = useState<LeasePipelineRow | null>(null);
  const [visitAtById, setVisitAtById] = useState<Record<string, string>>({});
  const [welcomeEmailBusyForResident, setWelcomeEmailBusyForResident] = useState<string | null>(null);
  const [welcomePreviewFor, setWelcomePreviewFor] = useState<ActiveResident | null>(null);
  const [welcomePreviewContent, setWelcomePreviewContent] = useState("");

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

  // Edit resident
  const [editResidentOpen, setEditResidentOpen] = useState(false);
  const [erName, setErName] = useState("");
  const [erEmail, setErEmail] = useState("");
  const [erPropertyId, setErPropertyId] = useState("");
  const [erRoomId, setErRoomId] = useState("");
  const [erLeaseTerm, setErLeaseTerm] = useState("");
  const [erMoveInDate, setErMoveInDate] = useState("");
  const [erMoveOutDate, setErMoveOutDate] = useState("");
  const [erRent, setErRent] = useState("");
  const [erUtilities, setErUtilities] = useState("");
  const [erMoveInFee, setErMoveInFee] = useState("");
  const [erSecurityDeposit, setErSecurityDeposit] = useState("");
  const [erNotes, setErNotes] = useState("");

  if (tabId !== prevTabId) {
    setPrevTabId(tabId);
    if (residentsTab !== tabId) setResidentsTab(tabId);
  }

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
    const onSr = () => setSrTick((n) => n + 1);
    const onInbox = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const detail = (evt as CustomEvent<{ key?: string }>).detail;
        if (detail?.key && detail.key !== MANAGER_INBOX_STORAGE_KEY) return;
      }
      setInboxTick((n) => n + 1);
    };
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
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
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
      syncManagerWorkOrdersFromServer(),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(),
    ]).then(() => {
      if (!cancelled) {
        setPropertyTick((n) => n + 1);
        setInboxTick((n) => n + 1);
        setWorkOrderTick((n) => n + 1);
        setHcTick((n) => n + 1);
      }
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
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        setPortalSetupMap(new Map());
        return;
      }
      const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) };
      const [accountRes, portalRes] = await Promise.allSettled([
        fetch("/api/manager/resident-account-emails", opts),
        fetch("/api/manager/resident-portal-status", opts),
      ]);
      if (cancelled) return;
      if (accountRes.status === "fulfilled" && accountRes.value.ok) {
        const body = (await accountRes.value.json()) as { emails?: string[] };
        if (!cancelled) setResidentAccountEmails(new Set((body.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)));
      }
      if (portalRes.status === "fulfilled" && portalRes.value.ok) {
        const body = (await portalRes.value.json()) as { statuses?: { email: string; portalSetup: boolean }[] };
        if (!cancelled) {
          const map = new Map<string, boolean>();
          for (const s of body.statuses ?? []) map.set(s.email.trim().toLowerCase(), s.portalSetup);
          setPortalSetupMap(map);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hcTick, propertyTick]);

  // Silently purge server-side orphaned records for deleted residents on mount.
  useEffect(() => {
    if (!authReady || !userId || isDemoModeActive()) return;
    let cancelled = false;
    void fetch("/api/portal/purge-orphaned-records", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "current_only" }),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { deleted?: Record<string, number>; purgedEmails?: string[] };
        const total = Object.values(body.deleted ?? {}).reduce((a, b) => a + b, 0);
        if (total === 0) return;
        await syncManagerApplicationsFromServer({ force: true, managerUserId: userId });
        void syncHouseholdChargesFromServer(true).then(() => { if (!cancelled) setHcTick((n) => n + 1); });
        void syncLeasePipelineFromServer(userId, { force: true }).then(() => { if (!cancelled) setLeaseTick((n) => n + 1); });
        void syncManagerWorkOrdersFromServer({ force: true }).then(() => { if (!cancelled) setWorkOrderTick((n) => n + 1); });
        void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then(() => { if (!cancelled) setInboxTick((n) => n + 1); });
        const activeEmails = new Set(
          readManagerApplicationRows()
            .filter((row) => row.bucket === "approved" && !isPreviousResidentRow(row))
            .map((r) => r.email?.trim().toLowerCase())
            .filter((e): e is string => Boolean(e)),
        );
        const purgedEmails = (body.purgedEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean);
        const purgedEmailSet = new Set(purgedEmails);
        for (const sr of readServiceRequestsForManager(userId)) {
          if (!activeEmails.has(sr.residentEmail.trim().toLowerCase())) {
            deleteServiceRequestsForResident(sr.residentEmail);
          }
        }
        for (const email of purgedEmailSet) {
          removeResidentHouseholdPaymentData(email);
          deleteManagerWorkOrdersForResident(email);
          deleteLeasePipelineRowsForResident(email, undefined, userId);
          deleteServiceRequestsForResident(email);
        }
        const inboxRows = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
        const filteredInbox = inboxRows.filter((thread) => {
          const participant = thread.email?.trim().toLowerCase() || "";
          return participant ? !purgedEmailSet.has(participant) : true;
        });
        if (filteredInbox.length !== inboxRows.length) {
          persistInbox(MANAGER_INBOX_STORAGE_KEY, filteredInbox);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  const residents = useMemo<ActiveResident[]>(() => {
    void hcTick;
    return readManagerApplicationRows()
      .filter((row) => row.bucket === "approved" && applicationVisibleToPortalUser(row, userId))
      .map((row) => {
        const propId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
        const prop = propId ? getPropertyById(propId) : null;
        const roomLabel =
          row.manualResidentDetails?.roomNumber?.trim() ||
          getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "").split(" · ")[0]?.trim() ||
          "";
        const propertyLabel = (prop?.buildingName?.trim() || prop?.title?.trim()?.replace(/\s*·\s*\d+\s*rooms?\s*$/i, "") || row.property || "").trim();
        const leaseStart = (row.application?.leaseStart?.trim() || row.manualResidentDetails?.moveInDate?.trim() || "");
        const leaseEnd = (row.application?.leaseEnd?.trim() || row.manualResidentDetails?.moveOutDate?.trim() || "");
        const emailKey = (row.email ?? "").trim().toLowerCase();
        const hasAccount = emailKey ? residentAccountEmails.has(emailKey) : false;
        const portalSetup = hasAccount ? (portalSetupMap.get(emailKey) ?? false) : null;
        return {
          id: row.id,
          name: row.name,
          email: (row.email ?? "").trim(),
          propertyId: propId,
          propertyLabel,
          roomLabel,
          signedMonthlyRent: row.signedMonthlyRent ?? null,
          leaseStart,
          leaseEnd,
          axisId: normalizeApplicationAxisId(row.id),
          manuallyAdded: row.manuallyAdded,
          moveInInstructions: row.moveInInstructions,
          manualResidentDetails: row.manualResidentDetails,
          isPrevious: isPreviousResidentRow(row),
          portalSetup,
        };
      });
  }, [userId, hcTick, residentAccountEmails, portalSetupMap]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    const labelById = new Map<string, string>();
    if (userId) {
      for (const p of readExtraListingsForUser(userId)) {
        labelById.set(p.id, (p.buildingName || p.title?.replace(/\s*·\s*\d+\s*rooms?\s*$/i, "") || p.address || p.id).trim());
      }
      for (const p of readPendingManagerPropertiesForUser(userId)) {
        const built = buildMockPropertyFromDraft(p, p.id);
        const label = [built.buildingName, built.address].filter(Boolean).join(" · ").trim() || built.title;
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
    void propertyTick;
    if (!arPropertyId || !userId) return [];
    const listing = readExtraListingsForUser(userId).find((p) => p.id === arPropertyId);
    if (!listing?.listingSubmission) return [];
    const sub = normalizeManagerListingSubmissionV1(listing.listingSubmission);
    return sub.rooms.map((r) => ({ id: r.id, name: r.name || r.id, monthlyRent: r.monthlyRent }));
  }, [arPropertyId, userId, propertyTick]);

  const erRoomOptions = useMemo(() => {
    void propertyTick;
    if (!erPropertyId || !userId) return [];
    const listing = readExtraListingsForUser(userId).find((p) => p.id === erPropertyId);
    if (!listing?.listingSubmission) return [];
    const sub = normalizeManagerListingSubmissionV1(listing.listingSubmission);
    return sub.rooms.map((r) => ({ id: r.id, name: r.name || r.id, monthlyRent: r.monthlyRent }));
  }, [erPropertyId, userId, propertyTick]);

  const arLeaseTermSelectValue = useMemo(() => {
    if (!arLeaseTerm.trim()) return "";
    return AR_LEASE_TERM_PRESETS.includes(arLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])
      ? arLeaseTerm
      : AR_LEASE_TERM_CUSTOM;
  }, [arLeaseTerm]);

  const isMonthToMonthLease = arLeaseTerm === "Month-to-month";

  const erLeaseTermSelectValue = useMemo(() => {
    if (!erLeaseTerm.trim()) return "";
    return AR_LEASE_TERM_PRESETS.includes(erLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])
      ? erLeaseTerm
      : AR_LEASE_TERM_CUSTOM;
  }, [erLeaseTerm]);

  const isEditMonthToMonthLease = erLeaseTerm === "Month-to-month";

  if (isMonthToMonthLease && arMoveOutDate) {
    setArMoveOutDate("");
  }

  if (isEditMonthToMonthLease && erMoveOutDate) {
    setErMoveOutDate("");
  }

  const filtered = useMemo(() => {
    const inTab = residents.filter((resident) => (residentsTab === "current" ? !resident.isPrevious : resident.isPrevious));
    const base = propertyFilter
      ? inTab.filter((r) => r.propertyId === propertyFilter)
      : inTab;

    return [...base].sort((a, b) => {
      if (!propertyFilter) {
        const propCmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
        if (propCmp !== 0) return propCmp;
      }

      const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;

      const aNum = parseInt(a.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      const bNum = parseInt(b.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      return aNum - bNum;
    });
  }, [residents, residentsTab, propertyFilter]);

  const currentResidentsCount = useMemo(() => residents.filter((resident) => !resident.isPrevious).length, [residents]);
  const previousResidentsCount = useMemo(() => residents.filter((resident) => resident.isPrevious).length, [residents]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) setChargeTab("pending");
  }

  if (selectedId && !filtered.some((resident) => resident.id === selectedId)) {
    setSelectedId(null);
  }

  const residentCharges = useMemo<HouseholdCharge[]>(() => {
    void hcTick;
    if (!selected?.email) return [];
    return readChargesForManagerResident(selected.email, userId ?? null);
  }, [selected, hcTick, userId]);

  const residentLease = useMemo<LeasePipelineRow | null>(() => {
    void leaseTick;
    if (!selected?.email) return null;
    const selectedAxisId = normalizeApplicationAxisId(selected.id);
    const email = selected.email.trim().toLowerCase();
    const allRows = readLeasePipeline(userId);
    const rows = allRows.filter((row) => {
      const rowAxisId = row.axisId?.trim() ? normalizeApplicationAxisId(row.axisId) : "";
      if (rowAxisId && rowAxisId === selectedAxisId) return true;
      return row.residentEmail.trim().toLowerCase() === email;
    });
    rows.sort((a, b) => {
      const aAxisMatch = (a.axisId?.trim() ? normalizeApplicationAxisId(a.axisId) : "") === selectedAxisId;
      const bAxisMatch = (b.axisId?.trim() ? normalizeApplicationAxisId(b.axisId) : "") === selectedAxisId;
      const axisDelta = Number(bAxisMatch) - Number(aAxisMatch);
      if (axisDelta !== 0) return axisDelta;

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

  const residentServiceRequests = useMemo<ServiceRequest[]>(() => {
    void srTick;
    if (!selected?.email) return [];
    // All statuses — manager sees pending (to approve/deny), approved, returned, denied
    return readServiceRequestsForResident(selected.email).sort((a, b) => {
      const order = { pending: 0, approved: 1, returned: 2, denied: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [selected, srTick]);

  // Per-resident pending service request counts — for table row badges
  const pendingServiceRequestCountByEmail = useMemo<Map<string, number>>(() => {
    void srTick;
    if (!userId) return new Map();
    const map = new Map<string, number>();
    for (const req of readServiceRequestsForManager(userId)) {
      if (req.status === "pending") {
        const email = req.residentEmail.trim().toLowerCase();
        map.set(email, (map.get(email) ?? 0) + 1);
      }
    }
    return map;
  }, [userId, srTick]);

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
    setAddChargeOpen(false);
    setChargeNoticePreview({
      title: chargeTitle.trim(),
      amount,
      blocksLease: chargeBlocksLease,
    });
  }

  async function confirmChargeNotice(skipMessage: boolean) {
    if (!selected || !chargeNoticePreview) return;
    setChargeNoticeBusy(true);
    try {
      const result = createManagerCharge({
        residentEmail: selected.email,
        residentName: selected.name,
        propertyId: selected.propertyId || "unknown",
        propertyLabel: selected.propertyLabel,
        managerUserId: userId ?? null,
        title: chargeNoticePreview.title,
        amount: chargeNoticePreview.amount,
        blocksLeaseUntilPaid: chargeNoticePreview.blocksLease,
      });
      if (!result) {
        showToast("Could not add charge.");
        return;
      }
      setAddChargeOpen(false);
      setChargeTab("pending");
      if (skipMessage) {
        showToast("Charge added (no notification sent).");
        return;
      }
      const amountLabel = `$${chargeNoticePreview.amount.toFixed(2)}`;
      const subject = `New charge: ${chargeNoticePreview.title}`;
      const body = buildNewChargeNoticeBody({
        residentName: selected.name,
        chargeTitle: chargeNoticePreview.title,
        amountLabel,
        propertyLabel: selected.propertyLabel,
      });
      const notice = await deliverPortalInboxMessage({
        toEmails: [selected.email],
        subject,
        text: body,
      });
      if (notice.ok) {
        showToast(notice.skipped ? "Charge added. Notice sent to inbox (demo email skipped)." : "Charge added and notice sent via inbox and email.");
      } else {
        showToast("Charge added, but notice could not be sent.");
      }
    } finally {
      setChargeNoticeBusy(false);
      setChargeNoticePreview(null);
    }
  }

  async function sendResidentMessage() {
    if (!selected) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();
    if (!subject || !body) {
      showToast("Add a subject and message.");
      return;
    }
    setMessageSubject("");
    setMessageBody("");
    setMessageOpen(false);
    const result = await deliverPortalInboxMessage({
      fromName: managerEmail ?? "Property Manager",
      toEmails: [selected.email],
      subject,
      text: body,
    });
    if (!result.ok) {
      showToast(result.error ?? "Message could not be sent.");
      return;
    }
    invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
    const fresh = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
    persistInbox(MANAGER_INBOX_STORAGE_KEY, fresh as PersistedInboxThread[]);
    setInboxTick((n) => n + 1);
    showToast(result.skipped ? "Message sent to inbox (demo email skipped)." : "Message sent via inbox and email.");
  }

  async function sendResidentAccountEmail(res: ActiveResident) {
    setWelcomeEmailBusyForResident(res.id);
    try {
      const response = await fetch("/api/portal/send-resident-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: res.email, residentName: res.name, axisId: res.axisId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (response.ok && data.ok) {
        showToast("Account setup email sent.");
        return;
      }
      if (typeof data.mailtoHref === "string") {
        const { openMailtoHref } = await import("@/lib/resident-welcome-email");
        openMailtoHref(data.mailtoHref);
        const err = (data.error ?? "").toLowerCase();
        showToast(
          err.includes("not configured") || err.includes("resend_api_key")
            ? "Email provider not configured — opened a draft in your mail app."
            : `Could not send automatically — opened a draft in your mail app.`,
        );
        return;
      }
      showToast(data.error ?? "Could not send account setup email.");
    } catch {
      showToast("Could not send account setup email.");
    } finally {
      setWelcomeEmailBusyForResident(null);
    }
  }

  function openPaymentReminderPreview(res: ActiveResident, pendingCharges: HouseholdCharge[]) {
    if (pendingCharges.length === 0) { showToast("No pending charges to remind about."); return; }
    const total = pendingCharges.reduce((sum, c) => sum + (parseMoneyAmount(c.balanceLabel) || parseMoneyAmount(c.amountLabel)), 0);
    const lines = pendingCharges.map((c) => `  • ${c.title}: ${c.balanceLabel}${c.dueDateLabel ? ` (due ${c.dueDateLabel})` : ""}`).join("\n");
    const subject = "Payment reminder — outstanding balance";
    const body = [
      `Hi ${res.name.split(" ")[0] ?? res.name},`,
      "",
      "This is a reminder that you have the following outstanding payment(s):",
      "",
      lines,
      "",
      `Total due: $${total.toFixed(2)}`,
      "",
      "Please log into your resident portal to view details and submit payment.",
      "",
      "— Axis",
    ].join("\n");
    setReminderPreview({ res, subject, body });
  }

  async function doSendPaymentReminder(res: ActiveResident, subject: string, body: string) {
    setReminderPreview(null);
    setReminderBusy(true);
    try {
      await fetch("/api/portal/send-inbox-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromName: managerEmail ?? "Property Manager", toEmails: [res.email], subject, text: body, deliverToPortalInbox: true }),
      });
      const fresh = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
      persistInbox(MANAGER_INBOX_STORAGE_KEY, fresh as PersistedInboxThread[]);
      setInboxTick((n) => n + 1);
      showToast("Payment reminder sent to resident.");
    } catch {
      showToast("Could not send payment reminder.");
    } finally {
      setReminderBusy(false);
    }
  }

  async function sendLeaseSigningReminder(res: ActiveResident, leaseId: string, subject: string, body: string) {
    setLeaseReminderBusy(true);
    try {
      const response = await fetch("/api/portal/send-inbox-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromName: managerEmail ?? "Property Manager",
          toEmails: [res.email],
          subject,
          text: body,
          deliverToPortalInbox: true,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        showToast(data.error ?? "Could not send lease signing reminder.");
        return;
      }

      appendLeaseThreadMessage(leaseId, "manager", "Sent lease-signing reminder to resident.", userId);
      setLeaseTick((n) => n + 1);
      if (data.skipped) {
        showToast("Reminder sent to Axis inbox (demo email, no external email sent).");
      } else {
        showToast("Lease-signing reminder sent via email and Axis inbox.");
      }
    } catch {
      showToast("Could not send lease signing reminder.");
    } finally {
      setLeaseReminderBusy(false);
    }
  }

  function openLeaseSigningReminderPreview(res: ActiveResident, lease: LeasePipelineRow) {
    const recipient = res.email.trim();
    if (!recipient || !recipient.includes("@")) {
      showToast("Resident email is missing or invalid.");
      return;
    }
    const unit = lease.unit.trim() || "your unit";
    const leaseStart = lease.application?.leaseStart?.trim();
    const leaseEnd = lease.application?.leaseEnd?.trim();
    const dateLine = leaseStart
      ? leaseEnd
        ? `Lease dates: ${leaseStart} to ${leaseEnd}`
        : `Lease start date: ${leaseStart}`
      : "";
    const subject = `Reminder: sign your lease for ${unit}`;
    const body = [
      `Hi ${res.name.split(" ")[0] ?? res.name},`,
      "",
      `This is a reminder to review and sign your lease for ${unit} in your Axis resident portal.`,
      dateLine,
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
    ].filter(Boolean).join("\n");

    setLeaseReminderPreview({
      res,
      leaseId: lease.id,
      recipient,
      subject,
      body,
    });
  }

  function leaseSentToResidentBody(res: ActiveResident, lease: LeasePipelineRow): string {
    const unit = lease.unit.trim() || "your unit";
    return [
      `Hi ${lease.residentName || res.name || "there"},`,
      "",
      `Your lease for ${unit} is ready to review and sign in your Axis resident portal.`,
      "",
      "Sign in to Axis, open Leases in the sidebar, and complete your signature when you're ready.",
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
    ].join("\n");
  }

  function openLeaseSendPreview(res: ActiveResident, lease: LeasePipelineRow) {
    if (!residentAccountEmails.has(res.email.trim().toLowerCase())) {
      showToast("Resident must create their account before the lease can be sent.");
      return;
    }
    if (!lease.generatedHtml && !lease.managerUploadedPdf?.dataUrl) {
      showToast("Generate or upload a lease document first.");
      return;
    }
    const recipient = res.email.trim();
    const unit = lease.unit.trim() || "your unit";
    setLeaseSentPreview({
      res,
      lease,
      recipient,
      subject: `Your lease for ${unit} is ready to sign`,
      body: leaseSentToResidentBody(res, lease),
    });
  }

  async function confirmSendLeaseToResident(skipMessage: boolean) {
    if (!leaseSentPreview || leaseSendBusy) return;
    const { res, lease, subject, body } = leaseSentPreview;
    setLeaseSendBusy(true);
    try {
      const sendResult = await sendLeaseToResident(lease.id, userId);
      if (!sendResult.ok) {
        showToast(sendResult.error ?? "Could not send lease.");
        return;
      }
      setLeaseSentPreview(null);
      appendLeaseThreadMessage(lease.id, "manager", "Sent lease to resident for review and signature.", userId);
      if (skipMessage) {
        showToast("Lease sent to resident portal (no notification sent).");
      } else {
        const notice = await deliverPortalInboxMessage({
          fromName: managerEmail ?? "Property Manager",
          toEmails: [res.email],
          subject,
          text: body,
        });
        if (notice.ok) {
          showToast(
            notice.skipped
              ? "Lease sent to resident portal (demo inbox only)."
              : "Lease sent to resident portal with inbox and email notification.",
          );
        } else {
          showToast("Lease sent to resident portal. Notification could not be delivered.");
        }
      }
      setLeaseTick((n) => n + 1);
    } finally {
      setLeaseSendBusy(false);
    }
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
    const selectedRoomLabel = arRoomId ? arRoomOptions.find((room) => room.id === arRoomId)?.name?.trim() ?? "" : "";
    const nextRow: DemoApplicantRow = {
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
    };
    appendManagerApplicationRow(nextRow);
    recordApprovedApplicationCharges(nextRow, userId ?? null);
    void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
    setChargeTab("pending");
    setArName(""); setArEmail(""); setArPropertyId(""); setArRoomId(""); setArLeaseTerm("");
    setArMoveInDate(""); setArMoveOutDate(""); setArRent(""); setArUtilities("");
    setArMoveInFee(""); setArSecurityDeposit(""); setArNotes("");
    setAddResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast(`Resident added — Axis ID: ${axisId}`);
  }

  function openEditResidentModal() {
    if (!selected) return;
    const row = readManagerApplicationRows().find((r) => r.id === selected.id);
    if (!row) {
      showToast("Resident record not found.");
      return;
    }
    const app = row.application;
    const assignedPropId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || app?.propertyId?.trim() || "";
    const assignedRoomChoice = row.assignedRoomChoice?.trim() || app?.roomChoice1?.trim() || "";
    const assignedRoomId =
      assignedPropId && assignedRoomChoice.startsWith(`${assignedPropId}${LISTING_ROOM_CHOICE_SEP}`)
        ? assignedRoomChoice.slice(`${assignedPropId}${LISTING_ROOM_CHOICE_SEP}`.length)
        : assignedRoomChoice;
    setErName(row.name || app?.fullLegalName?.trim() || "");
    setErEmail(row.email?.trim() || app?.email?.trim() || "");
    setErPropertyId(assignedPropId);
    setErRoomId(assignedRoomId);
    setErLeaseTerm(row.manualResidentDetails?.leaseTerm || app?.leaseTerm || "");
    setErMoveInDate(row.manualResidentDetails?.moveInDate || app?.leaseStart || "");
    setErMoveOutDate(row.manualResidentDetails?.moveOutDate || app?.leaseEnd || "");
    const savedRent = Number.isFinite(row.signedMonthlyRent ?? NaN) ? String(row.signedMonthlyRent ?? "") : "";
    setErRent(savedRent || app?.managerRentOverride?.trim() || "");
    const savedUtils = row.manualResidentDetails?.monthlyUtilities != null ? String(row.manualResidentDetails.monthlyUtilities) : "";
    setErUtilities(savedUtils || app?.managerUtilitiesOverride?.trim() || "");
    const savedFee = row.manualResidentDetails?.moveInFee != null ? String(row.manualResidentDetails.moveInFee) : "";
    setErMoveInFee(savedFee || app?.managerMoveInFeeOverride?.trim() || "");
    const savedDeposit = row.manualResidentDetails?.securityDeposit != null ? String(row.manualResidentDetails.securityDeposit) : "";
    setErSecurityDeposit(savedDeposit || app?.managerSecurityDepositOverride?.trim() || "");
    setErNotes(row.manualResidentDetails?.notes || "");
    setEditResidentOpen(true);
  }

  function saveEditedResident() {
    if (!selected) return;
    if (!erName.trim()) {
      showToast("Enter the resident's name.");
      return;
    }
    const rows = readManagerApplicationRows();
    const idx = rows.findIndex((r) => r.id === selected.id);
    if (idx === -1) {
      showToast("Resident record not found.");
      return;
    }
    const rent = erRent.trim() ? Number(erRent.replace(/[^\d.]/g, "")) : null;
    const utilities = erUtilities.trim() ? Number(erUtilities.replace(/[^\d.]/g, "")) : null;
    const moveInFee = erMoveInFee.trim() ? Number(erMoveInFee.replace(/[^\d.]/g, "")) : null;
    const secDeposit = erSecurityDeposit.trim() ? Number(erSecurityDeposit.replace(/[^\d.]/g, "")) : null;
    const propId = erPropertyId.trim();
    const propLabel = propId ? propertyOptions.find((p) => p.id === propId)?.label ?? rows[idx]!.property : rows[idx]!.property;
    const selectedRoomLabel = erRoomId ? erRoomOptions.find((room) => room.id === erRoomId)?.name?.trim() ?? "" : "";

    const existing = rows[idx]!;
    const newRoomChoice = propId && erRoomId ? `${propId}${LISTING_ROOM_CHOICE_SEP}${erRoomId}` : undefined;
    const nextRow: DemoApplicantRow = {
      ...existing,
      name: erName.trim(),
      email: erEmail.trim() || existing.email,
      property: propLabel,
      assignedPropertyId: propId || undefined,
      assignedRoomChoice: newRoomChoice,
      signedMonthlyRent: rent ?? undefined,
      manualResidentDetails: {
        ...(existing.manualResidentDetails ?? {}),
        moveInDate: erMoveInDate || undefined,
        moveOutDate: erMoveOutDate || undefined,
        monthlyUtilities: utilities ?? undefined,
        moveInFee: moveInFee ?? undefined,
        securityDeposit: secDeposit ?? undefined,
        roomNumber: selectedRoomLabel || undefined,
        leaseTerm: erLeaseTerm || undefined,
        notes: erNotes.trim() || undefined,
      },
      // Mirror all edits back into the application so both views stay consistent.
      application: existing.application
        ? {
            ...existing.application,
            fullLegalName: erName.trim() || existing.application.fullLegalName,
            email: erEmail.trim() || existing.application.email,
            propertyId: propId || existing.application.propertyId,
            roomChoice1: newRoomChoice ?? existing.application.roomChoice1,
            leaseTerm: erLeaseTerm || existing.application.leaseTerm,
            leaseStart: erMoveInDate || existing.application.leaseStart,
            leaseEnd: erMoveOutDate || existing.application.leaseEnd,
            managerRentOverride: erRent.trim() || existing.application.managerRentOverride,
            managerUtilitiesOverride: erUtilities.trim() || existing.application.managerUtilitiesOverride,
            managerMoveInFeeOverride: erMoveInFee.trim() || existing.application.managerMoveInFeeOverride,
            managerSecurityDepositOverride: erSecurityDeposit.trim() || existing.application.managerSecurityDepositOverride,
          }
        : existing.application,
    };

    const next = [...rows];
    next[idx] = nextRow;
    writeManagerApplicationRows(next);
    upsertApplicationRowToServer(nextRow);

    // Update pending recurring rent charge amounts immediately, then refresh all one-time charges
    // (security deposit, move-in fee, prorated first month, application fee) and the recurring profile.
    const residentEmail = nextRow.email ?? "";
    if (propId && residentEmail && rent != null && Number.isFinite(rent)) {
      updatePendingRentAmountForResident(residentEmail, propId, rent, userId ?? null);
    }
    recordApprovedApplicationCharges(nextRow, userId ?? null);

    // Auto-regenerate any unsigned leases so room/rent/rules changes are reflected immediately
    if (residentEmail && nextRow.application) {
      const leasesToRegen = readLeasePipeline(userId ?? undefined).filter(
        (lr) =>
          lr.residentEmail.trim().toLowerCase() === residentEmail.trim().toLowerCase() &&
          leaseAllowsManagerDocumentEdits(lr),
      );
      for (const lr of leasesToRegen) {
        updateLeasePipelineRow(lr.id, {
          application: { ...(lr.application ?? {}), ...nextRow.application },
        }, userId);
        generateLeaseHtmlForRow(lr.id, userId);
      }
    }

    setEditResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast("Resident updated.");
  }

  async function deleteSelectedResident() {
    if (!selected) return;
    const selectedResident = selected;
    if (!window.confirm(`Delete resident ${selectedResident.name || selectedResident.email}? This cannot be undone.`)) return;

    const allRows = readManagerApplicationRows();
    if (!allRows.some((row) => row.id === selectedResident.id)) {
      showToast("Resident not found.");
      return;
    }

    let serverDeleteError: string | null = null;
    try {
      const res = await fetch("/api/portal/delete-resident-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: selectedResident.email,
          purgeData: true,
          applicationId: selectedResident.id,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        serverDeleteError = body?.error ?? "Could not delete resident.";
      }
    } catch {
      serverDeleteError = "Could not delete resident.";
    }

    if (serverDeleteError) {
      showToast(serverDeleteError);
      return;
    }

    writeManagerApplicationRows(allRows.filter((row) => row.id !== selectedResident.id));

    const residentEmail = selectedResident.email.trim().toLowerCase();
    removeResidentHouseholdPaymentData(selectedResident.email);

    const residentLeases = readLeasePipeline(userId).filter(
      (row) => row.residentEmail.trim().toLowerCase() === residentEmail,
    );
    for (const leaseRow of residentLeases) {
      deleteLeasePipelineRow(leaseRow.id, userId);
    }

    const residentWorkOrders = readManagerWorkOrderRows().filter(
      (row) => row.residentEmail?.trim().toLowerCase() === residentEmail,
    );
    for (const workOrder of residentWorkOrders) {
      deleteManagerWorkOrderRow(workOrder.id);
    }

    deleteServiceRequestsForResident(selectedResident.email);

    const allInbox = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
    const deletedThreads = allInbox.filter((thread) => thread.email.trim().toLowerCase() === residentEmail);
    const nextInbox = allInbox.filter((thread) => thread.email.trim().toLowerCase() !== residentEmail);
    persistInbox(MANAGER_INBOX_STORAGE_KEY, nextInbox);
    for (const thread of deletedThreads) {
      void fetch("/api/portal-inbox-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", id: thread.id }),
      }).catch(() => undefined);
    }

    await syncManagerApplicationsFromServer({ force: true, managerUserId: userId });
    setSelectedId(null);
    setHcTick((n) => n + 1);
    setLeaseTick((n) => n + 1);
    setWorkOrderTick((n) => n + 1);
    setInboxTick((n) => n + 1);
    showToast("Resident and all related portal data deleted.");
  }

  function markPaid(chargeId: string) {
    if (markHouseholdChargePaid(chargeId, userId ?? null)) {
      showToast("Marked as paid.");
      setHcTick((n) => n + 1);
      void reloadSchedule();
      void syncHouseholdChargesFromServer(true).then(() => {
        setHcTick((n) => n + 1);
        void reloadSchedule();
      });
    }
  }

  function deleteCharge(chargeId: string) {
    if (!window.confirm("Delete this charge? This cannot be undone.")) return;
    if (deleteHouseholdCharge(chargeId, userId ?? null)) {
      showToast("Charge deleted.");
      setHcTick((n) => n + 1);
      void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
    }
  }

  function leaseGenerationGateTitle(row: LeasePipelineRow): string | undefined {
    const gate = leaseGenerationSupportedForRow(row);
    return gate.ok ? undefined : gate.error;
  }

  function runGenerateLease(rowId: string) {
    if (generatingLeaseRowId) return;
    setGeneratingLeaseRowId(rowId);
    window.setTimeout(() => {
      try {
        const result = generateLeaseHtmlForRow(rowId, userId);
        if (result.ok) {
          setLeaseTick((n) => n + 1);
          showToast(`Lease generated (v${result.version}).`);
        } else {
          showToast(result.error);
        }
      } finally {
        setGeneratingLeaseRowId(null);
        setRegenerateConfirmLeaseId(null);
      }
    }, 0);
  }

  function openGenerateLeaseConfirm(rowId: string) {
    if (generatingLeaseRowId) return;
    const row = readLeasePipeline(userId).find((r) => r.id === rowId);
    if (!row || !leaseAllowsManagerDocumentEdits(row) || !leaseGenerationSupportedForRow(row).ok) return;
    setRegenerateConfirmLeaseId(rowId);
  }

  function signLeaseAsManager(row: LeasePipelineRow) {
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign the lease before you can countersign.");
      return;
    }
    setSigningLease(row);
  }

  async function handleManagerModalSign(signatureName: string) {
    if (!signingLease) return false;
    const ok = await managerSignLease(signingLease.id, signatureName.trim(), userId);
    if (ok) {
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
      <LeaseRegenerateConfirmModal
        open={regenerateConfirmLeaseId !== null}
        busy={Boolean(regenerateConfirmLeaseId && generatingLeaseRowId === regenerateConfirmLeaseId)}
        onClose={() => {
          if (generatingLeaseRowId) return;
          setRegenerateConfirmLeaseId(null);
        }}
        onConfirm={() => {
          if (regenerateConfirmLeaseId) runGenerateLease(regenerateConfirmLeaseId);
        }}
      />
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
          <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
            <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setAddResidentOpen(true)}>
              + Add resident
            </Button>
          </div>
        }
        filterRow={
          <ManagerPortalFilterRow>
            <ManagerPortalStatusPills
              tabs={[
                { id: "current", label: "Current", count: currentResidentsCount },
                { id: "previous", label: "Previous", count: previousResidentsCount },
              ]}
              activeId={residentsTab}
              onChange={(id) => {
                const next = id as ResidentsTabId;
                setResidentsTab(next);
                navigate(`${portalBase}/residents/${next}`);
              }}
            />
            <div className={`${PORTAL_FILTER_ACTIONS_MOBILE} items-center`}>
              <PortalPropertyFilterPill
                propertyOptions={propertyOptions}
                propertyValue={propertyFilter}
                onPropertyChange={setPropertyFilter}
              />
              <Button type="button" variant="primary" className={PORTAL_HEADER_ACTION_BTN} onClick={() => setAddResidentOpen(true)}>
                + Add
              </Button>
            </div>
          </ManagerPortalFilterRow>
        }
      >
      {filtered.length === 0 ? (
        <PortalDataTableEmpty
          icon="residents"
          message={
            residents.length === 0
              ? "No residents yet."
              : residentsTab === "current"
                ? "No current residents yet."
                : "No previous residents yet."
          }
        />
      ) : (
      <>
      <div className="space-y-2 lg:hidden">
        {filtered.map((res) => (
          <div key={res.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
            >
              <p className="truncate font-semibold text-foreground">{res.name || "—"}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[res.roomLabel, res.signedMonthlyRent ? `$${res.signedMonthlyRent.toFixed(2)}/mo` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {!propertyFilter && res.propertyLabel ? (
                <p className="mt-0.5 truncate text-[11px] text-muted/90">{res.propertyLabel}</p>
              ) : null}
            </button>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
              >
                {selectedId === res.id ? "Less" : "Details"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[680px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Email</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Move-in</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Move-out</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Portal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((res) => (
                  <Fragment key={res.id}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() =>
                        setSelectedId((cur) => (cur === res.id ? null : res.id)),
                      )}
                      aria-expanded={selectedId === res.id}
                    >
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        <div className="flex items-center gap-2">
                          <span>{res.name || "—"}</span>
                          {(pendingServiceRequestCountByEmail.get(res.email.trim().toLowerCase()) ?? 0) > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300/60">
                              {pendingServiceRequestCountByEmail.get(res.email.trim().toLowerCase())} service{pendingServiceRequestCountByEmail.get(res.email.trim().toLowerCase()) === 1 ? "" : "s"} pending
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={PORTAL_TABLE_TD}>{res.email}</td>
                      <td className={PORTAL_TABLE_TD}>{res.propertyLabel || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.roomLabel || "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{res.leaseStart ? shortDateLabel(res.leaseStart) : "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{res.leaseEnd ? shortDateLabel(res.leaseEnd) : "—"}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {res.portalSetup === null ? (
                          <span className="text-muted">—</span>
                        ) : res.portalSetup ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                    {selectedId === res.id && selected ? (
                      <tr>
                        <td colSpan={7} className="bg-accent/30 px-4 py-5">
                          <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Account</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full bg-primary/[0.06] px-3 py-1 text-xs text-primary hover:bg-primary/[0.12]"
                                    onClick={() => {
                                      const signupUrl = residentAccountCreationUrl(window.location.origin, selected.axisId);
                                      const previewBody = buildResidentWelcomeEmailBody({ residentName: selected.name, axisId: selected.axisId, signupUrl });
                                      setWelcomePreviewContent(previewBody);
                                      setWelcomePreviewFor(selected);
                                    }}
                                  >
                                    Email account setup
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full px-3 py-1 text-xs"
                                    onClick={openEditResidentModal}
                                  >
                                    Edit resident
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-[var(--status-overdue-bg)]"
                                    onClick={deleteSelectedResident}
                                  >
                                    Delete resident
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <span className="text-muted">Axis ID</span>
                                  <p className="font-mono font-medium text-foreground">{selected.axisId}</p>
                                </div>
                                <div>
                                  <span className="text-muted">Email</span>
                                  <p className="font-medium text-foreground">{selected.email}</p>
                                </div>
                                <div>
                                  <span className="text-muted">Property</span>
                                  <p className="font-medium text-foreground">{selected.propertyLabel || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-muted">Room</span>
                                  <p className="font-medium text-foreground">{selected.roomLabel || "—"}</p>
                                </div>
                                {selected.signedMonthlyRent ? (
                                  <div>
                                    <span className="text-muted">Monthly rent</span>
                                    <p className="font-semibold text-foreground">${selected.signedMonthlyRent.toFixed(2)}/mo</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveInDate ? (
                                  <div>
                                    <span className="text-muted">Move-in date</span>
                                    <p className="font-medium text-foreground">{selected.manualResidentDetails.moveInDate}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveOutDate ? (
                                  <div>
                                    <span className="text-muted">Move-out date</span>
                                    <p className="font-medium text-foreground">{selected.manualResidentDetails.moveOutDate}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.monthlyUtilities ? (
                                  <div>
                                    <span className="text-muted">Monthly utilities</span>
                                    <p className="font-medium text-foreground">${selected.manualResidentDetails.monthlyUtilities}/mo</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.moveInFee ? (
                                  <div>
                                    <span className="text-muted">Move-in fee</span>
                                    <p className="font-medium text-foreground">${selected.manualResidentDetails.moveInFee}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.securityDeposit ? (
                                  <div>
                                    <span className="text-muted">Security deposit</span>
                                    <p className="font-medium text-foreground">${selected.manualResidentDetails.securityDeposit}</p>
                                  </div>
                                ) : null}
                                {selected.manualResidentDetails?.notes ? (
                                  <div className="sm:col-span-2 lg:col-span-3">
                                    <span className="text-muted">Notes</span>
                                    <p className="whitespace-pre-wrap font-medium text-foreground">{selected.manualResidentDetails.notes}</p>
                                  </div>
                                ) : null}
                                <div>
                                  <span className="text-muted">Status</span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                      Active resident
                                    </span>
                                    {selected.manuallyAdded ? (
                                      <span className="inline-flex rounded-full bg-accent/30 px-3 py-1 text-xs font-semibold text-muted">
                                        Manually added
                                      </span>
                                    ) : null}
                                    {residentAccountEmails.has(selected.email.trim().toLowerCase()) ? (
                                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                        Portal account active
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                        No portal account
                                      </span>
                                    )}
                                    {selected.signedMonthlyRent ? (
                                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                        Rent set
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                        No rent set
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Lease</p>
                                  <p className="mt-1 text-sm text-muted">
                                    {residentLease
                                      ? `${residentLease.status ?? residentLease.stageLabel} · ${residentLease.application?.leaseStart || "No move-in"}${residentLease.application?.leaseEnd ? ` to ${residentLease.application.leaseEnd}` : ""}`
                                      : "No lease created yet for this resident."}
                                  </p>
                                </div>
                                {residentLease ? (
                                  <div className="flex flex-wrap gap-2">
                                    {leaseAllowsManagerDocumentEdits(residentLease) ? (
                                      <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      disabled={
                                        generatingLeaseRowId === residentLease.id ||
                                        !leaseGenerationSupportedForRow(residentLease).ok
                                      }
                                      title={leaseGenerationGateTitle(residentLease)}
                                      onClick={() => openGenerateLeaseConfirm(residentLease.id)}
                                    >
                                      {generatingLeaseRowId === residentLease.id ? "Generating..." : "Generate lease"}
                                    </Button>
                                    <label className="inline-flex cursor-pointer items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent/30">
                                      {uploadingLeaseRowId === residentLease.id ? "Uploading..." : "Upload PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="sr-only"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file || !residentLease) return;
                                          setUploadingLeaseRowId(residentLease.id);
                                          const result = await managerUploadLeasePdf(residentLease.id, file, userId);
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
                                      </>
                                    ) : null}
                                    {!residentLease.managerSignature && residentHasSignedLease(residentLease) ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        disabled={
                                          !residentLease.generatedHtml && !residentLease.managerUploadedPdf?.dataUrl
                                        }
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
                                        disabled={leaseSendBusy}
                                        onClick={() => openLeaseSendPreview(selected, residentLease)}
                                      >
                                        {leaseSendBusy ? "Sending…" : "Send to resident"}
                                      </Button>
                                    ) : residentLease.status === "Resident Signature Pending" ? (
                                      <>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="rounded-full px-3 py-1 text-xs"
                                          disabled={leaseReminderBusy}
                                          onClick={() => openLeaseSigningReminderPreview(selected, residentLease)}
                                        >
                                          {leaseReminderBusy ? "Sending…" : "Send signing reminder"}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="rounded-full px-3 py-1 text-xs"
                                          onClick={() => {
                                            const moveResult = sendLeaseBackToManager(residentLease.id, userId);
                                            if (!moveResult.ok) {
                                              showToast(moveResult.error);
                                              return;
                                            }
                                            appendLeaseThreadMessage(residentLease.id, "manager", "Moved lease back to manager review.", userId);
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease moved to Manager Review.");
                                          }}
                                        >
                                          Move to manager review
                                        </Button>
                                      </>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-[var(--status-overdue-bg)]"
                                      onClick={() => {
                                        if (!window.confirm(`Delete the lease for ${selected.name}? This cannot be undone.`)) return;
                                        if (deleteLeasePipelineRow(residentLease.id, userId)) {
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
                                  <div className="rounded-2xl border border-border bg-accent/30 p-3">
                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Lease document</p>
                                    <p className="mt-1 text-xs text-muted">
                                      Single active lease document. Signatures are applied to this same lease as the workflow advances.
                                    </p>
                                  </div>
                                  <LeaseDocumentPreview
                                    className="mt-3"
                                    row={residentLease}
                                    emptyHint="No lease document yet. Generate or upload one from Manager Review first."
                                  />
                                  {residentLease.thread.length ? (
                                    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Lease messages</p>
                                          <p className="mt-1 text-sm text-muted">
                                            Resident edit requests and lease-specific updates appear here.
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-accent/30 px-2.5 py-1 text-[10px] font-semibold text-muted">
                                          {residentLease.status ?? residentLease.stageLabel}
                                        </span>
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {residentLease.thread.map((message) => (
                                          <div key={message.id} className="rounded-xl border border-border bg-accent/30 px-3 py-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                              {message.role}
                                              <span className="normal-case tracking-normal text-muted">
                                                {" "}
                                                · {new Date(message.at).toLocaleString()}
                                              </span>
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{message.body}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-muted">Approve the application and create or generate a lease here for this resident.</p>
                              )}
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Charges</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {chargeCounts.pending > 0 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      disabled={reminderBusy}
                                      onClick={() => openPaymentReminderPreview(selected, residentCharges.filter((c) => c.status === "pending"))}
                                    >
                                      {reminderBusy ? "Sending…" : "Send reminder"}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full px-3 py-1 text-xs"
                                    onClick={() => setReminderSettingsOpen(true)}
                                  >
                                    Reminder settings
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    className="rounded-full px-3 py-1 text-xs"
                                    onClick={openAddCharge}
                                  >
                                    Add charge
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 flex gap-2">
                                {(["pending", "paid"] as const).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setChargeTab(t)}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                      chargeTab === t
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-accent/30 text-muted hover:bg-accent/40"
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
                                <p className="mt-3 text-sm text-muted">
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
                                      <tr className="border-b border-border">
                                        <th className="pb-2 text-left text-xs font-semibold text-muted">Charge</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-muted">Due</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-muted">Reminders</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-muted">Amount</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-muted">Balance</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-muted">Status</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-muted">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleCharges.map((c) => {
                                        const chargeReminders =
                                          c.status === "pending" ? manageableRemindersForCharge(scheduledMessages, c.id) : [];
                                        return (
                                        <tr key={c.id} className="border-b border-border last:border-0">
                                          <td className="py-2 pr-4 font-medium text-foreground">{c.title}</td>
                                          <td className="py-2 pr-4 text-xs text-muted">{chargeDueLabel(c)}</td>
                                          <td className="py-2 pr-4 align-top">
                                            {c.status === "pending" ? (
                                              chargeReminders.length > 0 ? (
                                                <ChargeReminderList
                                                  messages={chargeReminders}
                                                  onEdit={setScheduleEdit}
                                                  onToggleCancel={async (msg, cancelled) => {
                                                    try {
                                                      await patchScheduledMessage(msg.id, { cancelled });
                                                      showToast(cancelled ? "Reminder cancelled." : "Reminder restored.");
                                                      void reloadSchedule();
                                                    } catch (e) {
                                                      showToast(e instanceof Error ? e.message : "Could not update reminder.");
                                                    }
                                                  }}
                                                />
                                              ) : (
                                                <span className="text-xs text-muted">None scheduled</span>
                                              )
                                            ) : (
                                              <span className="text-xs text-muted">—</span>
                                            )}
                                          </td>
                                          <td className="py-2 pr-4 text-right tabular-nums text-muted">{c.amountLabel}</td>
                                          <td className="py-2 pr-4 text-right tabular-nums font-medium text-foreground">{c.balanceLabel}</td>
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
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-full px-2 py-0.5 text-xs text-red-600 hover:border-red-200"
                                                    onClick={() => deleteCharge(c.id)}
                                                  >
                                                    Delete
                                                  </Button>
                                                </>
                                              ) : (
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
                                                    className="rounded-full px-2 py-0.5 text-xs text-red-600 hover:border-red-200"
                                                    onClick={() => deleteCharge(c.id)}
                                                  >
                                                    Delete
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Requests</p>
                                  <p className="mt-1 text-sm text-muted">All requests and maintenance work orders from this resident.</p>
                                </div>
                                {residentServiceRequests.filter((r) => r.status === "pending").length > 0 ? (
                                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300/60">
                                    {residentServiceRequests.filter((r) => r.status === "pending").length} awaiting approval
                                  </span>
                                ) : null}
                              </div>
                              {residentServiceRequests.length === 0 && residentWorkOrders.length === 0 ? (
                                <p className="text-sm text-muted">No requests or work orders for this resident yet.</p>
                              ) : (
                                <div className="space-y-4">
                              {residentServiceRequests.length > 0 ? (
                                <>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Requests</p>
                                  <div className="space-y-3">
                                  {residentServiceRequests.map((req) => {
                                    const needsReturn = hasDeposit(req.deposit);
                                    const statusColors: Record<string, string> = {
                                      pending: "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
                                      approved: "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
                                      returned: "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
                                      denied: "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]",
                                    };
                                    const statusLabels: Record<string, string> = {
                                      pending: "Pending approval",
                                      approved: "Approved",
                                      returned: "Return submitted",
                                      denied: "Denied",
                                    };
                                    return (
                                      <div key={req.id} className={`rounded-2xl border p-4 ${req.status === "pending" ? "portal-banner-pending" : "border-border bg-accent/30"}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div>
                                            <p className="font-semibold text-foreground">{req.offerName}</p>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {req.price ? <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted">{req.price}</span> : null}
                                              {needsReturn ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Deposit {req.deposit}</span> : null}
                                              {req.returnByDate ? <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted ring-1 ring-border">Return by {formatPacificDate(req.returnByDate, { month: "short", day: "numeric" })}</span> : null}
                                            </div>
                                          </div>
                                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${statusColors[req.status] ?? "bg-accent/30 text-muted ring-border"}`}>
                                            {statusLabels[req.status] ?? req.status}
                                          </span>
                                        </div>
                                        {req.notes ? <p className="mt-2 text-xs text-muted italic">&ldquo;{req.notes}&rdquo;</p> : null}

                                        {/* Pending — Approve / Deny */}
                                        {req.status === "pending" ? (
                                          <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-100 pt-3">
                                            <Button
                                              type="button"
                                              className="h-7 rounded-full bg-emerald-600 px-3 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                              onClick={() => { approveServiceRequest(req.id); setSrTick((t) => t + 1); showToast(`Approved "${req.offerName}".`); }}
                                            >
                                              Approve
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className="h-7 rounded-full border-rose-200 px-3 text-[11px] font-semibold text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                                              onClick={() => { denyServiceRequest(req.id); setSrTick((t) => t + 1); showToast("Request denied."); }}
                                            >
                                              Deny
                                            </Button>
                                          </div>
                                        ) : null}

                                        {/* Approved / Returned — charges */}
                                        {(req.status === "approved" || req.status === "returned") ? (
                                          <div className="mt-3 rounded-xl bg-card p-3 ring-1 ring-border">
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Charges</p>
                                            <div className="space-y-2">
                                              {req.price ? (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs text-muted">Service fee · {req.price}</span>
                                                  {req.servicePaid ? (
                                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Paid</span>
                                                  ) : (
                                                    <Button type="button" className="h-6 rounded-full px-2.5 text-[10px] font-semibold" onClick={() => { markServiceRequestServicePaid(req.id); setSrTick((t) => t + 1); showToast("Service charge marked paid."); }}>
                                                      Mark paid
                                                    </Button>
                                                  )}
                                                </div>
                                              ) : null}
                                              {needsReturn ? (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs text-muted">Deposit · {req.deposit}</span>
                                                  {req.depositPaid ? (
                                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Refunded</span>
                                                  ) : (
                                                    <Button type="button" className="h-6 rounded-full px-2.5 text-[10px] font-semibold" onClick={() => { markServiceRequestDepositPaid(req.id); setSrTick((t) => t + 1); showToast("Deposit marked refunded."); }}>
                                                      Mark refunded
                                                    </Button>
                                                  )}
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        ) : null}

                                        {req.returnPhotoDataUrl ? (
                                          <div className="mt-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Return photo</p>
                                            <a href={req.returnPhotoDataUrl} target="_blank" rel="noreferrer" className="mt-2 block w-28 overflow-hidden rounded-xl border border-border">
                                              <Image src={req.returnPhotoDataUrl} alt="Return" width={112} height={84} className="h-20 w-full object-cover" unoptimized />
                                            </a>
                                          </div>
                                        ) : null}
                                        {req.status === "denied" && req.managerNote ? (
                                          <p className="mt-2 text-xs text-rose-600">Note: {req.managerNote}</p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                  </div>
                                </>
                              ) : null}
                              {residentWorkOrders.length > 0 ? (
                                <>
                                  {residentServiceRequests.length > 0 ? <div className="border-t border-border my-2" /> : null}
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Work orders</p>
                                  <div className="space-y-4">
                                  {residentWorkOrders.map((workOrder) => {
                                    const pendingCharge = findPendingWorkOrderCharge(workOrder.id);
                                    return (
                                      <div key={workOrder.id} className="rounded-2xl border border-border bg-accent/30 p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-base font-semibold text-foreground">{workOrder.title}</p>
                                              <span className="inline-flex rounded-full bg-accent/30 px-2.5 py-1 text-[11px] font-semibold text-muted">
                                                {workOrder.priority}
                                              </span>
                                              <span className="inline-flex rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-border">
                                                {workOrder.status}
                                              </span>
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{workOrder.description}</p>
                                            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Preferred arrival</p>
                                                <p className="mt-1 text-foreground">{workOrder.preferredArrival?.trim() || "Anytime"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visit</p>
                                                <p className="mt-1 text-foreground">{workOrder.scheduled && workOrder.scheduled !== "—" ? workOrder.scheduled : "Not scheduled"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current cost</p>
                                                <p className="mt-1 text-foreground">{workOrder.cost !== "—" && workOrder.cost.trim() ? workOrder.cost : "—"}</p>
                                              </div>
                                              <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Payment</p>
                                                <p className="mt-1 text-foreground">{pendingCharge ? `Pending · ${pendingCharge.balanceLabel}` : "No pending payment"}</p>
                                              </div>
                                            </div>
                                            {workOrder.photoDataUrls?.length ? (
                                              <div className="mt-4">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Photos</p>
                                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                                  {workOrder.photoDataUrls.map((src, index) => (
                                                    <a
                                                      key={`${workOrder.id}-photo-${index}`}
                                                      href={src}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="block overflow-hidden rounded-xl border border-border bg-card"
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

                                          <div className="w-full rounded-2xl border border-border bg-card p-3 lg:w-[22rem]">
                                            <div>
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cost</p>
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
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visit date & time</p>
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
                                                className="rounded-full border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]"
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
                                </>
                              ) : null}
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Inbox</p>
                                  <p className="mt-1 text-sm text-muted">Messages for this specific resident appear here directly.</p>
                                </div>
                                <Button type="button" variant="outline" className="rounded-full px-3 py-1 text-xs" onClick={() => setMessageOpen(true)}>
                                  New message
                                </Button>
                              </div>
                              {residentInboxThreads.length === 0 ? (
                                <p className="mt-3 text-sm text-muted">No messages on file for this resident yet.</p>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  {residentInboxThreads.map((thread) => (
                                    <div key={thread.id} className="rounded-xl border border-border bg-accent/30 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-semibold text-foreground">{thread.subject}</p>
                                          <p className="text-xs text-muted">
                                            {thread.from} · {thread.time}
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold text-muted ring-1 ring-border">
                                          {thread.folder === "sent" ? "Sent" : "Inbox"}
                                        </span>
                                      </div>
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{thread.body}</p>
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
      </>
      )}

      <Modal open={addResidentOpen} title="Add resident" onClose={() => setAddResidentOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs text-muted">Creates an active resident record with an Axis ID. No application or lease is generated.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Full name *</span>
              <Input value={arName} onChange={(e) => setArName(e.target.value)} placeholder="Jane Smith" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Email *</span>
              <Input type="email" value={arEmail} onChange={(e) => setArEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Property</span>
              <select
                value={arPropertyId}
                onChange={(e) => { setArPropertyId(e.target.value); setArRoomId(""); }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
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
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
              <span className="font-medium text-muted">Room</span>
              {arRoomOptions.length > 0 ? (
                <select
                  value={arRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setArRoomId(roomId);
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="">Select room…</option>
                  {arRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.monthlyRent ? ` — $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly rent ($)</span>
              <Input type="number" min={0} step={0.01} value={arRent} onChange={(e) => setArRent(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly utilities ($)</span>
              <Input type="number" min={0} step={0.01} value={arUtilities} onChange={(e) => setArUtilities(e.target.value)} placeholder="175.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in fee ($)</span>
              <Input type="number" min={0} step={0.01} value={arMoveInFee} onChange={(e) => setArMoveInFee(e.target.value)} placeholder="200.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Security deposit ($)</span>
              <Input type="number" min={0} step={0.01} value={arSecurityDeposit} onChange={(e) => setArSecurityDeposit(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in date</span>
              <Input type="date" value={arMoveInDate} onChange={(e) => setArMoveInDate(e.target.value)} />
            </label>
            {!isMonthToMonthLease ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Move-out date</span>
                <Input type="date" value={arMoveOutDate} onChange={(e) => setArMoveOutDate(e.target.value)} />
              </label>
            ) : null}
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Notes</span>
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

      <Modal open={editResidentOpen} title="Edit resident" onClose={() => setEditResidentOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs text-muted">Changes here update the resident record and application simultaneously.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Full name *</span>
              <Input value={erName} onChange={(e) => setErName(e.target.value)} placeholder="Jane Smith" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Email</span>
              <Input type="email" value={erEmail} onChange={(e) => setErEmail(e.target.value)} placeholder="resident@email.com" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Property</span>
              <select
                value={erPropertyId}
                onChange={(e) => {
                  setErPropertyId(e.target.value);
                  setErRoomId("");
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
              <select
                value={erLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === AR_LEASE_TERM_CUSTOM) {
                    if (AR_LEASE_TERM_PRESETS.includes(erLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])) {
                      setErLeaseTerm("");
                    }
                    return;
                  }
                  setErLeaseTerm(selected);
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select…</option>
                <option value="Month-to-month">Month-to-month</option>
                <option value="12 months">12 months</option>
                <option value="6 months">6 months</option>
                <option value="3 months">3 months</option>
                <option value={AR_LEASE_TERM_CUSTOM}>Custom…</option>
              </select>
              {erLeaseTermSelectValue === AR_LEASE_TERM_CUSTOM ? (
                <Input
                  className="mt-2"
                  value={erLeaseTerm}
                  onChange={(e) => setErLeaseTerm(e.target.value)}
                  placeholder="e.g. 9 months"
                />
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Room</span>
              {erRoomOptions.length > 0 ? (
                <select
                  value={erRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setErRoomId(roomId);
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="">Select room…</option>
                  {erRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.monthlyRent ? ` — $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly rent ($)</span>
              <Input type="number" min={0} step={0.01} value={erRent} onChange={(e) => setErRent(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly utilities ($)</span>
              <Input type="number" min={0} step={0.01} value={erUtilities} onChange={(e) => setErUtilities(e.target.value)} placeholder="175.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in fee ($)</span>
              <Input type="number" min={0} step={0.01} value={erMoveInFee} onChange={(e) => setErMoveInFee(e.target.value)} placeholder="200.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Security deposit ($)</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={erSecurityDeposit}
                onChange={(e) => setErSecurityDeposit(e.target.value)}
                placeholder="875.00"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in date</span>
              <Input type="date" value={erMoveInDate} onChange={(e) => setErMoveInDate(e.target.value)} />
            </label>
            {!isEditMonthToMonthLease ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Move-out date</span>
                <Input type="date" value={erMoveOutDate} onChange={(e) => setErMoveOutDate(e.target.value)} />
              </label>
            ) : null}
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Notes</span>
              <Textarea
                className="min-h-[72px]"
                value={erNotes}
                onChange={(e) => setErNotes(e.target.value)}
                placeholder="Any additional details about this resident…"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditResidentOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveEditedResident}>
              Save resident
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={addChargeOpen} title={editChargeId ? "Edit charge" : "Add charge"} onClose={() => setAddChargeOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {editChargeId ? "Updating" : "Adding"} charge for{" "}
            <span className="font-semibold text-foreground">{selected?.name || selected?.email}</span>.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Charge title</span>
            <Input
              value={chargeTitle}
              onChange={(e) => setChargeTitle(e.target.value)}
              placeholder="e.g. Late fee, Cleaning fee, Parking"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Amount ($)</span>
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
              className="h-4 w-4 rounded border-border text-primary"
            />
            <span className="font-medium text-muted">Block lease signing until paid</span>
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddChargeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={submitCharge}>
              {editChargeId ? "Save changes" : "Review & add charge"}
            </Button>
          </div>
        </div>
      </Modal>

      <PortalNotificationPreviewModal
        open={chargeNoticePreview !== null && selected !== null}
        title="New charge — notification preview"
        onClose={() => setChargeNoticePreview(null)}
        recipient={selected?.email ?? ""}
        subject={chargeNoticePreview ? `New charge: ${chargeNoticePreview.title}` : ""}
        body={
          chargeNoticePreview && selected
            ? buildNewChargeNoticeBody({
                residentName: selected.name,
                chargeTitle: chargeNoticePreview.title,
                amountLabel: `$${chargeNoticePreview.amount.toFixed(2)}`,
                propertyLabel: selected.propertyLabel,
              })
            : ""
        }
        confirmLabel="Add charge & send notice"
        confirmLabelWithoutMessage="Add charge only"
        confirmBusy={chargeNoticeBusy}
        confirmBusyLabel="Adding…"
        onConfirm={(skipMessage) => void confirmChargeNotice(skipMessage)}
      />

      <PortalNotificationPreviewModal
        open={welcomePreviewFor !== null}
        title="Email account setup — preview"
        onClose={() => setWelcomePreviewFor(null)}
        recipient={welcomePreviewFor?.email ?? ""}
        subject={RESIDENT_WELCOME_EMAIL_SUBJECT}
        body={welcomePreviewContent}
        confirmLabel="Send email"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={welcomePreviewFor !== null && welcomeEmailBusyForResident === welcomePreviewFor.id}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!welcomePreviewFor) return;
          if (skipMessage) {
            setWelcomePreviewFor(null);
            return;
          }
          const res = welcomePreviewFor;
          setWelcomePreviewFor(null);
          void sendResidentAccountEmail(res);
        }}
      />

      <PortalNotificationPreviewModal
        open={reminderPreview !== null}
        title="Payment reminder — preview"
        onClose={() => setReminderPreview(null)}
        recipient={reminderPreview?.res.email ?? ""}
        subject={reminderPreview?.subject ?? ""}
        body={reminderPreview?.body ?? ""}
        confirmLabel="Send reminder"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={reminderBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!reminderPreview) return;
          if (skipMessage) {
            setReminderPreview(null);
            return;
          }
          void doSendPaymentReminder(reminderPreview.res, reminderPreview.subject, reminderPreview.body);
        }}
      />

      <PortalNotificationPreviewModal
        open={leaseSentPreview !== null}
        title="Send lease to resident — preview"
        onClose={() => setLeaseSentPreview(null)}
        recipient={leaseSentPreview?.recipient ?? ""}
        subject={leaseSentPreview?.subject ?? ""}
        body={leaseSentPreview?.body ?? ""}
        footerNote="The lease will be released to the resident portal after you confirm. This message is delivered to Axis inbox and email."
        confirmLabel="Send lease & notification"
        confirmLabelWithoutMessage="Send lease only"
        confirmBusy={leaseSendBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => void confirmSendLeaseToResident(skipMessage)}
      />

      <PortalNotificationPreviewModal
        open={leaseReminderPreview !== null}
        title="Lease signing reminder — preview"
        onClose={() => setLeaseReminderPreview(null)}
        recipient={leaseReminderPreview?.recipient ?? ""}
        subject={leaseReminderPreview?.subject ?? ""}
        body={leaseReminderPreview?.body ?? ""}
        confirmLabel="Send reminder"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={leaseReminderBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!leaseReminderPreview) return;
          if (skipMessage) {
            setLeaseReminderPreview(null);
            return;
          }
          const preview = leaseReminderPreview;
          setLeaseReminderPreview(null);
          void sendLeaseSigningReminder(preview.res, preview.leaseId, preview.subject, preview.body);
        }}
      />

      <Modal open={messageOpen} title="Message resident" onClose={() => setMessageOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Sending to <span className="font-semibold text-foreground">{selected?.email || "resident"}</span>.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-muted">Subject</span>
            <Input className="mt-1.5" value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="Subject" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-muted">Message</span>
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

      <ScheduledMessageEditModal
        open={Boolean(scheduleEdit)}
        message={scheduleEdit}
        onClose={() => setScheduleEdit(null)}
        onSaved={() => void reloadSchedule()}
      />
      <ReminderSettingsModal
        open={reminderSettingsOpen}
        onClose={() => setReminderSettingsOpen(false)}
        settings={reminderSettings}
        onSaved={(next) => {
          setReminderSettings(next);
          void reloadSchedule();
        }}
      />
    </>
  );
}

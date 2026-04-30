"use client";

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
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  createManagerCharge,
  HOUSEHOLD_CHARGES_EVENT,
  markHouseholdChargePaid,
  readChargesForResident,
  updateHouseholdChargeAmount,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { readManagerApplicationRows, syncManagerApplicationsFromServer, writeManagerApplicationRows } from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  appendLeaseThreadMessage,
  generateLeaseHtmlForRow,
  LEASE_PIPELINE_EVENT,
  managerUploadLeasePdf,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  updateLeasePipelineRow,
  downloadLeaseFromRow,
  printLeaseAsPdf,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  deleteManagerWorkOrderRow,
} from "@/lib/manager-work-orders-storage";
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
};

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

function chargeEditAmountValue(charge: HouseholdCharge): string {
  return String(centsFromLabel(charge.balanceLabel) / 100 || centsFromLabel(charge.amountLabel) / 100 || "").replace(/\.0+$/, "");
}

export function ManagerResidents() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [workOrderTick, setWorkOrderTick] = useState(0);
  const [inboxTick, setInboxTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
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
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
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
    ]).then(() => {
      if (!cancelled) setPropertyTick((n) => n + 1);
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
      .filter(
        (row) =>
          row.bucket === "approved" &&
          row.email?.trim() &&
          residentAccountEmails.has(row.email.trim().toLowerCase()) &&
          applicationVisibleToPortalUser(row, userId),
      )
      .map((row) => {
        const propId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
        const prop = propId ? getPropertyById(propId) : null;
        const roomLabel = getRoomChoiceLabel(
          row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "",
        ).split(" · ")[0]?.trim() || "";
        return {
          id: row.id,
          name: row.name,
          email: row.email!.trim(),
          propertyId: propId,
          propertyLabel: prop?.title?.trim() || row.property,
          roomLabel,
          signedMonthlyRent: row.signedMonthlyRent ?? null,
          axisId: `AXIS-R-${row.id.slice(0, 8).toUpperCase()}`,
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

  const filtered = useMemo(() => {
    const base = propertyFilter
      ? residents.filter((r) => r.propertyId === propertyFilter)
      : residents;
    return [...base].sort((a, b) => {
      const propCmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (propCmp !== 0) return propCmp;
      const aNum = parseInt(a.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      const bNum = parseInt(b.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      return aNum - bNum;
    });
  }, [residents, propertyFilter]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  const residentCharges = useMemo<HouseholdCharge[]>(() => {
    void hcTick;
    if (!selected?.email) return [];
    return readChargesForResident(selected.email, null);
  }, [selected, hcTick]);

  const residentLease = useMemo<LeasePipelineRow | null>(() => {
    void leaseTick;
    if (!selected?.email) return null;
    const email = selected.email.trim().toLowerCase();
    return readLeasePipeline(userId).find((row) => row.residentEmail.trim().toLowerCase() === email) ?? null;
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
    if (!chargeTitle.trim()) { showToast("Enter a charge title."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { showToast("Enter a valid amount."); return; }
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

  function markPaid(chargeId: string) {
    if (markHouseholdChargePaid(chargeId, userId ?? null)) {
      showToast("Marked as paid.");
      setHcTick((n) => n + 1);
    }
  }

  return (
    <ManagerPortalPageShell
      title="Residents"
      titleAside={
        <PortalPropertyFilterPill
          propertyOptions={propertyOptions}
          propertyValue={propertyFilter}
          onPropertyChange={setPropertyFilter}
        />
      }
    >
      {filtered.length === 0 ? (
        <PortalDataTableEmpty
          message={
            residents.length === 0
              ? "No active residents yet. Residents appear here after approval and once they create an Axis resident account."
              : "No residents match the current filter."
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
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
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
                                <div>
                                  <span className="text-slate-500">Status</span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                                      Active resident
                                    </span>
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
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lease</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {residentLease
                                      ? `${residentLease.stageLabel} · ${residentLease.application?.leaseStart || "No move-in"}${residentLease.application?.leaseEnd ? ` to ${residentLease.application.leaseEnd}` : ""}`
                                      : "No lease created yet for this resident."}
                                  </p>
                                </div>
                                {residentLease ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={() => {
                                        const result = generateLeaseHtmlForRow(residentLease.id);
                                        if (result.ok) {
                                          setLeaseTick((n) => n + 1);
                                          showToast(`Lease generated (v${result.version}).`);
                                        } else {
                                          showToast(result.error);
                                        }
                                      }}
                                    >
                                      Generate lease
                                    </Button>
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
                                    {residentLease.bucket === "manager" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          if (!residentAccountEmails.has(selected.email.trim().toLowerCase())) {
                                            showToast("Resident must create their account before the lease can be sent.");
                                            return;
                                          }
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Sent lease to resident for review.");
                                          updateLeasePipelineRow(residentLease.id, { bucket: "resident" });
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease moved to With resident.");
                                        }}
                                      >
                                        Send to resident
                                      </Button>
                                    ) : residentLease.bucket === "resident" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Moved lease back to manager review.");
                                          updateLeasePipelineRow(residentLease.id, { bucket: "manager" });
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease moved to Manager review.");
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
                                  </div>
                                ) : null}
                              </div>
                              {residentLease ? (
                                <LeaseDocumentPreview row={residentLease} />
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
                                  {chargeTab === "pending" ? "No pending charges." : "No paid charges."}
                                </p>
                              ) : (
                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-200">
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Charge</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Status</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleCharges.map((c) => (
                                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                                          <td className="py-2 pr-4 font-medium text-slate-900">{c.title}</td>
                                          <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{c.amountLabel}</td>
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
                                                  {c.paidAt ? new Date(c.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
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
                                  <p className="mt-1 text-sm text-slate-500">Review and manage work orders submitted by this resident here.</p>
                                </div>
                              </div>
                              {residentWorkOrders.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">No work orders for this resident yet.</p>
                              ) : (
                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-200">
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Title</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Status</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Priority</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-slate-500">Visit</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-slate-500">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {residentWorkOrders.map((workOrder) => (
                                        <tr key={workOrder.id} className="border-b border-slate-100 last:border-0">
                                          <td className="py-2 pr-4">
                                            <p className="font-medium text-slate-900">{workOrder.title}</p>
                                            <p className="text-xs text-slate-500 whitespace-pre-wrap">{workOrder.description}</p>
                                          </td>
                                          <td className="py-2 pr-4 text-slate-700">{workOrder.status}</td>
                                          <td className="py-2 pr-4">
                                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                              {workOrder.priority}
                                            </span>
                                          </td>
                                          <td className="py-2 pr-4 text-slate-700">{workOrder.scheduled}</td>
                                          <td className="py-2 text-right">
                                            <div className="flex justify-end gap-2">
                                              {workOrder.bucket !== "completed" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="rounded-full px-2 py-0.5 text-xs"
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
                                                className="rounded-full px-2 py-0.5 text-xs"
                                                onClick={() => {
                                                  deleteManagerWorkOrderRow(workOrder.id);
                                                  setWorkOrderTick((n) => n + 1);
                                                  showToast("Work order deleted.");
                                                }}
                                              >
                                                Delete
                                              </Button>
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
                                          <p className="text-xs text-slate-500">{thread.from} · {thread.time}</p>
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

      <Modal open={addChargeOpen} title={editChargeId ? "Edit charge" : "Add charge"} onClose={() => setAddChargeOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            {editChargeId ? "Updating" : "Adding"} charge for <span className="font-semibold text-slate-900">{selected?.name || selected?.email}</span>.
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
  );
}

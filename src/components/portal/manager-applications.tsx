"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { ManagerApplicationReadonlyReview } from "@/components/portal/manager-application-readonly-review";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  deleteManagerApplicationFromServer,
  effectiveApplicationForRow,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  writeManagerApplicationRows,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
  applicationVisibleToPortalUser,
  buildManagerPropertyFilterOptions,
  type ManagerPropertyFilterOption,
} from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { getPropertyById, getRoomChoiceLabel, getRoomOptionsForProperty, LEASE_TERM_OPTIONS, SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/data";
import {
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  removeAllApplicationCharges,
  removeApprovedApplicationCharges,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";

function ApplicantIds({ axisId }: { axisId: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Axis ID</p>
      <p className="mt-2 font-mono text-sm font-medium text-slate-900">{axisId}</p>
    </div>
  );
}

function countByBucket(rows: DemoApplicantRow[]) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

async function syncResidentApproval(row: DemoApplicantRow, nextBucket: ManagerApplicationBucket) {
  const email = row.email?.trim().toLowerCase();
  if (!email) return;
  await fetch("/api/portal/resident-approval", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email,
      approved: nextBucket === "approved",
    }),
  });
}

function stageLabelForRow(row: DemoApplicantRow, bucket: ManagerApplicationBucket) {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Submitted";
}

function inferRoomRent(propertyId: string, roomChoice: string): number | null {
  if (!propertyId || !roomChoice) return null;
  const match = getRoomOptionsForProperty(propertyId).find((option) => option.value === roomChoice);
  if (!match) return null;
  const rent = Number.parseFloat(match.label.replace(/[^0-9.]+/g, ""));
  return Number.isFinite(rent) && rent > 0 ? rent : null;
}

function roomSortKey(row: DemoApplicantRow): string {
  return (
    getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "") ||
    row.stage ||
    ""
  ).trim();
}

function displayRoomForRow(row: DemoApplicantRow): string {
  const raw = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  if (!raw) return "—";
  // Return just the room name (first segment before " · ")
  const full = getRoomChoiceLabel(raw);
  return full.split(" · ")[0]?.trim() || full || "—";
}

function sortApplicationRows(rows: DemoApplicantRow[], bucket: ManagerApplicationBucket): DemoApplicantRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    if (bucket === "approved") {
      const propertyCmp = collator.compare(a.property || "", b.property || "");
      if (propertyCmp !== 0) return propertyCmp;
      const roomCmp = collator.compare(roomSortKey(a), roomSortKey(b));
      if (roomCmp !== 0) return roomCmp;
    }
    const applicantCmp = collator.compare(a.name || "", b.name || "");
    if (applicantCmp !== 0) return applicantCmp;
    return collator.compare(a.id, b.id);
  });
}

function ManagerApplicationPlacementEditor({
  row,
  propertyOptions,
  onSave,
}: {
  row: DemoApplicantRow;
  propertyOptions: ManagerPropertyFilterOption[];
  onSave: (
    propertyId: string,
    roomChoice: string,
    signedMonthlyRent: number,
    leaseTerm: string,
    leaseStart: string,
    leaseEnd: string,
    utilitiesOverride: string,
    securityDepositOverride: string,
    moveInFeeOverride: string,
    otherCostLabel: string,
    otherCostAmount: string,
  ) => void;
}) {
  const initialPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const initialRoomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const initialSignedRent = row.signedMonthlyRent && row.signedMonthlyRent > 0 ? String(row.signedMonthlyRent) : "";
  const initialLeaseTerm = row.application?.rentalType === "short_term" ? SHORT_TERM_LEASE_TERM : row.application?.leaseTerm?.trim() || "";
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [roomChoice, setRoomChoice] = useState(initialRoomChoice);
  const [signedRent, setSignedRent] = useState(initialSignedRent);
  const [leaseTerm, setLeaseTerm] = useState(initialLeaseTerm);
  const [leaseStart, setLeaseStart] = useState(row.application?.leaseStart?.trim() || "");
  const [leaseEnd, setLeaseEnd] = useState(row.application?.leaseEnd?.trim() || "");
  const [utilitiesOverride, setUtilitiesOverride] = useState(row.application?.managerUtilitiesOverride?.trim() || "");
  const [securityDepositOverride, setSecurityDepositOverride] = useState(row.application?.managerSecurityDepositOverride?.trim() || "");
  const [moveInFeeOverride, setMoveInFeeOverride] = useState(row.application?.managerMoveInFeeOverride?.trim() || "");
  const [otherCostLabel, setOtherCostLabel] = useState(row.application?.managerOtherCostLabel?.trim() || "");
  const [otherCostAmount, setOtherCostAmount] = useState(row.application?.managerOtherCostAmount?.trim() || "");
  const userEditedRentRef = useRef(false);

  const roomOptions = useMemo(
    () =>
      propertyId
        ? getRoomOptionsForProperty(propertyId, {
            leaseStart,
            leaseEnd,
            excludeApplicationId: row.id,
          })
        : [],
    [leaseEnd, leaseStart, propertyId, row.id],
  );

  const roomChoiceBelongsToProperty =
    Boolean(roomChoice) && (roomChoice === propertyId || roomChoice.startsWith(`${propertyId}::`));
  const displayedRoomOptions = useMemo(() => {
    if (!roomChoice || !roomChoiceBelongsToProperty || roomOptions.some((opt) => opt.value === roomChoice)) {
      return roomOptions;
    }
    const label = getRoomChoiceLabel(roomChoice);
    return label ? [{ value: roomChoice, label }, ...roomOptions] : roomOptions;
  }, [roomChoice, roomChoiceBelongsToProperty, roomOptions]);

  const applicantChoices = [
    row.application?.roomChoice1?.trim(),
    row.application?.roomChoice2?.trim(),
    row.application?.roomChoice3?.trim(),
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Final placement</p>
          <p className="mt-1 text-sm text-slate-600">Only the assigned house and room can be changed here. The rest of the application stays locked.</p>
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">House</span>
            <Select
              value={propertyId}
              onChange={(e) => {
                const nextPropertyId = e.target.value;
                setPropertyId(nextPropertyId);
                if (roomChoice && roomChoice !== nextPropertyId && !roomChoice.startsWith(`${nextPropertyId}::`)) {
                  setRoomChoice("");
                }
              }}
            >
              <option value="">Select property</option>
              {propertyOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Room</span>
            <Select
              value={roomChoice}
              onChange={(e) => {
                const nextRoomChoice = e.target.value;
                setRoomChoice(nextRoomChoice);
                if (!userEditedRentRef.current && !signedRent.trim()) {
                  const inferred = inferRoomRent(propertyId, nextRoomChoice);
                  if (inferred) setSignedRent(String(inferred));
                }
              }}
              disabled={!propertyId || displayedRoomOptions.length === 0}
            >
              <option value="">{propertyId ? "Select room" : "Select house first"}</option>
              {displayedRoomOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Signed monthly rent</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={signedRent}
              onChange={(e) => { userEditedRentRef.current = true; setSignedRent(e.target.value); }}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="800"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stay type</span>
            <Select
              value={leaseTerm}
              onChange={(e) => {
                const nextLeaseTerm = e.target.value;
                setLeaseTerm(nextLeaseTerm);
                if (nextLeaseTerm === "Month-to-Month") {
                  setLeaseEnd("");
                }
              }}
            >
              <option value="">Select stay type</option>
              <option value={SHORT_TERM_LEASE_TERM}>Short-Term Stay</option>
              {LEASE_TERM_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "Month-to-Month" ? "Month-to-Month" : `${opt} lease`}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Move-in date</span>
            <input
              type="date"
              value={leaseStart}
              onChange={(e) => setLeaseStart(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {leaseTerm === SHORT_TERM_LEASE_TERM ? "Move-out date" : leaseTerm === "Month-to-Month" ? "Move-out date" : "Lease end"}
            </span>
            <input
              type="date"
              value={leaseEnd}
              onChange={(e) => setLeaseEnd(e.target.value)}
              disabled={leaseTerm === "Month-to-Month"}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition disabled:bg-slate-50 disabled:text-slate-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Utilities</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={utilitiesOverride}
              onChange={(e) => setUtilitiesOverride(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="175"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Security deposit</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={securityDepositOverride}
              onChange={(e) => setSecurityDepositOverride(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="400"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Move-in cost</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={moveInFeeOverride}
              onChange={(e) => setMoveInFeeOverride(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="200"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Other cost label</span>
            <input
              type="text"
              value={otherCostLabel}
              onChange={(e) => setOtherCostLabel(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="Month-to-month fee"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Other cost amount</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={otherCostAmount}
              onChange={(e) => setOtherCostAmount(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="25"
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-800">Applicant choices:</span>{" "}
          {applicantChoices.length ? applicantChoices.map((choice) => getRoomChoiceLabel(choice)).filter(Boolean).join(" · ") : "No room choices saved."}
        </p>
        <p>
          <span className="font-medium text-slate-800">Current assignment:</span>{" "}
          {propertyId && roomChoice ? `${getPropertyById(propertyId)?.title ?? propertyId} · ${getRoomChoiceLabel(roomChoice)}` : "Not assigned yet"}
        </p>
        <p>
          <span className="font-medium text-slate-800">Tenancy:</span>{" "}
          {leaseTerm || "Not set yet"}
          {leaseStart ? ` · move-in ${leaseStart}` : ""}
          {leaseEnd ? ` · ${leaseTerm === SHORT_TERM_LEASE_TERM ? "move-out" : "end"} ${leaseEnd}` : ""}
        </p>
        <p>
          <span className="font-medium text-slate-800">Lease timing:</span>{" "}
          {row.application?.leaseStart?.trim()
            ? `${row.application.leaseStart}${row.application?.leaseEnd?.trim() ? ` to ${row.application.leaseEnd}` : ""}`
            : "No lease dates submitted."}
        </p>
        <p>
          <span className="font-medium text-slate-800">Tenant rent snapshot:</span>{" "}
          {Number.parseFloat(signedRent) > 0 ? `$${Number.parseFloat(signedRent).toFixed(2)} / month` : "Set the rent this tenant signed for."}
        </p>
        <p>
          <span className="font-medium text-slate-800">Approved charges:</span>{" "}
          {[
            utilitiesOverride ? `utilities $${Number.parseFloat(utilitiesOverride || "0").toFixed(2)}` : null,
            securityDepositOverride ? `deposit $${Number.parseFloat(securityDepositOverride || "0").toFixed(2)}` : null,
            moveInFeeOverride ? `move-in $${Number.parseFloat(moveInFeeOverride || "0").toFixed(2)}` : null,
            otherCostLabel.trim() && otherCostAmount ? `${otherCostLabel.trim()} $${Number.parseFloat(otherCostAmount || "0").toFixed(2)}` : null,
          ].filter(Boolean).join(" · ") || "Using the listing defaults."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN_PRIMARY}
          disabled={!propertyId || !roomChoice || !(Number.parseFloat(signedRent) > 0) || !leaseTerm || !leaseStart || (leaseTerm !== "Month-to-Month" && !leaseEnd)}
          onClick={() =>
            onSave(
              propertyId,
              roomChoice,
              Number.parseFloat(signedRent),
              leaseTerm,
              leaseStart,
              leaseEnd,
              utilitiesOverride,
              securityDepositOverride,
              moveInFeeOverride,
              otherCostLabel,
              otherCostAmount,
            )
          }
        >
          Save placement
        </Button>
      </div>
    </div>
  );
}

export function ManagerApplications() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerApplicationBucket>("pending");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rows, setRows] = useState<DemoApplicantRow[]>([]);
  const [portfolioTick, setPortfolioTick] = useState(0);
  const [roomSortDir, setRoomSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const sync = () => setRows(readManagerApplicationRows());
    sync();
    void syncManagerApplicationsFromServer().then(sync);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    syncPropertyPipelineFromServer()
      .finally(() => {
        if (cancelled) return;
        setPortfolioTick((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const bump = () => setPortfolioTick((n) => n + 1);
    for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(ev, bump);
    }
    return () => {
      for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(ev, bump);
      }
    };
  }, []);

  const persist = useCallback((next: DemoApplicantRow[]) => {
    setRows(next);
    writeManagerApplicationRows(next);
  }, []);

  const propertyDataLoading = authReady && Boolean(userId) && portfolioTick === 0;
  const propertyOptions = buildManagerPropertyFilterOptions(userId);
  const placementPropertyOptions = propertyOptions;

  const scopedRows = useMemo(() => {
    if (!authReady) return [];
    return rows.filter((r) => applicationVisibleToPortalUser(r, userId));
  }, [rows, userId, authReady]);

  const counts = useMemo(() => countByBucket(scopedRows), [scopedRows]);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts],
  );

  const rowsForBucket = useMemo(() => {
    const inBucket = scopedRows.filter((r) => r.bucket === bucket);
    const filtered = !propertyFilter.trim()
      ? inBucket
      : inBucket.filter((r) => (r.assignedPropertyId?.trim() || r.propertyId?.trim() || r.application?.propertyId?.trim()) === propertyFilter);
    const sorted = sortApplicationRows(filtered, bucket);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...sorted].sort((a, b) => {
      const cmp = collator.compare(roomSortKey(a), roomSortKey(b));
      return roomSortDir === "asc" ? cmp : -cmp;
    });
  }, [scopedRows, bucket, propertyFilter, roomSortDir]);

  const refreshTable = useCallback(() => {
    setRows(readManagerApplicationRows());
    void syncPropertyPipelineFromServer().then(() => setPortfolioTick((n) => n + 1));
    showToast("Refreshed.");
  }, [showToast]);

  const setRowBucket = async (id: string, nextBucket: ManagerApplicationBucket) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const next = rows.map((r) => (r.id === id ? { ...r, bucket: nextBucket, stage: stageLabelForRow(r, nextBucket) } : r));
    persist(next);
    const updatedRow = next.find((r) => r.id === id) ?? row;
    await syncHouseholdChargesFromServer();
    if (nextBucket === "approved") {
      recordApprovedApplicationCharges(updatedRow, userId ?? null);
    } else if (nextBucket === "pending") {
      removeApprovedApplicationCharges(id, userId ?? null);
      recordSubmittedApplicationFeeCharge(updatedRow, userId ?? null);
    } else {
      removeAllApplicationCharges(id, userId ?? null);
    }
    if (row) {
      try {
        await syncResidentApproval(row, nextBucket);
      } catch {
        /* keep local workflow moving even if profile sync fails */
      }
    }
    setExpandedId(null);
    setBucket(nextBucket);
    const msg =
      nextBucket === "approved"
        ? "Application approved."
        : nextBucket === "rejected"
          ? "Application rejected."
          : "Moved to Pending.";
    showToast(msg);
  };

  const savePlacement = useCallback(
    (
      id: string,
      propertyId: string,
      roomChoice: string,
      signedMonthlyRent: number,
      leaseTerm: string,
      leaseStart: string,
      leaseEnd: string,
      utilitiesOverride: string,
      securityDepositOverride: string,
      moveInFeeOverride: string,
      otherCostLabel: string,
      otherCostAmount: string,
    ) => {
      const property = getPropertyById(propertyId);
      const roomLabel = getRoomChoiceLabel(roomChoice);
      if (!property || !roomLabel || !(signedMonthlyRent > 0) || !leaseTerm || !leaseStart || (leaseTerm !== "Month-to-Month" && !leaseEnd)) {
        showToast("Select a valid house, room, rent, and tenancy dates.");
        return;
      }
      const rentalType: "short_term" | "standard" = leaseTerm === SHORT_TERM_LEASE_TERM ? "short_term" : "standard";
      const next = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              property: property.title?.trim() || row.property,
              propertyId,
              assignedPropertyId: propertyId,
              assignedRoomChoice: roomChoice,
              signedMonthlyRent: Number(signedMonthlyRent.toFixed(2)),
              stage: stageLabelForRow(row, row.bucket),
              application: row.application
                ? {
                    ...row.application,
                    propertyId,
                    roomChoice1: roomChoice,
                    rentalType,
                    leaseTerm,
                    leaseStart,
                    leaseEnd: leaseTerm === "Month-to-Month" ? "" : leaseEnd,
                    managerRentOverride: signedMonthlyRent > 0 ? String(Number(signedMonthlyRent.toFixed(2))) : "",
                    managerUtilitiesOverride: utilitiesOverride.trim(),
                    managerSecurityDepositOverride: securityDepositOverride.trim(),
                    managerMoveInFeeOverride: moveInFeeOverride.trim(),
                    managerOtherCostLabel: otherCostLabel.trim(),
                    managerOtherCostAmount: otherCostAmount.trim(),
                  }
                : row.application,
            }
          : row,
      );
      persist(next);
      showToast("Assigned house, room, stay type, and lease charges saved.");
    },
    [rows, persist, showToast],
  );

  const deleteApplication = async (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    const email = row?.email?.trim().toLowerCase();

    // Optimistic removal — update the UI immediately before any network calls.
    setRows((prev) => prev.filter((r) => r.id !== id));
    setExpandedId(null);

    const result = await deleteManagerApplicationFromServer(id);
    if (!result.ok) {
      // Roll back on failure.
      setRows(await syncManagerApplicationsFromServer());
      showToast(result.error ?? "Could not delete application.");
      return;
    }

    await syncHouseholdChargesFromServer();
    removeAllApplicationCharges(id, userId ?? null);

    let removedResidentAccess = true;
    if (email) {
      try {
        const res = await fetch("/api/portal/delete-resident-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        });
        if (!res.ok) removedResidentAccess = false;
      } catch {
        removedResidentAccess = false;
      }
    }

    void syncManagerApplicationsFromServer().then(setRows);
    showToast(
      email && !removedResidentAccess
        ? "Application deleted, but resident access could not be removed."
        : email
          ? "Application and resident access deleted."
          : "Application deleted.",
    );
  };

  return (
    <ManagerPortalPageShell
      title="Applications"
      titleAside={
        <>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={(id) => setPropertyFilter(id)}
          />
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refreshTable}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
          {propertyDataLoading ? <p className="text-xs text-slate-500">Loading properties from backend…</p> : null}
        </div>
      }
    >
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-slate-700"
                    onClick={() => setRoomSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  >
                    Room {roomSortDir === "asc" ? "↑" : "↓"}
                  </button>
                </th>
                <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!authReady ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    Loading applications…
                  </td>
                </tr>
              ) : rowsForBucket.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    {scopedRows.length === 0
                      ? "No applications yet for your listings and linked properties."
                      : propertyFilter.trim()
                        ? "No applications for this property in this tab."
                        : "No applications in this tab."}
                  </td>
                </tr>
              ) : (
                rowsForBucket.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>
                        <p className="font-medium text-slate-900">{row.name}</p>
                        {row.email ? <p className="mt-0.5 text-xs text-slate-500">{row.email}</p> : null}
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.id}</p>
                      </td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.property}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{displayRoomForRow(row)}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right align-middle`}>
                        <Button
                          type="button"
                          variant="outline"
                          className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                          <PortalTableDetailActions>
                            {row.bucket === "pending" ? (
                              <>
                                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setRowBucket(row.id, "approved")}>
                                  Approve
                                </Button>
                                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "rejected")}>
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "pending")}>
                                Move to pending
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
                              onClick={() => void deleteApplication(row.id)}
                            >
                              Delete application
                            </Button>
                          </PortalTableDetailActions>

                          {row.application ? (
                            <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4">
                              <ManagerApplicationPlacementEditor
                                key={[
                                  row.id,
                                  row.assignedPropertyId,
                                  row.assignedRoomChoice,
                                  row.signedMonthlyRent,
                                  row.application?.rentalType,
                                  row.application?.leaseTerm,
                                  row.application?.leaseStart,
                                  row.application?.leaseEnd,
                                ].join("|")}
                                row={row}
                                propertyOptions={placementPropertyOptions}
                                onSave={(
                                  propertyId,
                                  roomChoice,
                                  signedMonthlyRent,
                                  leaseTerm,
                                  leaseStart,
                                  leaseEnd,
                                  utilitiesOverride,
                                  securityDepositOverride,
                                  moveInFeeOverride,
                                  otherCostLabel,
                                  otherCostAmount,
                                ) =>
                                  savePlacement(
                                    row.id,
                                    propertyId,
                                    roomChoice,
                                    signedMonthlyRent,
                                    leaseTerm,
                                    leaseStart,
                                    leaseEnd,
                                    utilitiesOverride,
                                    securityDepositOverride,
                                    moveInFeeOverride,
                                    otherCostLabel,
                                    otherCostAmount,
                                  )
                                }
                              />
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Application on file</p>
                              <div className="mt-3">
                                <ManagerApplicationReadonlyReview
                                  partial={effectiveApplicationForRow(row) ?? row.application}
                                  assignedPropertyId={row.assignedPropertyId}
                                  assignedRoomChoice={row.assignedRoomChoice}
                                />
                              </div>
                            </div>
                          ) : null}

                          <ApplicantIds axisId={row.id} />

                          <p className="mt-4 text-sm leading-relaxed text-slate-600">
                            <span className="font-medium text-slate-800">Manager notes</span> — {row.detail}
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

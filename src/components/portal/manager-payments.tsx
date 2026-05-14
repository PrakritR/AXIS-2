"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_TOOLBAR_LABEL,
  PORTAL_TOOLBAR_SELECT,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { mergeManagerPaymentLedger } from "@/lib/demo-manager-payment-ledger";
import {
  householdChargeToLedgerRow,
  HOUSEHOLD_CHARGES_EVENT,
  readChargesForManager,
  reconcileApprovedResidentPaymentSchedules,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

type HouseSort = "house-asc" | "house-desc";

const PAYMENT_ACCOUNT_EXCLUSIONS = ["sharad ramachandran", "sharad"] as const;

function shouldExcludePaymentAccount(residentName: string, residentEmail?: string): boolean {
  const name = residentName.trim().toLowerCase();
  const email = (residentEmail ?? "").trim().toLowerCase();
  return PAYMENT_ACCOUNT_EXCLUSIONS.some((token) => name.includes(token) || email.includes(token));
}

function normalizePropertyLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

export function ManagerPayments() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentFilter, setResidentFilter] = useState("");
  const [houseSort, setHouseSort] = useState<HouseSort>("house-asc");
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const ledgerDataVersion = `${hcTick}:${applicationTick}:${propertyTick}`;

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    void syncHouseholdChargesFromServer(true).then(on);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  useEffect(() => {
    const on = () => setApplicationTick((n) => n + 1);
    // Only sync once on mount, not on every event to avoid excessive syncs
    void syncManagerApplicationsFromServer().then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, []);

  useEffect(() => {
    // Don't repeatedly sync applications on charge updates
    void syncPropertyPipelineFromServer().catch(() => undefined);
  }, []);}

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const visibleApprovedCount = readManagerApplicationRows().filter(
      (row) => row.bucket === "approved" && applicationVisibleToPortalUser(row, userId),
    ).length;
    if (visibleApprovedCount === 0) return;
    reconcileApprovedResidentPaymentSchedules(userId);
  }, [authReady, userId, applicationTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const payouts = params.get("payouts");
    const connect = params.get("connect");
    if (connect === "done" || connect === "refresh") {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "axis-stripe-connect", connect }, window.location.origin);
        } catch {
          /* cross-origin or closed */
        }
        window.close();
        return;
      }
    }
    if (payouts === "1") {
      window.location.replace(`${portalBase}/payments`);
    } else if (connect === "done" || connect === "refresh") {
      window.location.replace(`${portalBase}/payments?connect=${encodeURIComponent(connect)}`);
    }
  }, [portalBase]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "axis-stripe-connect") return;
      if (e.data?.connect === "done") {
        showToast("Payout status updated.");
      } else if (e.data?.connect === "refresh") {
        showToast("Setup link expired — open Payouts to try again.");
      }
      window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showToast]);

  const mergedRows = useMemo(() => {
    void ledgerDataVersion;
    const applications = readManagerApplicationRows();
    return [
      ...readChargesForManager(userId)
        .filter((charge) => !shouldExcludePaymentAccount(charge.residentName, charge.residentEmail))
        .map((charge) => {
        const ledgerRow = householdChargeToLedgerRow(charge);
        const chargeEmail = charge.residentEmail.trim().toLowerCase();
        const application = applications.find((row) => {
          if (charge.applicationId && row.id === charge.applicationId) return true;
          const rowEmail = row.email?.trim().toLowerCase();
          const rowPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
          return rowEmail === chargeEmail && rowPropertyId === charge.propertyId;
        });
        const roomChoice = application?.assignedRoomChoice?.trim() || application?.application?.roomChoice1?.trim() || "";
        const roomLabel = getRoomChoiceLabel(roomChoice).split(" · ")[0]?.trim() || "";
        return roomLabel ? { ...ledgerRow, roomNumber: roomLabel.replace(/^room\s+/i, "") } : ledgerRow;
      }),
      ...mergeManagerPaymentLedger().filter((row) => !shouldExcludePaymentAccount(row.residentName)),
    ];
  }, [userId, ledgerDataVersion]);

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      const key = normalizePropertyLabel(row.propertyName);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows]);

  const residentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      if (propertyFilter && normalizePropertyLabel(row.propertyName) !== propertyFilter) continue;
      const key = row.residentName.trim();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows, propertyFilter]);

  const activeResidentFilter = residentOptions.some((option) => option.id === residentFilter) ? residentFilter : "";

  const rowsForCounts = useMemo(() => {
    return mergedRows.filter((row) => {
      if (propertyFilter && normalizePropertyLabel(row.propertyName) !== propertyFilter) return false;
      return true;
    });
  }, [mergedRows, propertyFilter]);

  const counts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const r of rowsForCounts) {
      c[r.bucket] += 1;
    }
    return c;
  }, [rowsForCounts]);

  const tabs = useMemo(
    () => PAY_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );
  const rowsForBucket = useMemo(() => {
    const filtered = mergedRows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (propertyFilter && normalizePropertyLabel(r.propertyName) !== propertyFilter) return false;
      if (activeResidentFilter && r.residentName !== activeResidentFilter) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (propertyFilter) {
        const byResident = a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
        const residentOrder = houseSort === "house-asc" ? byResident : -byResident;
        if (residentOrder !== 0) return residentOrder;
      }
      const byHouse = a.propertyName.localeCompare(b.propertyName, undefined, { sensitivity: "base" });
      const houseOrder = houseSort === "house-asc" ? byHouse : -byHouse;
      if (houseOrder !== 0) return houseOrder;
      const byResident = a.residentName.localeCompare(b.residentName, undefined, { sensitivity: "base" });
      if (byResident !== 0) return byResident;
      return a.chargeTitle.localeCompare(b.chargeTitle, undefined, { sensitivity: "base" });
    });
  }, [mergedRows, bucket, propertyFilter, activeResidentFilter, houseSort]);

  const filterRow = (
    <div className="flex flex-col gap-4">
      <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
    </div>
  );

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={(nextProperty) => {
              setPropertyFilter(nextProperty);
              setResidentFilter("");
            }}
            residents
            residentOptions={residentOptions}
            residentValue={activeResidentFilter}
            onResidentChange={setResidentFilter}
          />
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-100/70 p-1 pr-1.5">
            <span className={`${PORTAL_TOOLBAR_LABEL} pl-2`}>
            {propertyFilter ? "Sort resident" : "Sort house"}
            </span>
            <select
              value={houseSort}
              onChange={(e) => setHouseSort(e.target.value as HouseSort)}
              className={`${PORTAL_TOOLBAR_SELECT} h-8 px-3 text-xs`}
            >
              <option value="house-asc">A-Z</option>
              <option value="house-desc">Z-A</option>
            </select>
          </label>
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setAddOpen(true)}>
            Add payment
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => {
              void Promise.all([
                syncPropertyPipelineFromServer({ force: true }),
                syncManagerApplicationsFromServer({ force: true }),
              ]).then(() => {
                reconcileApprovedResidentPaymentSchedules(userId ?? null);
                setHcTick((n) => n + 1);
                showToast("Payments regenerated from current listing settings.");
              });
            }}
          >
            Regenerate
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => {
              void Promise.all([
                syncHouseholdChargesFromServer(),
                syncManagerApplicationsFromServer({ force: true }),
                syncPropertyPipelineFromServer({ force: true }),
              ]).then(() => {
                setHcTick((n) => n + 1);
                setApplicationTick((n) => n + 1);
                setPropertyTick((n) => n + 1);
                showToast("Payments refreshed.");
              });
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={filterRow}
    >
      <ManagerPaymentsLedgerPanel
        rows={rowsForBucket}
        managerUserId={userId ?? null}
        activeBucket={bucket}
        onRowsChanged={() => setHcTick((n) => n + 1)}
      />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          showToast("Payment line added.");
          setAddOpen(false);
        }}
      />

    </ManagerPortalPageShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { Input, Select } from "@/components/ui/input";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { mergeManagerPaymentLedger } from "@/lib/demo-manager-payment-ledger";
import {
  householdChargeToLedgerRow,
  HOUSEHOLD_CHARGES_EVENT,
  pruneObsoleteManagerCharges,
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  readChargesForManager,
  syncHouseholdChargesFromServer,
  upsertRecurringRentProfile,
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
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

export function ManagerPayments() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const initialPayoutsOpen =
    typeof window !== "undefined" &&
    (() => {
      const params = new URLSearchParams(window.location.search);
      const payouts = params.get("payouts");
      const connect = params.get("connect");
      return payouts === "1" || connect === "done" || connect === "refresh";
    })();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [rentEditorOpen, setRentEditorOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(initialPayoutsOpen);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentFilter, setResidentFilter] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentDueDay, setRentDueDay] = useState("1");
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const syncSignature = `${hcTick}:${applicationTick}:${propertyTick}`;

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    void syncHouseholdChargesFromServer().then(on);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  useEffect(() => {
    const on = () => setApplicationTick((n) => n + 1);
    void syncManagerApplicationsFromServer().then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
  }, [authReady, userId]);

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
    if (payouts === "1" || connect === "done" || connect === "refresh") {
      if (connect === "done") {
        showToast("Payout status updated.");
        window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
      } else if (connect === "refresh") {
        showToast("Setup link expired — open Payouts to try again.");
        window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
      }
      params.delete("payouts");
      params.delete("connect");
      const next = params.toString();
      const path = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", path);
    }
  }, [showToast]);

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

  void syncSignature;
  const applications = readManagerApplicationRows();
  const mergedRows = [...readChargesForManager(userId).map((charge) => {
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
  }), ...mergeManagerPaymentLedger()];

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      const key = row.propertyName.trim();
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
      const key = row.residentName.trim();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows]);

  const counts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const r of mergedRows) {
      c[r.bucket] += 1;
    }
    return c;
  }, [mergedRows]);

  const tabs = useMemo(
    () => PAY_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  const rowsForBucket = useMemo(() => {
    return mergedRows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (propertyFilter && r.propertyName !== propertyFilter) return false;
      if (residentFilter && r.residentName !== residentFilter) return false;
      return true;
    });
  }, [mergedRows, bucket, propertyFilter, residentFilter]);

  const approvedResidents = useMemo(
    () =>
      readManagerApplicationRows()
        .filter((row) => row.bucket === "approved" && row.email?.trim() && applicationVisibleToPortalUser(row, userId))
        .map((row) => {
          const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
          const property = propertyId ? getPropertyById(propertyId) : null;
          const roomLabel = getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "");
          return {
            id: row.id,
            email: row.email!.trim(),
            name: row.name,
            propertyId,
            propertyLabel: property?.title?.trim() || row.property,
            roomLabel,
            signedMonthlyRent: row.signedMonthlyRent ?? null,
          };
        }),
    [userId, syncSignature],
  );

  const selectedApprovedResident = useMemo(
    () => approvedResidents.find((row) => row.id === selectedApplicationId) ?? null,
    [approvedResidents, selectedApplicationId],
  );

  useEffect(() => {
    if (!userId) return;
    const visibleApplications = readManagerApplicationRows().filter((row) => applicationVisibleToPortalUser(row, userId));
    pruneObsoleteManagerCharges(userId, visibleApplications);
    for (const row of visibleApplications) {
      recordSubmittedApplicationFeeCharge(row, userId);
      if (row.bucket === "approved") {
        recordApprovedApplicationCharges(row, userId);
      }
    }
  }, [userId, hcTick, applicationTick]);

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
            residents
            residentOptions={residentOptions}
            residentValue={residentFilter}
            onResidentChange={setResidentFilter}
          />
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setAddOpen(true)}>
            Add payment
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => setRentEditorOpen(true)}>
            Edit tenant rent
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              setHcTick((n) => n + 1);
              showToast("Payments refreshed.");
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
            Set up <span className="font-semibold">Payouts</span> before creating a listing.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
              onClick={() => setPayoutsOpen(true)}
            >
              Open Payouts
            </button>
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
        </div>
      }
    >
      <ManagerPaymentsLedgerPanel rows={rowsForBucket} managerUserId={userId ?? null} activeBucket={bucket} />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          showToast("Payment line added.");
          setAddOpen(false);
        }}
      />

      <Modal open={rentEditorOpen} title="Recurring tenant rent" onClose={() => setRentEditorOpen(false)}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Approved tenant</span>
            <Select
              value={selectedApplicationId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedApplicationId(nextId);
                const next = approvedResidents.find((row) => row.id === nextId);
                setRentAmount(next?.signedMonthlyRent ? String(next.signedMonthlyRent) : "");
              }}
            >
              <option value="">Select tenant</option>
              {approvedResidents.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.propertyLabel} {row.roomLabel ? `· ${row.roomLabel}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Monthly rent</span>
            <Input type="number" min={0} step={0.01} value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder="800" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Due day each month</span>
            <Input type="number" min={1} max={28} step={1} value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
          </label>
          <p className="text-sm text-slate-500">
            This locks the tenant’s recurring rent independently from the live house price. Future listing price changes will not alter this tenant’s rent.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setRentEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              onClick={() => {
                if (!selectedApprovedResident || !selectedApprovedResident.propertyId) {
                  showToast("Choose an approved tenant with an assigned property.");
                  return;
                }
                const monthlyRent = Number.parseFloat(rentAmount);
                const dueDay = Number.parseInt(rentDueDay, 10);
                if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
                  showToast("Enter a valid monthly rent.");
                  return;
                }
                upsertRecurringRentProfile({
                  residentEmail: selectedApprovedResident.email,
                  residentName: selectedApprovedResident.name,
                  propertyId: selectedApprovedResident.propertyId,
                  propertyLabel: selectedApprovedResident.propertyLabel,
                  roomLabel: selectedApprovedResident.roomLabel,
                  managerUserId: userId ?? null,
                  monthlyRent,
                  dueDay,
                });
                setHcTick((n) => n + 1);
                showToast("Recurring rent updated.");
                setRentEditorOpen(false);
              }}
            >
              Save recurring rent
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={payoutsOpen}
        title="Payouts"
        onClose={() => setPayoutsOpen(false)}
        panelClassName="relative z-[71] mx-auto my-0 w-full max-w-[760px] overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <PortalStripeConnectPanel variant="embedded" basePath={portalBase} />
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}

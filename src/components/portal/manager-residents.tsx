"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  createManagerCharge,
  HOUSEHOLD_CHARGES_EVENT,
  markHouseholdChargePaid,
  readChargesForResident,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import { readExtraListingsForUser, readPendingManagerPropertiesForUser, PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

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

export function ManagerResidents() {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [chargeTitle, setChargeTitle] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeBlocksLease, setChargeBlocksLease] = useState(false);
  const [chargeTab, setChargeTab] = useState<"pending" | "paid">("pending");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
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
    if (emails.length === 0) {
      setResidentAccountEmails(new Set());
      return;
    }
    let cancelled = false;
    void fetch("/api/manager/resident-account-emails", {
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
    setAddChargeOpen(true);
  }

  function submitCharge() {
    if (!selected) return;
    const amount = Number.parseFloat(chargeAmount);
    if (!chargeTitle.trim()) { showToast("Enter a charge title."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { showToast("Enter a valid amount."); return; }
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
                          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                            {/* Left: details + charges */}
                            <div className="flex flex-col gap-4">
                              {/* Account info */}
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
                                <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
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
                                </div>
                              </div>

                              {/* Charges */}
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
                                              <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(c.status)}`}
                                              >
                                                {c.status === "paid" ? "Paid" : "Pending"}
                                              </span>
                                            </td>
                                            <td className="py-2 text-right">
                                              {c.status === "pending" ? (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="rounded-full px-2 py-0.5 text-xs"
                                                  onClick={() => markPaid(c.id)}
                                                >
                                                  Mark paid
                                                </Button>
                                              ) : (
                                                <span className="text-xs text-slate-400">
                                                  {c.paidAt ? new Date(c.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: quick links */}
                            <div className="flex flex-col gap-3">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Quick access</p>
                                <div className="mt-3 flex flex-col gap-2">
                                  <Link
                                    href={`${portalBase}/inbox/unopened`}
                                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-primary/30 hover:bg-white hover:shadow-sm"
                                  >
                                    Inbox
                                    <span className="text-slate-400">→</span>
                                  </Link>
                                  <Link
                                    href={`${portalBase}/leases`}
                                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-primary/30 hover:bg-white hover:shadow-sm"
                                  >
                                    Leases
                                    <span className="text-slate-400">→</span>
                                  </Link>
                                  <Link
                                    href={`${portalBase}/payments/ledger`}
                                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-primary/30 hover:bg-white hover:shadow-sm"
                                  >
                                    Payments ledger
                                    <span className="text-slate-400">→</span>
                                  </Link>
                                  <Link
                                    href={`${portalBase}/work-orders`}
                                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-primary/30 hover:bg-white hover:shadow-sm"
                                  >
                                    Work orders
                                    <span className="text-slate-400">→</span>
                                  </Link>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                                <div className="mt-3 flex flex-wrap gap-2">
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

      <Modal open={addChargeOpen} title="Add charge" onClose={() => setAddChargeOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Adding charge for <span className="font-semibold text-slate-900">{selected?.name || selected?.email}</span>.
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
              Add charge
            </Button>
          </div>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}

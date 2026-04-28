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
  collectAccessiblePropertyIds,
  type ManagerPropertyFilterOption,
} from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomChoiceLabel, getRoomOptionsForProperty } from "@/lib/rental-application/data";
import { HOUSEHOLD_CHARGES_EVENT, recordApprovedApplicationCharges, upsertRecurringRentProfile } from "@/lib/household-charges";

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

function stageLabelForRow(row: DemoApplicantRow, bucket: ManagerApplicationBucket, assignedRoomChoice?: string) {
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
  onSave: (propertyId: string, roomChoice: string, signedMonthlyRent: number) => void;
}) {
  const initialPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const initialRoomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const initialSignedRent = row.signedMonthlyRent && row.signedMonthlyRent > 0 ? String(row.signedMonthlyRent) : "";
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [roomChoice, setRoomChoice] = useState(initialRoomChoice);
  const [signedRent, setSignedRent] = useState(initialSignedRent);
  const userEditedRentRef = useRef(false);

  useEffect(() => {
    setPropertyId(row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "");
    setRoomChoice(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "");
    if (!userEditedRentRef.current) {
      setSignedRent(row.signedMonthlyRent && row.signedMonthlyRent > 0 ? String(row.signedMonthlyRent) : "");
    }
  }, [row]);

  const availablePropertyOptions = useMemo(() => {
    return propertyOptions.filter((opt) => {
      const hasAvailableRooms = getRoomOptionsForProperty(opt.id, {
        leaseStart: row.application?.leaseStart,
        leaseEnd: row.application?.leaseEnd,
        excludeApplicationId: row.id,
      }).length > 0;
      return hasAvailableRooms || opt.id === propertyId;
    });
  }, [propertyId, propertyOptions, row.application?.leaseEnd, row.application?.leaseStart, row.id]);

  const roomOptions = useMemo(
    () =>
      propertyId
        ? getRoomOptionsForProperty(propertyId, {
            leaseStart: row.application?.leaseStart,
            leaseEnd: row.application?.leaseEnd,
            excludeApplicationId: row.id,
          })
        : [],
    [propertyId, row.application?.leaseEnd, row.application?.leaseStart, row.id],
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

  useEffect(() => {
    if (!roomChoice) return;
    if (!roomChoiceBelongsToProperty) {
      setRoomChoice("");
    }
  }, [roomChoice, roomChoiceBelongsToProperty]);

  useEffect(() => {
    if (userEditedRentRef.current || signedRent.trim()) return;
    const inferred = inferRoomRent(propertyId, roomChoice);
    if (inferred) setSignedRent(String(inferred));
  }, [propertyId, roomChoice, signedRent]);

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
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Select property</option>
              {availablePropertyOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Room</span>
            <Select value={roomChoice} onChange={(e) => setRoomChoice(e.target.value)} disabled={!propertyId || displayedRoomOptions.length === 0}>
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
          <span className="font-medium text-slate-800">Lease timing:</span>{" "}
          {row.application?.leaseStart?.trim()
            ? `${row.application.leaseStart}${row.application?.leaseEnd?.trim() ? ` to ${row.application.leaseEnd}` : ""}`
            : "No lease dates submitted."}
        </p>
        <p>
          <span className="font-medium text-slate-800">Tenant rent snapshot:</span>{" "}
          {Number.parseFloat(signedRent) > 0 ? `$${Number.parseFloat(signedRent).toFixed(2)} / month` : "Set the rent this tenant signed for."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN_PRIMARY}
          disabled={!propertyId || !roomChoice || !(Number.parseFloat(signedRent) > 0)}
          onClick={() => onSave(propertyId, roomChoice, Number.parseFloat(signedRent))}
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

  useEffect(() => {
    if (!userId) return;
    let changed = false;
    for (const row of rows) {
      if (row.bucket === "approved" && applicationVisibleToPortalUser(row, userId)) {
        changed = recordApprovedApplicationCharges(row, userId) || changed;
      }
    }
    if (changed) window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
  }, [rows, userId]);

  const persist = useCallback((next: DemoApplicantRow[]) => {
    setRows(next);
    writeManagerApplicationRows(next);
  }, []);

  const propertyOptions = useMemo(() => buildManagerPropertyFilterOptions(userId), [userId, portfolioTick]);
  const placementPropertyOptions = useMemo(() => {
    if (!userId) return [];
    return [...collectAccessiblePropertyIds(userId)]
      .map((id) => {
        const property = getPropertyById(id);
        if (!property) return null;
        return {
          id,
          label: property.title?.trim() || property.address?.trim() || id,
        };
      })
      .filter((value): value is ManagerPropertyFilterOption => Boolean(value))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [userId, portfolioTick]);

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
    const filtered = !propertyFilter.trim() ? inBucket : inBucket.filter((r) => r.propertyId === propertyFilter);
    const sorted = sortApplicationRows(filtered, bucket);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...sorted].sort((a, b) => {
      const cmp = collator.compare(roomSortKey(a), roomSortKey(b));
      return roomSortDir === "asc" ? cmp : -cmp;
    });
  }, [scopedRows, bucket, propertyFilter, roomSortDir]);

  const refreshTable = useCallback(() => {
    setRows(readManagerApplicationRows());
    showToast("Refreshed.");
  }, [showToast]);

  const setRowBucket = async (id: string, nextBucket: ManagerApplicationBucket) => {
    const row = rows.find((r) => r.id === id);
    const next = rows.map((r) => (r.id === id ? { ...r, bucket: nextBucket, stage: stageLabelForRow(r, nextBucket) } : r));
    persist(next);
    const updatedRow = next.find((r) => r.id === id);
    if (nextBucket === "approved" && updatedRow) {
      recordApprovedApplicationCharges(updatedRow, userId ?? null);
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
    (id: string, propertyId: string, roomChoice: string, signedMonthlyRent: number) => {
      const property = getPropertyById(propertyId);
      const roomLabel = getRoomChoiceLabel(roomChoice);
      if (!property || !roomLabel || !(signedMonthlyRent > 0)) {
        showToast("Select a valid house, room, and signed rent.");
        return;
      }
      const rowToUpdate = rows.find((row) => row.id === id);
      const next = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              property: property.title?.trim() || row.property,
              propertyId,
              assignedPropertyId: propertyId,
              assignedRoomChoice: roomChoice,
              signedMonthlyRent: Number(signedMonthlyRent.toFixed(2)),
              stage: stageLabelForRow(row, row.bucket, roomChoice),
            }
          : row,
      );
      persist(next);
      if (rowToUpdate?.email?.trim()) {
        upsertRecurringRentProfile({
          residentEmail: rowToUpdate.email.trim(),
          residentName: rowToUpdate.name,
          residentUserId: null,
          propertyId,
          propertyLabel: property.title?.trim() || rowToUpdate.property,
          roomLabel,
          managerUserId: userId ?? null,
          monthlyRent: signedMonthlyRent,
        });
      }
      showToast("Assigned house and room saved.");
    },
    [rows, persist, showToast, userId],
  );

  const deleteApplication = async (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    const email = row?.email?.trim().toLowerCase();

    if (email) {
      try {
        const res = await fetch("/api/portal/delete-resident-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          showToast(body?.error ?? "Could not remove the linked resident account.");
          return;
        }
      } catch {
        showToast("Could not remove the linked resident account.");
        return;
      }
    }

    persist(rows.filter((r) => r.id !== id));
    deleteManagerApplicationFromServer(id);
    setExpandedId(null);
    showToast(email ? "Application and resident access deleted." : "Application deleted.");
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
                                row={row}
                                propertyOptions={placementPropertyOptions}
                                onSave={(propertyId, roomChoice, signedMonthlyRent) =>
                                  savePlacement(row.id, propertyId, roomChoice, signedMonthlyRent)
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

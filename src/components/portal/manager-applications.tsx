"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  effectiveApplicationForRow,
  readManagerApplicationRows,
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
import { findApplicationFeeCharge } from "@/lib/household-charges";

function countByBucket(rows: DemoApplicantRow[]) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

function stageLabelForRow(row: DemoApplicantRow, bucket: ManagerApplicationBucket, assignedRoomChoice?: string) {
  const roomLabel = getRoomChoiceLabel(assignedRoomChoice ?? row.assignedRoomChoice ?? "");
  if (bucket === "approved") return roomLabel ? `Approved · ${roomLabel}` : "Approved";
  if (bucket === "rejected") return "Rejected";
  return roomLabel ? `Submitted · ${roomLabel}` : "Submitted";
}

function ManagerApplicationPlacementEditor({
  row,
  propertyOptions,
  onSave,
}: {
  row: DemoApplicantRow;
  propertyOptions: ManagerPropertyFilterOption[];
  onSave: (propertyId: string, roomChoice: string) => void;
}) {
  const initialPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const initialRoomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [roomChoice, setRoomChoice] = useState(initialRoomChoice);

  useEffect(() => {
    setPropertyId(row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "");
    setRoomChoice(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "");
  }, [row]);

  const roomOptions = useMemo(() => (propertyId ? getRoomOptionsForProperty(propertyId) : []), [propertyId]);

  useEffect(() => {
    if (!roomChoice) return;
    if (!roomOptions.some((opt) => opt.value === roomChoice)) {
      setRoomChoice("");
    }
  }, [roomChoice, roomOptions]);

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
              {propertyOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Room</span>
            <Select value={roomChoice} onChange={(e) => setRoomChoice(e.target.value)} disabled={!propertyId || roomOptions.length === 0}>
              <option value="">{propertyId ? "Select room" : "Select house first"}</option>
              {roomOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
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
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} disabled={!propertyId || !roomChoice} onClick={() => onSave(propertyId, roomChoice)}>
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

  useEffect(() => {
    const sync = () => setRows(readManagerApplicationRows());
    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
      window.removeEventListener("storage", sync);
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
    if (!propertyFilter.trim()) return inBucket;
    return inBucket.filter((r) => r.propertyId === propertyFilter);
  }, [scopedRows, bucket, propertyFilter]);

  const refreshTable = useCallback(() => {
    setRows(readManagerApplicationRows());
    showToast("Refreshed.");
  }, [showToast]);

  const setRowBucket = (id: string, nextBucket: ManagerApplicationBucket) => {
    if (nextBucket === "approved") {
      const row = rows.find((r) => r.id === id);
      const email = row?.email?.trim();
      const propertyId = row?.propertyId?.trim();
      if (row && email && propertyId) {
        const feeCharge = findApplicationFeeCharge(email, propertyId);
        if (feeCharge?.status === "pending") {
          showToast("Mark the application fee paid in Payments before approving this application.");
          return;
        }
      }
    }
    const next = rows.map((r) => (r.id === id ? { ...r, bucket: nextBucket, stage: stageLabelForRow(r, nextBucket) } : r));
    persist(next);
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
    (id: string, propertyId: string, roomChoice: string) => {
      const property = getPropertyById(propertyId);
      const roomLabel = getRoomChoiceLabel(roomChoice);
      if (!property || !roomLabel) {
        showToast("Select a valid house and room.");
        return;
      }
      const next = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              property: property.title?.trim() || row.property,
              propertyId,
              assignedPropertyId: propertyId,
              assignedRoomChoice: roomChoice,
              stage: stageLabelForRow(row, row.bucket, roomChoice),
            }
          : row,
      );
      persist(next);
      showToast("Assigned house and room saved.");
    },
    [rows, persist, showToast],
  );

  const deleteApplication = (id: string) => {
    persist(rows.filter((r) => r.id !== id));
    setExpandedId(null);
    showToast("Application deleted.");
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
                <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
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
                      </td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.property}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.stage}</td>
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
                              onClick={() => deleteApplication(row.id)}
                            >
                              Delete application
                            </Button>
                          </PortalTableDetailActions>

                          {row.application ? (
                            <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4">
                              <ManagerApplicationPlacementEditor row={row} propertyOptions={placementPropertyOptions} onSave={(propertyId, roomChoice) => savePlacement(row.id, propertyId, roomChoice)} />
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

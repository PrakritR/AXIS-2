"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalFilterRow,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_EXPAND_TH,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  PortalTableExpandCell,
  PortalTableExpandChevron,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { ManagerApplicationReadonlyReview } from "@/components/portal/manager-application-readonly-review";
import { ResidentApplicationEditor } from "@/components/portal/resident-application-editor";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  MANAGER_APPLICATIONS_EVENT,
  effectiveApplicationForRow,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";

function countByBucket(rows: DemoApplicantRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.bucket] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 } as Record<ManagerApplicationBucket, number>,
  );
}

function displayRoomForRow(row: DemoApplicantRow): string {
  const raw = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  if (!raw) return "—";
  const full = getRoomChoiceLabel(raw);
  return full.split(" · ")[0]?.trim() || full || "—";
}

function bucketStatusLabel(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Pending review";
}

function sortApplicationRows(rows: DemoApplicantRow[]): DemoApplicantRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    const propertyCmp = collator.compare(a.property || "", b.property || "");
    if (propertyCmp !== 0) return propertyCmp;
    const byId = collator.compare(a.id, b.id);
    if (byId !== 0) return byId;
    return collator.compare(a.name || "", b.name || "");
  });
}

export function ResidentApplicationsPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const { email: sessionEmail, ready: sessionReady } = usePortalSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const residentEmail = (sessionEmail ?? "").trim().toLowerCase();
  const [tick, setTick] = useState(0);
  const [bucket, setBucket] = useState<ManagerApplicationBucket>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const openHandled = useRef(false);

  useEffect(() => {
    if (!sessionReady) return;
    const on = () => setTick((t) => t + 1);
    void syncManagerApplicationsFromServer({ force: true }).then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
  }, [sessionReady]);

  const rows = useMemo(() => {
    void tick;
    if (!residentEmail) return [];
    return sortApplicationRows(
      readManagerApplicationRows().filter((row) => (row.email ?? "").trim().toLowerCase() === residentEmail),
    );
  }, [residentEmail, tick]);

  const counts = useMemo(() => countByBucket(rows), [rows]);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts],
  );

  const rowsForBucket = useMemo(() => rows.filter((row) => row.bucket === bucket), [rows, bucket]);

  useEffect(() => {
    if (!sessionReady || rows.length > 0) return;
    router.replace("/resident/applications/apply");
  }, [sessionReady, rows.length, router]);

  useEffect(() => {
    if (openHandled.current || rows.length === 0) return;
    const raw = (searchParams.get("open") ?? searchParams.get("axisId") ?? "").trim();
    if (!raw) return;
    const id = normalizeApplicationAxisId(raw).toUpperCase();
    const hit = rows.find((row) => normalizeApplicationAxisId(row.id).toUpperCase() === id);
    if (!hit) return;
    openHandled.current = true;
    queueMicrotask(() => {
      setBucket(hit.bucket);
      setExpandedId(hit.id);
    });
  }, [rows, searchParams]);

  const renderRowDetail = (row: DemoApplicantRow) => (
    <div className="mx-auto max-w-5xl space-y-6">
      {editingId === row.id && row.bucket === "pending" && row.application ? (
        <ResidentApplicationEditor
          row={row}
          residentEmail={residentEmail}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            setTick((t) => t + 1);
          }}
        />
      ) : (
        <>
          <PortalTableDetailActions placement="top">
            {row.bucket === "pending" && row.application ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => setEditingId(row.id)}
              >
                Edit application
              </Button>
            ) : null}
          </PortalTableDetailActions>
          {row.application ? (
            <ManagerApplicationReadonlyReview
              partial={{
                ...(effectiveApplicationForRow(row) ?? row.application),
              }}
              assignedPropertyId={row.assignedPropertyId}
              assignedRoomChoice={row.assignedRoomChoice}
            />
          ) : (
            <p className="text-sm text-muted">Application details are not available for this record.</p>
          )}
        </>
      )}
    </div>
  );

  const body =
    !sessionReady || rows.length === 0 ? (
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading applications…</div>
      </div>
    ) : (
      <>
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
        </ManagerPortalFilterRow>

        {rowsForBucket.length === 0 ? (
          <PortalDataTableEmpty icon="application" message="No applications in this tab yet." />
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
            {rowsForBucket.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <div key={row.id} id={`resident-application-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => {
                      setExpandedId((cur) => (cur === row.id ? null : row.id));
                      setEditingId(null);
                    }}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{row.name || "Applicant"}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[row.property || "—", `Room ${displayRoomForRow(row)}`].join(" · ")}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted/90">{bucketStatusLabel(row.bucket)}</p>
                    </div>
                    <PortalTableExpandChevron expanded={expanded} />
                  </button>
                  {expanded ? <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div> : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Application</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={PORTAL_TABLE_EXPAND_TH}>
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForBucket.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        id={`resident-application-${row.id}`}
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() => {
                          setExpandedId((cur) => (cur === row.id ? null : row.id));
                          setEditingId(null);
                        })}
                        aria-expanded={expandedId === row.id}
                      >
                        <td className={`${PORTAL_TABLE_TD} align-middle`}>
                          <p className="font-medium leading-snug text-foreground">{row.name || "Applicant"}</p>
                          <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-muted">{row.id}</p>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{row.property || "—"}</td>
                        <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{displayRoomForRow(row)}</td>
                        <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{bucketStatusLabel(row.bucket)}</td>
                        <PortalTableExpandCell expanded={expandedId === row.id} />
                      </tr>
                      {expandedId === row.id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                            {renderRowDetail(row)}
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
      </>
    );

  if (embedded) return body;

  return (
    <ManagerPortalPageShell title="Applications">
      {body}
    </ManagerPortalPageShell>
  );
}

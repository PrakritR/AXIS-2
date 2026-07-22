"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { GroupShareCallout } from "@/components/marketing/rental-application-finish-panel";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalFilterRow,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ResidentApplicationEditor } from "@/components/portal/resident-application-editor";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  DEMO_APPLICATION_SUBMITTED_EVENT,
  DEMO_CLOSE_RESIDENT_APPLY_EVENT,
  DEMO_OPEN_RESIDENT_APPLY_EVENT,
} from "@/lib/demo/demo-playback";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  MANAGER_APPLICATIONS_EVENT,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { isInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";
import {
  canResidentWithdrawApplication,
  isWithdrawnApplicationRow,
  sortResidentApplicationRows,
} from "@/lib/rental-application/resident-application-list";
import { applicationHasGroup } from "@/lib/rental-application/application-groups";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";

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

function rowStatusLabel(row: DemoApplicantRow): string {
  if (row.bucket === "approved") return "Approved";
  if (row.bucket === "rejected") return "Rejected";
  if (isInProgressApplicationRow(row)) return "In progress";
  return "Pending review";
}

function continueApplicationPath(row: DemoApplicantRow): string {
  const pid = row.propertyId?.trim() || row.application?.propertyId?.trim();
  return pid
    ? `${RESIDENT_PORTAL_BASE_PATH}/applications/apply?propertyId=${encodeURIComponent(pid)}`
    : `${RESIDENT_PORTAL_BASE_PATH}/applications/apply`;
}

export function ResidentApplicationsPanel({
  embedded = false,
  applyMode: applyModeProp = false,
}: {
  embedded?: boolean;
  applyMode?: boolean;
} = {}) {
  const pathname = usePathname();
  const { email: sessionEmail, ready: sessionReady } = usePortalSession();
  const searchParams = useSearchParams();
  const portalNavigate = usePortalNavigate();
  const { showToast } = useAppUi();
  const demoMode = isDemoModeActive();
  const residentEmail = (sessionEmail ?? "").trim().toLowerCase();
  const [demoApplyOpen, setDemoApplyOpen] = useState(false);
  const [demoApplyPropertyId, setDemoApplyPropertyId] = useState<string | undefined>();
  const applyMode =
    applyModeProp ||
    pathname.startsWith(`${RESIDENT_PORTAL_BASE_PATH}/applications/apply`) ||
    (demoMode && demoApplyOpen);
  const [tick, setTick] = useState(0);
  const [bucket, setBucket] = useState<ManagerApplicationBucket>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DemoApplicantRow | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const openHandled = useRef(false);

  useEffect(() => {
    if (!sessionReady) return;
    const on = () => setTick((t) => t + 1);
    void syncManagerApplicationsFromServer({ force: true }).then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
  }, [sessionReady]);

  useEffect(() => {
    if (!demoMode) return;
    const closeApply = () => {
      setDemoApplyOpen(false);
      setDemoApplyPropertyId(undefined);
      setTick((t) => t + 1);
    };
    const onOpen = (e: Event) => {
      const propertyId = (e as CustomEvent<{ propertyId?: string }>).detail?.propertyId?.trim();
      setDemoApplyPropertyId(propertyId || undefined);
      setDemoApplyOpen(true);
    };
    window.addEventListener(DEMO_OPEN_RESIDENT_APPLY_EVENT, onOpen as EventListener);
    window.addEventListener(DEMO_CLOSE_RESIDENT_APPLY_EVENT, closeApply);
    window.addEventListener(DEMO_APPLICATION_SUBMITTED_EVENT, closeApply);
    return () => {
      window.removeEventListener(DEMO_OPEN_RESIDENT_APPLY_EVENT, onOpen as EventListener);
      window.removeEventListener(DEMO_CLOSE_RESIDENT_APPLY_EVENT, closeApply);
      window.removeEventListener(DEMO_APPLICATION_SUBMITTED_EVENT, closeApply);
    };
  }, [demoMode]);

  const rows = useMemo(() => {
    void tick;
    if (!residentEmail) return [];
    // A withdrawn application leaves the resident's active list (the manager keeps it).
    return sortResidentApplicationRows(
      readManagerApplicationRows().filter(
        (row) => (row.email ?? "").trim().toLowerCase() === residentEmail && !isWithdrawnApplicationRow(row),
      ),
    );
  }, [residentEmail, tick]);

  const inProgressRow = useMemo(() => rows.find(isInProgressApplicationRow), [rows]);

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
    if (applyMode || demoMode || !sessionReady || rows.length > 0) return;
    portalNavigate("/resident/applications/apply");
  }, [applyMode, demoMode, sessionReady, rows.length, portalNavigate]);

  useEffect(() => {
    if (!applyMode || !inProgressRow) return;
    queueMicrotask(() => {
      setBucket("pending");
      setExpandedId(inProgressRow.id);
    });
  }, [applyMode, inProgressRow]);

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

  const confirmWithdraw = async () => {
    const row = withdrawTarget;
    if (!row || withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      const res = await fetch("/api/manager-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "withdraw", id: row.id }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        showToast(body?.error ?? "Could not withdraw application.");
        return;
      }
      // Reflect the withdrawal locally (no server mirror) so the row leaves the
      // active list immediately; the server already persisted `withdrawnAt`.
      replaceManagerApplicationRowInCache({ ...row, withdrawnAt: new Date().toISOString() });
      if (expandedId === row.id) setExpandedId(null);
      if (editingId === row.id) setEditingId(null);
      setWithdrawTarget(null);
      setTick((t) => t + 1);
      showToast("Application withdrawn. Your property manager still has the record.");
    } catch {
      showToast("Could not withdraw application.");
    } finally {
      setWithdrawBusy(false);
    }
  };

  const withdrawModal = (
    <Modal
      open={withdrawTarget !== null}
      title="Withdraw application"
      onClose={() => (withdrawBusy ? undefined : setWithdrawTarget(null))}
      panelClassName="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Withdrawing removes this application from your active list. It is not deleted — your property
          manager keeps the record{withdrawTarget?.property ? ` for ${withdrawTarget.property}` : ""} and its
          history, and you can reapply later if you change your mind.
        </p>
        <div className="flex justify-start gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setWithdrawTarget(null)}
            disabled={withdrawBusy}
          >
            Keep application
          </Button>
          <Button
            type="button"
            variant="danger"
            className="rounded-full"
            data-attr="resident-application-withdraw-confirm"
            onClick={() => void confirmWithdraw()}
            disabled={withdrawBusy}
          >
            {withdrawBusy ? "Withdrawing…" : "Withdraw application"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const embeddedWizard = (
    <RentalApplicationWizard
      showToast={showToast}
      mode="portal"
      layout="embedded"
      exitPath={`${RESIDENT_PORTAL_BASE_PATH}/applications`}
      sessionEmail={sessionEmail ?? undefined}
      linkedPropertyId={demoApplyPropertyId}
    />
  );

  const renderRowDetail = (row: DemoApplicantRow) => (
    <div className="mx-auto max-w-5xl space-y-4">
      {!isInProgressApplicationRow(row) && applicationHasGroup(row.application) ? (
        <GroupShareCallout
          groupId={(row.application?.groupId ?? "").trim()}
          groupRole={row.application?.groupRole}
          groupSize={row.application?.groupSize}
          className="mt-0"
          shareable={row.bucket !== "rejected"}
        />
      ) : null}
      {isInProgressApplicationRow(row) && applyMode ? (
        embeddedWizard
      ) : editingId === row.id && row.bucket === "pending" && row.application && !isInProgressApplicationRow(row) ? (
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
            {isInProgressApplicationRow(row) ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => portalNavigate(continueApplicationPath(row))}
              >
                Continue application
              </Button>
            ) : row.bucket === "pending" && row.application ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => setEditingId(row.id)}
              >
                Edit application
              </Button>
            ) : null}
            {canResidentWithdrawApplication(row) ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="resident-application-withdraw"
                onClick={() => setWithdrawTarget(row)}
              >
                Withdraw application
              </Button>
            ) : null}
          </PortalTableDetailActions>
          {isInProgressApplicationRow(row) ? null : row.application ? (
            <ApplicationDocumentPreview row={row} collapsible={false} showDownload={false} />
          ) : (
            <p className="text-sm text-muted">Application details are not available for this record.</p>
          )}
        </>
      )}
    </div>
  );

  const filterRow = (
    <ManagerPortalFilterRow>
      <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
    </ManagerPortalFilterRow>
  );

  const newApplicationButton =
    sessionReady && !applyMode ? (
      <Button
        type="button"
        className="rounded-full"
        data-attr="resident-applications-new"
        onClick={() => {
          if (demoMode) {
            setDemoApplyPropertyId(undefined);
            setDemoApplyOpen(true);
            return;
          }
          portalNavigate(`${RESIDENT_PORTAL_BASE_PATH}/applications/apply`);
        }}
      >
        New application
      </Button>
    ) : null;

  const titleAside = newApplicationButton;

  const renderApplicationsTable = () => (
    <>
      <div className="space-y-2 lg:hidden">
        {rowsForBucket.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} id={`resident-application-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  setExpandedId((cur) => (cur === row.id ? null : row.id));
                  setEditingId(null);
                }}
                aria-expanded={expanded}
              >
                <PortalTableInlineExpand expanded={expanded} className="font-semibold text-foreground">
                  <span className="truncate">{row.name || "Applicant"}</span>
                </PortalTableInlineExpand>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[row.property || "—", `Room ${displayRoomForRow(row)}`].join(" · ")}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted/90">{rowStatusLabel(row)}</p>
              </button>
              {expanded ? <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div> : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Application</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
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
                      <PortalTableInlineExpand
                        expanded={expandedId === row.id}
                        className="font-medium leading-snug text-foreground"
                      >
                        {row.name || "Applicant"}
                      </PortalTableInlineExpand>
                      <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-muted">{row.id}</p>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{row.property || "—"}</td>
                    <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{displayRoomForRow(row)}</td>
                    <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{rowStatusLabel(row)}</td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
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
  );

  const tableBody = !sessionReady ? (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading applications…</div>
    </div>
  ) : (
    <>
      {embedded ? filterRow : null}

      {applyMode && !inProgressRow ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>{embeddedWizard}</div>
      ) : null}

      {rows.length === 0 && !applyMode ? (
        <PortalDataTableEmpty icon="application" message="No applications yet. Start your first application." />
      ) : rowsForBucket.length === 0 && !(applyMode && !inProgressRow) ? (
        <PortalDataTableEmpty icon="application" message="No applications in this tab yet." />
      ) : rowsForBucket.length > 0 ? (
        renderApplicationsTable()
      ) : null}
      {withdrawModal}
    </>
  );

  if (embedded) return tableBody;

  return (
    <ManagerPortalPageShell title="Applications" titleAside={titleAside} filterRow={filterRow}>
      {tableBody}
    </ManagerPortalPageShell>
  );
}

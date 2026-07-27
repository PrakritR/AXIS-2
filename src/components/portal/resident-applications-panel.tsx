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
  PORTAL_HEADER_ACTION_BTN,
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
  cancelPendingApplicationRowUpsert,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { clearRentalWizardDraft, loadRentalWizardDraftAxisId } from "@/lib/rental-application/drafts";
import { getRoomChoiceLabel, parseRoomChoiceValue } from "@/lib/rental-application/data";
import {
  applicationStageDisplayLabel,
  findInProgressRowForTarget,
  isInProgressApplicationRow,
  type ApplicationRequestTarget,
} from "@/lib/rental-application/in-progress-application";
import {
  canResidentWithdrawApplication,
  isWithdrawnApplicationRow,
  sortResidentApplicationRows,
} from "@/lib/rental-application/resident-application-list";
import { applicationHasGroup } from "@/lib/rental-application/application-groups";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { residentBrowseFromApplicationHref } from "@/lib/resident-public-nav";

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
  if (isWithdrawnApplicationRow(row)) return "Withdrawn";
  return applicationStageDisplayLabel(row);
}

function continueApplicationPath(row: DemoApplicantRow): string {
  const pid = row.propertyId?.trim() || row.application?.propertyId?.trim();
  if (!pid) return `${RESIDENT_PORTAL_BASE_PATH}/applications/apply`;
  const params = new URLSearchParams({ propertyId: pid });
  // Carry the row's own room/bundle so re-entering the wizard resolves back to
  // THIS specific in-progress application, not a different draft on the same property.
  const bundleId = row.application?.bundleId?.trim();
  if (bundleId) {
    params.set("bundle", bundleId);
  } else {
    const roomChoice = row.application?.roomChoice1?.trim();
    const listingRoomId = roomChoice ? parseRoomChoiceValue(roomChoice).listingRoomId : undefined;
    if (listingRoomId) params.set("listingRoomId", listingRoomId);
  }
  return `${RESIDENT_PORTAL_BASE_PATH}/applications/apply?${params.toString()}`;
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

  // What this /apply request is actually asking for, so an in-progress
  // application for a DIFFERENT property (or a different room in the same
  // property) never hijacks the view meant for this one.
  const applyTarget = useMemo<ApplicationRequestTarget | null>(() => {
    const propertyId = (searchParams.get("propertyId") ?? "").trim();
    if (!propertyId) return null;
    return {
      propertyId,
      listingRoomId: (searchParams.get("listingRoomId") ?? "").trim() || undefined,
      bundleId: (searchParams.get("bundle") ?? "").trim() || undefined,
    };
  }, [searchParams]);

  const inProgressRow = useMemo(
    () => findInProgressRowForTarget(rows, applyTarget),
    [rows, applyTarget],
  );

  // `applyTarget` is a snapshot of the URL at load time and never changes as the
  // resident edits the wizard, but `inProgressRow` is recomputed from it on every
  // render — so the moment the resident picks a DIFFERENT room than the one the
  // URL named (or clears a bundle choice, etc.), `targetMatchesApplication` stops
  // matching and `inProgressRow` goes from "this row" to `undefined`, even though
  // it's still the exact same in-progress application, just with an updated room.
  // Once we've already locked onto a row via `expandedId` (the effect below), keep
  // trusting that lock instead of re-deriving the identity from the stale target —
  // otherwise the standalone `applyMode && !inProgressRow` branch below thinks
  // there is suddenly no in-progress application and mounts a SECOND, brand-new
  // `RentalApplicationWizard` (fresh `step` state, no draft) alongside the one
  // already embedded in the expanded row: the "glitches back to the start" bug,
  // and the two instances' un-coordinated syncs are why the room could also land
  // on the server as blank. See `tests/unit/resident-applications-room-change.test.tsx`.
  const lockedInProgressRow = useMemo(
    () => (expandedId ? rows.find((row) => row.id === expandedId && isInProgressApplicationRow(row)) : undefined),
    [rows, expandedId],
  );
  const activeInProgressRow = lockedInProgressRow ?? inProgressRow;

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

  // A resident with zero applications is deliberately NOT auto-redirected into
  // the apply flow. The list page — with its always-visible "Apply to a property"
  // header action and the "No applications yet" empty state — must render
  // regardless of how many applications exist or their status; bouncing an empty
  // list straight to /apply is exactly what hid the entry point the captain
  // reported missing. Starting an application is always an explicit click.

  useEffect(() => {
    if (!applyMode || !inProgressRow) return;
    queueMicrotask(() => {
      setBucket("pending");
      setExpandedId(inProgressRow.id);
    });
    // Only re-runs when a target-matched row newly appears/changes id — deliberately
    // NOT on `activeInProgressRow`, so a later room change (which only affects
    // `inProgressRow`'s target match, not this effect's own lock) can't re-fire.
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
      // A 404 means the server has no record to stamp yet — a brand-new
      // in-progress draft whose background snapshot hasn't landed. The resident's
      // intent is still "remove this from my list", so honor it locally instead
      // of stranding the row (this is the "withdraw does nothing on my only
      // application" case). Any other failure is a real error.
      if ((!res.ok || !body?.ok) && res.status !== 404) {
        showToast(body?.error ?? "Could not withdraw application.");
        return;
      }
      // Reflect the withdrawal locally so the row leaves the active list
      // immediately. Removal is durable without a sticky merge: the withdraw
      // route persisted `withdrawnAt` (GET returns it), the union merge keeps a
      // local-only 404 row, and withdrawn rows are excluded from the apply
      // resume comparator. Drop any queued autosave for this id first so a
      // pre-withdraw snapshot can't land after the stamp and revive the row.
      cancelPendingApplicationRowUpsert(row.id);
      replaceManagerApplicationRowInCache({ ...row, withdrawnAt: new Date().toISOString() });
      // Withdrawal is FINAL for the applicant: if the local wizard draft belongs
      // to this application, drop it (and its axis id) so a later reapply to the
      // same property starts genuinely fresh — no revived row, no leftover
      // answers. The manager keeps the withdrawn record on their side.
      const draftAxisId = loadRentalWizardDraftAxisId();
      if (draftAxisId && normalizeApplicationAxisId(draftAxisId) === normalizeApplicationAxisId(row.id)) {
        clearRentalWizardDraft();
      }
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
          Withdrawing removes this application from your active list. It is not deleted; your property
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

  const renderRowDetail = (row: DemoApplicantRow) => {
    // The embedded wizard / inline editor stay in a centered, readable column;
    // everything else (row actions + the document summary) is LEFT-ALIGNED and
    // full-width, matching the manager Applications row so the actions sit tight
    // under the applicant instead of floating centered in an empty band.
    if (isInProgressApplicationRow(row) && applyMode) {
      return <div className="mx-auto max-w-5xl">{embeddedWizard}</div>;
    }
    if (editingId === row.id && row.bucket === "pending" && row.application && !isInProgressApplicationRow(row)) {
      return (
        <div className="mx-auto max-w-5xl">
          <ResidentApplicationEditor
            row={row}
            residentEmail={residentEmail}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              setTick((t) => t + 1);
            }}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {!isInProgressApplicationRow(row) && applicationHasGroup(row.application) ? (
          <GroupShareCallout
            groupId={(row.application?.groupId ?? "").trim()}
            groupRole={row.application?.groupRole}
            groupSize={row.application?.groupSize}
            className="mt-0"
            shareable={row.bucket !== "rejected"}
          />
        ) : null}
        <PortalTableDetailActions placement="top">
          {isInProgressApplicationRow(row) ? (
            <Button
              type="button"
              variant="primary"
              className={PORTAL_DETAIL_BTN}
              onClick={() => portalNavigate(continueApplicationPath(row))}
            >
              Continue application
            </Button>
          ) : row.bucket === "pending" && row.application ? (
            <Button
              type="button"
              variant="primary"
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
      </div>
    );
  };

  const filterRow = (
    <ManagerPortalFilterRow>
      <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
    </ManagerPortalFilterRow>
  );

  const newApplicationButton =
    sessionReady ? (
      // Always visible — including while an application is open inline — because
      // mid-application is exactly when someone decides to apply somewhere else
      // too. It is the page's primary action, so it renders blue.
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          data-attr="resident-applications-apply"
          onClick={() => {
            if (demoMode) {
              setDemoApplyPropertyId(undefined);
              setDemoApplyOpen(true);
              return;
            }
            // No property chosen yet — send them to browse listings and pick
            // one, then straight into a fresh application for it.
            portalNavigate(residentBrowseFromApplicationHref());
          }}
        >
          Apply to a property
        </Button>
      </div>
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

      {applyMode && !activeInProgressRow ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>{embeddedWizard}</div>
      ) : null}

      {rows.length === 0 && !applyMode ? (
        <PortalDataTableEmpty icon="application" message="No applications yet. Start your first application." />
      ) : rowsForBucket.length === 0 && !(applyMode && !activeInProgressRow) ? (
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

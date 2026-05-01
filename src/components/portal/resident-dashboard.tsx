"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, PORTAL_DASHBOARD_TILE_LINK, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "@/components/portal/portal-metrics";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  residentCanViewLeaseRow,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { MANAGER_WORK_ORDERS_EVENT, readManagerWorkOrderRows, syncManagerWorkOrdersFromServer } from "@/lib/manager-work-orders-storage";
import {
  countUnopenedPersistedInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className={PORTAL_DASHBOARD_TILE_LINK}
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

type ResidentApplicationStatus = "pending" | "approved" | "rejected";

function leaseDashboardLabel(row: LeasePipelineRow | null, applicationApproved: boolean): string {
  if (!applicationApproved) return "—";
  if (!row) return "Not started";
  if (!residentCanViewLeaseRow(row)) {
    if (row.status === "Voided") return "Voided";
    if (row.status === "Admin Review") return "In admin review";
    if (row.status === "Manager Review" || row.status === "Draft") return "Being prepared";
    return "In progress";
  }
  switch (row.status) {
    case "Fully Signed":
      return "Active";
    case "Resident Signature Pending":
      return "Sign now";
    case "Manager Signature Pending":
      return "Awaiting manager";
    default:
      return row.status?.trim() ? row.status : "In progress";
  }
}

export function ResidentDashboard({
  applicationApproved = false,
  initialApplicationId = null,
  showTestAccessNote = false,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
  managerSubscriptionTier = null,
}: {
  applicationApproved?: boolean;
  initialApplicationId?: string | null;
  showTestAccessNote?: boolean;
  displayName?: string;
  residentEmail?: string;
  residentUserId?: string | null;
  managerSubscriptionTier?: "free" | "paid" | null;
}) {
  const { showToast } = useAppUi();
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const [applicationStatus, setApplicationStatus] = useState<ResidentApplicationStatus>(applicationApproved ? "approved" : "pending");
  const [applicationStage, setApplicationStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [applicationProperty, setApplicationProperty] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(initialApplicationId);
  const managerIsFree = managerSubscriptionTier === "free";

  const [leaseTick, setLeaseTick] = useState(0);
  useEffect(() => {
    const on = () => setLeaseTick((n) => n + 1);
    void syncLeasePipelineFromServer().then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
    };
  }, []);

  const leaseRow = useMemo(() => {
    void leaseTick;
    if (!email) return null;
    return findLeaseForResidentEmail(email);
  }, [leaseTick, email]);

  const [workTick, setWorkTick] = useState(0);
  useEffect(() => {
    const sync = () => setWorkTick((n) => n + 1);
    sync();
    void syncManagerWorkOrdersFromServer().then(sync);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const activeMaintenanceCount = useMemo(() => {
    void workTick;
    if (!email) return 0;
    return readManagerWorkOrderRows().filter(
      (r) =>
        r.residentEmail?.trim().toLowerCase() === email && (r.bucket === "open" || r.bucket === "scheduled"),
    ).length;
  }, [workTick, email]);

  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => {
    const onInbox = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === RESIDENT_INBOX_STORAGE_KEY) setInboxTick((n) => n + 1);
    };
    void syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY).then(() => setInboxTick((n) => n + 1));
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    };
  }, []);

  const inboxUnread = useMemo(() => {
    void inboxTick;
    return countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);
  }, [inboxTick]);

  useEffect(() => {
    let alive = true;

    const applyRows = () => {
      const rows = readManagerApplicationRows();
      const matching = email
        ? rows.filter((row) => row.email?.trim().toLowerCase() === email)
        : [];
      const row = matching[0];

      if (row?.bucket === "approved" || row?.bucket === "rejected" || row?.bucket === "pending") {
        if (!alive) return;
        setApplicationStatus(row.bucket);
        setApplicationStage(row.stage?.trim() || (row.bucket === "approved" ? "Approved" : row.bucket === "rejected" ? "Rejected" : "Submitted"));
        setApplicationProperty(row.property?.trim() || null);
        setApplicationId(row.id?.trim() || null);
      } else {
        if (!alive) return;
        setApplicationStatus(applicationApproved ? "approved" : "pending");
        setApplicationStage(applicationApproved ? "Approved" : "Submitted");
        setApplicationProperty(null);
        setApplicationId(initialApplicationId);
      }
    };

    const sync = () => {
      applyRows();
      void syncManagerApplicationsFromServer({ force: true }).then(() => {
        if (!alive) return;
        applyRows();
      });
    };

    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, applyRows);
    window.addEventListener("storage", applyRows);
    return () => {
      alive = false;
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, applyRows);
      window.removeEventListener("storage", applyRows);
    };
  }, [applicationApproved, email, initialApplicationId]);

  const canOpenFullPortal = applicationStatus === "approved" && !managerIsFree;

  const leaseLabel = useMemo(
    () => leaseDashboardLabel(leaseRow, applicationStatus === "approved"),
    [applicationStatus, leaseRow],
  );

  const statusNotice = useMemo(() => {
    if (showTestAccessNote) {
      return { tone: "border-sky-200/80 bg-sky-50/80 text-sky-950", body: "Test access active — resident portal is unlocked for this email." };
    }
    if (applicationStatus === "approved") {
      if (managerIsFree) return { tone: "border-emerald-200/70 bg-emerald-50/80 text-emerald-950", body: applicationProperty ? `${displayName} is approved for ${applicationProperty}. Lease and work orders require a paid property plan.` : `${displayName} is approved. Lease and work orders require a paid property plan.` };
      return { tone: "border-emerald-200/70 bg-emerald-50/80 text-emerald-950", body: applicationProperty ? `${displayName} is approved for ${applicationProperty}.` : `${displayName} is approved and can use the full resident portal.` };
    }
    if (applicationStatus === "rejected") {
      return { tone: "border-rose-200/70 bg-rose-50/80 text-rose-950", body: "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply." };
    }
    return {
      tone: "border-amber-200/80 bg-amber-50/80 text-amber-950",
      body: "Application submitted and pending manager review. Keep this resident account active so the rest of the portal can unlock after approval.",
    };
  }, [applicationProperty, applicationStatus, displayName, managerIsFree, showTestAccessNote]);

  if (applicationStatus === "approved") {
    return (
      <ManagerPortalPageShell
        title="Dashboard"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Dashboard refreshed.")}>
            Refresh
          </Button>
        }
      >
        <div className="space-y-4">
          <p className={`rounded-2xl border px-4 py-3 text-sm ${statusNotice.tone}`}>{statusNotice.body}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatLink label="Lease status" value={leaseLabel} href="/resident/lease" />
            <StatLink
              label="Active maintenance"
              value={canOpenFullPortal ? String(activeMaintenanceCount) : "—"}
              href="/resident/work-orders"
            />
            <StatLink label="Inbox" value={String(inboxUnread)} href="/resident/inbox/unopened" />
          </div>
        </div>
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell title="Dashboard">
      <div className="space-y-4">
        <p className={`rounded-2xl border px-4 py-3 text-sm ${statusNotice.tone}`}>{statusNotice.body}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLink label="Application" value={applicationId ?? applicationStage} href="/resident/inbox/unopened" />
          <StatLink label="Inbox" value={String(inboxUnread)} href="/resident/inbox/unopened" />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

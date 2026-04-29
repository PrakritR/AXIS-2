"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "@/components/portal/portal-metrics";
import { HOUSEHOLD_CHARGES_EVENT, linkHouseholdChargesToResidentUser, readChargesForResident } from "@/lib/household-charges";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200/80 bg-white px-5 py-4 transition hover:border-primary/35 hover:shadow-sm"
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

type ResidentApplicationStatus = "pending" | "approved" | "rejected";

export function ResidentDashboard({
  applicationApproved = false,
  applicationFeePaid = false,
  initialPendingFeeLabel = null,
  initialApplicationId = null,
  showTestAccessNote = false,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
  managerSubscriptionTier = null,
}: {
  applicationApproved?: boolean;
  applicationFeePaid?: boolean;
  initialPendingFeeLabel?: string | null;
  initialApplicationId?: string | null;
  showTestAccessNote?: boolean;
  displayName?: string;
  residentEmail?: string;
  residentUserId?: string | null;
  managerSubscriptionTier?: "free" | "paid" | null;
}) {
  const { showToast } = useAppUi();
  const initialEmail = residentEmail.trim().toLowerCase();
  const [email, setEmail] = useState(initialEmail);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(residentUserId);
  const [applicationStatus, setApplicationStatus] = useState<ResidentApplicationStatus>(applicationApproved ? "approved" : "pending");
  const [applicationStage, setApplicationStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [applicationProperty, setApplicationProperty] = useState<string | null>(null);
  const [pendingFeeLabel, setPendingFeeLabel] = useState<string | null>(initialPendingFeeLabel);
  const [applicationId, setApplicationId] = useState<string | null>(initialApplicationId);
  const [balanceDue, setBalanceDue] = useState("—");
  const openWorkOrders = 0;
  const inboxUnread = 0;
  const managerIsFree = managerSubscriptionTier === "free";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        const nextEmail = user?.email?.trim().toLowerCase();
        if (nextEmail) setEmail(nextEmail);
        if (user?.id) {
          setResolvedUserId(user.id);
          if (nextEmail) linkHouseholdChargesToResidentUser(nextEmail, user.id);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const rows = readManagerApplicationRows();
      const matching = email
        ? rows.filter((row) => row.email?.trim().toLowerCase() === email)
        : [];
      const row = matching.at(-1);

      if (row?.bucket === "approved" || row?.bucket === "rejected" || row?.bucket === "pending") {
        setApplicationStatus(row.bucket);
        setApplicationStage(row.stage?.trim() || (row.bucket === "approved" ? "Approved" : row.bucket === "rejected" ? "Rejected" : "Submitted"));
        setApplicationProperty(row.property?.trim() || null);
        setApplicationId(row.id?.trim() || null);
      } else {
        setApplicationStatus(applicationApproved ? "approved" : "pending");
        setApplicationStage(applicationApproved ? "Approved" : "Submitted");
        setApplicationProperty(null);
        setApplicationId(initialApplicationId);
      }

      const charges = email ? readChargesForResident(email, resolvedUserId) : [];
      const pendingAppFee = charges.find((charge) => charge.kind === "application_fee" && charge.status === "pending");
      setPendingFeeLabel(pendingAppFee?.balanceLabel ?? null);

      const pendingTotalCents = charges
        .filter((charge) => charge.status === "pending")
        .reduce((sum, charge) => sum + centsFromLabel(charge.balanceLabel), 0);
      setBalanceDue(pendingTotalCents > 0 ? `$${(pendingTotalCents / 100).toFixed(2)}` : "—");
    };

    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [applicationApproved, email, initialApplicationId, resolvedUserId]);

  const applicationFeeIsPaid = useMemo(() => {
    if (pendingFeeLabel) return false;
    return applicationFeePaid || applicationStatus === "approved";
  }, [applicationFeePaid, applicationStatus, pendingFeeLabel]);

  const canOpenPayments = Boolean(email);
  const canOpenFullPortal = applicationStatus === "approved" && applicationFeeIsPaid && !managerIsFree;

  const statusNotice = useMemo(() => {
    if (showTestAccessNote) {
      return { tone: "border-sky-200/80 bg-sky-50/80 text-sky-950", body: "Test access active — resident portal is unlocked for this email." };
    }
    if (applicationStatus === "approved") {
      if (!applicationFeeIsPaid) {
        return {
          tone: "border-amber-200/80 bg-amber-50/80 text-amber-950",
          body: pendingFeeLabel
            ? `Your application is approved, but the application fee is still marked unpaid (${pendingFeeLabel}). You can log in and use Payments, but the rest of the resident portal stays locked until that fee is confirmed paid.`
            : "Your application is approved, but the application fee is still marked unpaid. You can log in and use Payments, but the rest of the resident portal stays locked until that fee is confirmed paid.",
        };
      }
      if (managerIsFree) return { tone: "border-emerald-200/70 bg-emerald-50/80 text-emerald-950", body: applicationProperty ? `${displayName} is approved for ${applicationProperty}. Payments are available; lease and work orders require a paid property plan.` : `${displayName} is approved. Payments are available; lease and work orders require a paid property plan.` };
      return { tone: "border-emerald-200/70 bg-emerald-50/80 text-emerald-950", body: applicationProperty ? `${displayName} is approved for ${applicationProperty}.` : `${displayName} is approved and can use the full resident portal.` };
    }
    if (applicationStatus === "rejected") {
      return { tone: "border-rose-200/70 bg-rose-50/80 text-rose-950", body: "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply." };
    }
    return {
      tone: "border-amber-200/80 bg-amber-50/80 text-amber-950",
      body: pendingFeeLabel
        ? `Application fee (${pendingFeeLabel}) is pending confirmation. Keep this account active so your manager can approve the application and unlock the rest of the portal after payment is confirmed.`
        : "Application submitted and pending manager review. Keep this resident account active so the rest of the portal can unlock after approval.",
    };
  }, [applicationFeeIsPaid, applicationProperty, applicationStatus, displayName, managerIsFree, pendingFeeLabel, showTestAccessNote]);

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
          {balanceDue !== "—" ? (
            <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
              You have an outstanding balance of <span className="font-semibold tabular-nums">{balanceDue}</span>.{" "}
              {canOpenPayments ? (
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/resident/payments">
                  Pay in Payments
                </Link>
              ) : (
                <span className="font-medium">Payments will appear as soon as access finishes syncing.</span>
              )}
            </p>
          ) : null}

          <p className={`rounded-2xl border px-4 py-3 text-sm ${statusNotice.tone}`}>{statusNotice.body}</p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatLink label="Payments" value={balanceDue === "—" ? "$0.00 due" : balanceDue} href="/resident/payments" />
            <StatLink label="Lease" value={canOpenFullPortal ? "Active" : "—"} href="/resident/lease" />
            <StatLink label="Work orders" value={canOpenFullPortal ? String(openWorkOrders) : "—"} href="/resident/work-orders" />
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLink label="Application" value={applicationId ?? applicationStage} href="/resident/inbox/unopened" />
          <StatLink label="Application fee" value={pendingFeeLabel ?? "—"} href="/resident/payments" />
          <StatLink label="Inbox" value={String(inboxUnread)} href="/resident/inbox/unopened" />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

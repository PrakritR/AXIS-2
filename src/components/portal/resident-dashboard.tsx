"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { HOUSEHOLD_CHARGES_EVENT, readChargesForResident } from "@/lib/household-charges";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";

function StatCard({
  label,
  children,
  muted,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[7.5rem] flex-col rounded-2xl border px-4 py-3.5 shadow-sm transition-colors ${
        muted
          ? "border-slate-200/70 bg-slate-50/40"
          : "border-slate-200/70 bg-white/90 hover:border-slate-300/80"
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

type ResidentApplicationStatus = "pending" | "approved" | "rejected";

function statusTone(status: ResidentApplicationStatus) {
  if (status === "approved") {
    return "border-emerald-200/70 bg-emerald-50/80 text-emerald-950";
  }
  if (status === "rejected") {
    return "border-rose-200/70 bg-rose-50/80 text-rose-950";
  }
  return "border-amber-200/70 bg-amber-50/90 text-amber-950";
}

export function ResidentDashboard({
  applicationApproved = false,
  showTestAccessNote = false,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
}: {
  applicationApproved?: boolean;
  /** Shown when full portal is unlocked via env allowlist but DB approval is still false. */
  showTestAccessNote?: boolean;
  displayName?: string;
  residentEmail?: string;
  residentUserId?: string | null;
}) {
  const email = residentEmail.trim().toLowerCase();
  const [applicationStatus, setApplicationStatus] = useState<ResidentApplicationStatus>(applicationApproved ? "approved" : "pending");
  const [applicationStage, setApplicationStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [applicationProperty, setApplicationProperty] = useState<string | null>(null);
  const [pendingFeeLabel, setPendingFeeLabel] = useState<string | null>(null);
  const [balanceDue, setBalanceDue] = useState("—");
  const openWorkOrders = 0;
  const inboxUnread = 0;

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
      } else {
        setApplicationStatus(applicationApproved ? "approved" : "pending");
        setApplicationStage(applicationApproved ? "Approved" : "Submitted");
        setApplicationProperty(null);
      }

      const charges = email ? readChargesForResident(email, residentUserId) : [];
      const pendingAppFee = charges.find((charge) => charge.kind === "application_fee" && charge.status === "pending");
      setPendingFeeLabel(pendingAppFee?.balanceLabel ?? null);

      const pendingTotal = charges
        .filter((charge) => charge.status === "pending")
        .reduce((sum, charge) => {
          const amount = Number.parseFloat(String(charge.balanceLabel).replace(/[^0-9.]+/g, ""));
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
      setBalanceDue(pendingTotal > 0 ? `$${pendingTotal.toFixed(2)}` : "—");
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
  }, [applicationApproved, email, residentUserId]);

  const primaryNotice = useMemo(() => {
    if (showTestAccessNote) {
      return {
        tone: "border-sky-200/80 bg-sky-50/90 text-sky-950",
        title: "Test access enabled",
        body: "This email is using resident portal access for testing while the live application record is still under review.",
      };
    }

    if (applicationStatus === "approved") {
      return {
        tone: statusTone("approved"),
        title: "Resident portal active",
        body: applicationProperty ? `${displayName} is approved for ${applicationProperty}.` : `${displayName} is approved and can use the full resident portal.`,
      };
    }

    if (applicationStatus === "rejected") {
      return {
        tone: statusTone("rejected"),
        title: "Application needs attention",
        body: "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply.",
      };
    }

    return {
      tone: statusTone("pending"),
      title: pendingFeeLabel ? "Application pending payment review" : "Application under review",
      body: pendingFeeLabel
        ? `Your application fee (${pendingFeeLabel}) is still pending confirmation. Your manager must mark it paid and approve the application before the full resident portal unlocks.`
        : "Your application has been submitted and is still pending manager review. Full resident portal access unlocks after approval.",
    };
  }, [applicationProperty, applicationStatus, displayName, pendingFeeLabel, showTestAccessNote]);

  if (applicationStatus === "approved") {
    return (
      <ManagerPortalPageShell
        title="Dashboard"
        titleAside={
          <Link
            href="/resident/inbox/unopened"
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Inbox
          </Link>
        }
      >
        <section className={`rounded-[24px] border px-5 py-5 ${primaryNotice.tone}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Status</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{primaryNotice.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6">{primaryNotice.body}</p>
        </section>
        {balanceDue !== "—" ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-950">
            You have an outstanding balance of <span className="font-semibold tabular-nums">{balanceDue}</span>.{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/resident/payments">
              Pay in Payments
            </Link>
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Account status">
            <p className="text-lg font-semibold text-slate-900">Active</p>
            <p className="mt-1 text-sm text-slate-500">Resident access is live.</p>
          </StatCard>
          <StatCard label="Lease">
            <p className="text-lg font-semibold text-slate-900">Active</p>
            <Link
              href="/resident/lease"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Payment due">
            <p className="text-lg font-semibold tabular-nums text-slate-900">{balanceDue}</p>
            <Link
              href="/resident/payments"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Work orders">
            <p className="text-lg font-semibold text-slate-900">{openWorkOrders} open</p>
            <Link
              href="/resident/work-orders"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Home" muted>
            <p className="text-sm font-medium text-slate-800">{applicationProperty ?? "Your unit"}</p>
          </StatCard>
        </div>
        <Link
          href="/resident/inbox/unopened"
          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/25"
        >
          <span className="flex items-center gap-2 text-slate-800">
            Inbox
            {inboxUnread > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{inboxUnread}</span>
            ) : null}
          </span>
          <span className="text-primary">Open</span>
        </Link>
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell title="Dashboard">
      <section className={`rounded-[24px] border px-5 py-5 ${primaryNotice.tone}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Application status</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{primaryNotice.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6">{primaryNotice.body}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current stage">
          <p className="text-lg font-semibold text-slate-900">{applicationStage}</p>
          <p className="mt-1 text-sm text-slate-500">{applicationProperty ?? "Application on file"}</p>
        </StatCard>

        <StatCard label="Application fee">
          <p className="text-lg font-semibold text-slate-900">{pendingFeeLabel ?? "No balance due"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {pendingFeeLabel ? "Waiting for payment confirmation." : "No application fee is blocking review."}
          </p>
        </StatCard>

        <StatCard label="Inbox">
          <p className="text-lg font-semibold text-slate-900">{inboxUnread}</p>
          <p className="mt-1 text-sm text-slate-500">Messages available while you wait.</p>
          <Link
            href="/resident/inbox/unopened"
            className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
          >
            Open inbox
          </Link>
        </StatCard>

        <StatCard label="Next step" muted>
          <p className="text-sm font-medium text-slate-800">
            {pendingFeeLabel ? "Wait for payment confirmation and approval" : "Wait for manager approval"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            We&apos;ll unlock lease, payments, and work orders after approval.
          </p>
        </StatCard>
      </div>
    </ManagerPortalPageShell>
  );
}

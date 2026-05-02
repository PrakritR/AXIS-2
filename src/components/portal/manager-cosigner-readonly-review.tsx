"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { CosignerSubmission } from "@/lib/cosigner-submissions-storage";
import { buildPortalApplicationOpenHref } from "@/lib/manager-applications-storage";
import { digitsOnly } from "@/lib/rental-application/masks";

function displayOrDash(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t ? t : <span className="text-slate-400">Not provided</span>;
}

function maskSsn(ssn: string) {
  const d = digitsOnly(ssn);
  if (d.length !== 9) return ssn.trim() || "Not provided";
  return `***-**-${d.slice(5)}`;
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <h3 className="text-[0.8125rem] font-semibold text-slate-700">{title}</h3>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-full shrink-0 text-xs font-medium leading-5 text-slate-500 sm:w-32">{k}</dt>
      <dd className="min-w-0 flex-1 break-words leading-5 text-slate-900">{v}</dd>
    </div>
  );
}

export function ManagerCosignerReadonlyReview({
  sub,
  primaryApplicationAxisId,
}: {
  sub: CosignerSubmission;
  /** Primary applicant Axis ID — same row this co-signer submission is attached to in Applications. */
  primaryApplicationAxisId: string;
}) {
  const bankruptcyLabel =
    sub.bankruptcy === "never" ? "Never filed" : sub.bankruptcy === "past_discharged" ? "Past (discharged)" : sub.bankruptcy === "current" ? "Current / active" : "—";
  const criminalLabel = sub.criminal === "no" ? "No" : sub.criminal === "yes" ? "Yes" : "—";

  return (
    <div className="space-y-3">
      {primaryApplicationAxisId.trim() ? (
        <div className="rounded-xl border border-sky-200/90 bg-sky-50/80 px-4 py-3">
          <Link
            href={buildPortalApplicationOpenHref(primaryApplicationAxisId)}
            className="text-sm font-semibold text-sky-900 underline-offset-4 hover:underline"
          >
            Open primary application in Property Portal
          </Link>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Jumps to <span className="font-mono text-[11px] text-slate-800">{primaryApplicationAxisId.trim()}</span> on the
            Applications page.
          </p>
        </div>
      ) : null}
    <div className="grid gap-3 xl:grid-cols-2">
      <ReviewSection title="Link to signer">
        <Row k="Signer Axis ID" v={displayOrDash(sub.signerAppId)} />
        <Row k="Signer name" v={displayOrDash(sub.signerFullName)} />
        <Row k="Submitted" v={sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "—"} />
      </ReviewSection>

      <ReviewSection title="Personal information">
        <Row k="Legal name" v={displayOrDash(sub.fullName)} />
        <Row k="Email" v={displayOrDash(sub.email)} />
        <Row k="Phone" v={displayOrDash(sub.phone)} />
        <Row k="Date of birth" v={displayOrDash(sub.dob)} />
        <Row k="ID number" v={displayOrDash(sub.dlNumber)} />
        <Row k="SSN" v={maskSsn(sub.ssn)} />
      </ReviewSection>

      <ReviewSection title="Address">
        <Row
          k="Current address"
          v={displayOrDash([sub.address, [sub.city, sub.state, sub.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "))}
        />
      </ReviewSection>

      <ReviewSection title="Employment">
        <Row k="Not employed" v={sub.notEmployed ? "Yes" : "No"} />
        {!sub.notEmployed ? (
          <>
            <Row k="Employer" v={displayOrDash(sub.employerName)} />
            <Row k="Employer address" v={displayOrDash(sub.employerAddress)} />
            <Row k="Supervisor" v={displayOrDash([sub.supervisorName, sub.supervisorPhone].filter(Boolean).join(" · "))} />
            <Row k="Job title" v={displayOrDash(sub.jobTitle)} />
            <Row k="Employment start" v={displayOrDash(sub.employmentStart)} />
            <Row k="Monthly income" v={displayOrDash(sub.monthlyIncome)} />
            <Row k="Annual income" v={displayOrDash(sub.annualIncome)} />
          </>
        ) : null}
        {sub.otherIncome.trim() ? <Row k="Other income" v={sub.otherIncome} /> : null}
      </ReviewSection>

      <ReviewSection title="Background">
        <Row k="Bankruptcy" v={bankruptcyLabel} />
        <Row k="Criminal convictions" v={criminalLabel} />
        <Row k="Credit consent" v={sub.consentCredit ? "Authorized" : "Not checked"} />
      </ReviewSection>

      <ReviewSection title="Signature">
        <Row k="Signature" v={displayOrDash(sub.signature)} />
        <Row k="Date signed" v={displayOrDash(sub.dateSigned)} />
      </ReviewSection>
    </div>
    </div>
  );
}

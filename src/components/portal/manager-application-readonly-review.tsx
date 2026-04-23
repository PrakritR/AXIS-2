"use client";

import type { ReactNode } from "react";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import { paymentAtSigningPriceLabel, utilitiesListingEstimateLabel } from "@/lib/rental-application/listing-fees-display";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { digitsOnly } from "@/lib/rental-application/masks";

function displayOrDash(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t ? t : <span className="text-slate-400">Not provided</span>;
}

function maskSsnReview(ssn: string) {
  const d = digitsOnly(ssn);
  if (d.length !== 9) return ssn.trim() || "Not provided";
  return `***-**-${d.slice(5)}`;
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      <dl className="mt-3 space-y-2.5 text-sm">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-100/80 pb-2.5 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,34%)_1fr] sm:gap-3">
      <dt className="font-medium text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v}</dd>
    </div>
  );
}

/** Read-only review matching the rental application “Review” step (step 11). */
export function ManagerApplicationReadonlyReview({ partial }: { partial: Partial<RentalWizardFormState> }) {
  const form: RentalWizardFormState = { ...createInitialRentalWizardState(), ...partial };
  const prop = getPropertyById(form.propertyId);
  const roomLabel = (id: string) => getRoomChoiceLabel(id);

  return (
    <div className="space-y-4">
      <ReviewSection title="Group application">
        <Row k="Applying as group" v={form.applyingAsGroup === "yes" ? "Yes" : form.applyingAsGroup === "no" ? "No" : "—"} />
        {form.applyingAsGroup === "yes" ? (
          <>
            <Row k="Role" v={form.groupRole === "first" ? "First applicant" : form.groupRole === "joining" ? "Joining group" : "—"} />
            <Row k={form.groupRole === "first" ? "Group size" : "Group ID"} v={displayOrDash(form.groupRole === "first" ? form.groupSize : form.groupId)} />
          </>
        ) : null}
      </ReviewSection>
      <ReviewSection title="Co-signer">
        <Row k="Co-signer planned" v={form.hasCosigner === "yes" ? "Yes" : form.hasCosigner === "no" ? "No" : "—"} />
      </ReviewSection>
      <ReviewSection title="Property information">
        <Row k="Property" v={displayOrDash(prop?.title)} />
        <Row k="1st choice room" v={displayOrDash(roomLabel(form.roomChoice1))} />
        <Row k="2nd choice room" v={displayOrDash(roomLabel(form.roomChoice2))} />
        <Row k="3rd choice room" v={displayOrDash(roomLabel(form.roomChoice3))} />
        <Row k="Lease term" v={displayOrDash(form.leaseTerm)} />
        <Row k="Lease start" v={displayOrDash(form.leaseStart)} />
        {form.leaseTerm !== "Month-to-Month" ? <Row k="Lease end" v={displayOrDash(form.leaseEnd)} /> : null}
      </ReviewSection>
      {prop?.listingSubmission?.v === 1 ? (
        <ReviewSection title="Housing charges (listing)">
          <Row k="Application fee" v={displayOrDash(prop.listingSubmission.applicationFee)} />
          <Row k="Security deposit" v={displayOrDash(prop.listingSubmission.securityDeposit)} />
          <Row k="Move-in fee" v={displayOrDash(prop.listingSubmission.moveInFee)} />
          <Row k="Payment due at signing" v={displayOrDash(paymentAtSigningPriceLabel(prop.listingSubmission))} />
          <Row k="Utilities (estimate, by room)" v={displayOrDash(utilitiesListingEstimateLabel(prop.listingSubmission))} />
        </ReviewSection>
      ) : null}
      <ReviewSection title="Personal information">
        <Row k="Legal name" v={displayOrDash(form.fullLegalName)} />
        <Row k="Date of birth" v={displayOrDash(form.dateOfBirth)} />
        <Row k="SSN" v={maskSsnReview(form.ssn)} />
        <Row k="ID number" v={displayOrDash(form.driversLicense)} />
        <Row k="Phone" v={displayOrDash(form.phone)} />
        <Row k="Email" v={displayOrDash(form.email)} />
      </ReviewSection>
      <ReviewSection title="Address history">
        <Row
          k="Current address"
          v={displayOrDash(
            [form.currentStreet, [form.currentCity, form.currentState, form.currentZip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          )}
        />
        <Row k="Landlord (current)" v={displayOrDash([form.currentLandlordName, form.currentLandlordPhone].filter(Boolean).join(" · "))} />
        <Row k="Move-in / move-out (current)" v={displayOrDash([form.currentMoveIn, form.currentMoveOut].filter(Boolean).join(" → "))} />
        <Row k="Reason for leaving (current)" v={displayOrDash(form.currentReasonLeaving)} />
        {form.noPreviousAddress ? (
          <Row k="Previous address" v="Not provided (none reported)" />
        ) : (
          <>
            <Row
              k="Previous address"
              v={displayOrDash(
                [form.prevStreet, [form.prevCity, form.prevState, form.prevZip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
              )}
            />
            <Row k="Landlord (previous)" v={displayOrDash([form.prevLandlordName, form.prevLandlordPhone].filter(Boolean).join(" · "))} />
            <Row k="Move-in / move-out (previous)" v={displayOrDash([form.prevMoveIn, form.prevMoveOut].filter(Boolean).join(" → "))} />
            <Row k="Reason for leaving (previous)" v={displayOrDash(form.prevReasonLeaving)} />
          </>
        )}
      </ReviewSection>
      <ReviewSection title="Employment">
        <Row k="Not employed" v={form.notEmployed ? "Yes" : "No"} />
        <Row k="Employer" v={displayOrDash(form.employer)} />
        <Row k="Employer address" v={displayOrDash(form.employerAddress)} />
        <Row k="Supervisor" v={displayOrDash([form.supervisorName, form.supervisorPhone].filter(Boolean).join(" · "))} />
        <Row k="Job title" v={displayOrDash(form.jobTitle)} />
        <Row k="Employment start" v={displayOrDash(form.employmentStart)} />
        <Row k="Monthly income" v={displayOrDash(form.monthlyIncome)} />
        <Row k="Annual income" v={displayOrDash(form.annualIncome)} />
        <Row k="Other income" v={displayOrDash(form.otherIncome)} />
      </ReviewSection>
      <ReviewSection title="References">
        <Row k="Reference 1" v={displayOrDash(`${form.ref1Name} · ${form.ref1Relationship} · ${form.ref1Phone}`)} />
        <Row
          k="Reference 2"
          v={form.ref2Name.trim() ? displayOrDash(`${form.ref2Name} · ${form.ref2Relationship} · ${form.ref2Phone}`) : displayOrDash("")}
        />
      </ReviewSection>
      <ReviewSection title="Additional details">
        <Row k="Occupants" v={displayOrDash(form.occupancyCount)} />
        <Row k="Pets" v={displayOrDash(form.pets)} />
        <Row k="Expected utilities / mo (applicant)" v={displayOrDash(form.expectedUtilitiesMonthly)} />
        <Row k="Eviction" v={form.evictionHistory === "yes" ? `Yes — ${form.evictionDetails}` : form.evictionHistory === "no" ? "No" : "—"} />
        <Row k="Bankruptcy" v={form.bankruptcyHistory === "yes" ? `Yes — ${form.bankruptcyDetails}` : form.bankruptcyHistory === "no" ? "No" : "—"} />
        <Row k="Criminal history" v={form.criminalHistory === "yes" ? `Yes — ${form.criminalDetails}` : form.criminalHistory === "no" ? "No" : "—"} />
        <Row k="Notes" v={displayOrDash(form.additionalNotes)} />
      </ReviewSection>
      <ReviewSection title="Consent & signature">
        <Row k="Credit / background" v={form.consentCredit ? "Authorized" : "Not checked"} />
        <Row k="Accuracy confirmed" v={form.consentTruth ? "Yes" : "Not checked"} />
        <Row k="Signature" v={displayOrDash(form.digitalSignature)} />
        <Row k="Date signed" v={displayOrDash(form.dateSigned)} />
        <Row k="Application fee acknowledged" v={form.applicationFeeAcknowledged ? "Yes" : "No"} />
      </ReviewSection>
    </div>
  );
}

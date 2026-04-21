"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { APPLICATION_FEE_PROMO_WAIVE_CODE, removePendingApplicationFeeCharge } from "@/lib/household-charges";
import { LEASE_TERM_OPTIONS, getPropertyById, roomSelectOptionsWithNone } from "@/lib/rental-application/data";
import { paymentAtSigningPriceLabel, utilitiesListingEstimateLabel } from "@/lib/rental-application/listing-fees-display";
import type { RentalWizardErrors, RentalWizardFormState, YesNo } from "@/lib/rental-application/types";
import { digitsOnly, formatMoneyBlur } from "@/lib/rental-application/masks";

const pillWrap = "flex flex-wrap gap-2 rounded-full border border-slate-200 bg-slate-50/90 p-1";
const pillActive = "rounded-full px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground shadow-sm transition min-h-[44px] sm:min-h-0";
const pillIdle =
  "rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 min-h-[44px] sm:min-h-0";

function Label({
  children,
  required,
  optional,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800">
      {children}
      {required ? <span className="text-primary"> *</span> : null}
      {optional ? <span className="pl-1 font-normal text-slate-400">(optional)</span> : null}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1.5 text-sm text-red-600">{msg}</p>;
}

function StepIntro({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm leading-relaxed text-slate-600 ${className}`}>{children}</p>;
}

function YesNoPills({
  value,
  onChange,
  error,
  name,
}: {
  value: YesNo;
  onChange: (v: "yes" | "no") => void;
  error?: string;
  name: string;
}) {
  return (
    <div>
      <div className={pillWrap} role="group" aria-label={name}>
        <button type="button" className={value === "yes" ? pillActive : pillIdle} onClick={() => onChange("yes")}>
          Yes
        </button>
        <button type="button" className={value === "no" ? pillActive : pillIdle} onClick={() => onChange("no")}>
          No
        </button>
      </div>
      <FieldError msg={error} />
    </div>
  );
}

export type WizardStepsProps = {
  step: number;
  form: RentalWizardFormState;
  errors: RentalWizardErrors;
  propertyOptions: { value: string; label: string }[];
  patch: (p: Partial<RentalWizardFormState>) => void;
  mergeErrors: (partial: RentalWizardErrors) => void;
  applicationFeeGate: {
    needsFee: boolean;
    paid: boolean;
    displayLabel: string;
    amount: number;
    waived: boolean;
  };
  setPhone: (next: string) => void;
  setLandlordPhone: (next: string) => void;
  setPrevLandlordPhone: (next: string) => void;
  setSupervisorPhone: (next: string) => void;
  setRef1Phone: (next: string) => void;
  setRef2Phone: (next: string) => void;
  setSsn: (next: string) => void;
  goToStep: (n: number) => void;
};

function displayOrDash(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t ? t : <span className="text-slate-400">Not provided</span>;
}

function maskSsnReview(ssn: string) {
  const d = digitsOnly(ssn);
  if (d.length !== 9) return ssn.trim() || "Not provided";
  return `***-**-${d.slice(5)}`;
}

export function RentalWizardStepBody(p: WizardStepsProps) {
  const { step, form, errors, propertyOptions, patch, goToStep, mergeErrors, applicationFeeGate } = p;

  if (step === 1) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Group application</h2>
          <StepIntro className="mt-3">
            If you are applying with roommates, one person should submit first. Everyone else joins using the same Group ID
            so your applications stay linked.
          </StepIntro>
        </div>

        <div className="space-y-2">
          <Label required>Are you applying as part of a group?</Label>
          <YesNoPills
            value={form.applyingAsGroup}
            error={errors.applyingAsGroup}
            name="Group application"
            onChange={(v) => {
              patch({
                applyingAsGroup: v,
                groupRole: v === "no" ? null : form.groupRole,
                groupSize: v === "no" ? "" : form.groupSize,
                groupId: v === "no" ? "" : form.groupId,
              });
            }}
          />
        </div>

        {form.applyingAsGroup === "yes" ? (
          <div className="space-y-6 rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.08] to-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-primary">Group application</p>
            <p className="text-sm leading-relaxed text-slate-700">
              You will either start the group and receive a Group ID to share, or paste the Group ID from the first applicant.
            </p>

            <div className="space-y-2">
              <Label required>What is your role in the group?</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => patch({ groupRole: "first", groupId: "" })}
                  className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-semibold leading-snug transition ${
                    form.groupRole === "first"
                      ? "border-primary bg-white text-[#0f172a] shadow-md ring-2 ring-primary/15"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  I am the first person applying
                </button>
                <button
                  type="button"
                  onClick={() => patch({ groupRole: "joining", groupSize: "" })}
                  className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-semibold leading-snug transition ${
                    form.groupRole === "joining"
                      ? "border-primary bg-white text-[#0f172a] shadow-md ring-2 ring-primary/15"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  I am joining an existing group
                </button>
              </div>
              <FieldError msg={errors.groupRole} />
            </div>

            {form.groupRole === "first" ? (
              <div className="space-y-2">
                <Label htmlFor="groupSize" required>
                  How many people are applying together?
                </Label>
                <p className="text-xs text-slate-500">Include yourself. Whole numbers from 2 to 30.</p>
                <Select
                  id="groupSize"
                  value={form.groupSize}
                  onChange={(e) => patch({ groupSize: e.target.value })}
                  className={errors.groupSize ? "border-red-400 ring-2 ring-red-100" : ""}
                >
                  <option value="">Select group size</option>
                  {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={String(n)}>
                      {n} people
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">
                  We&apos;ll generate a Group ID after submission for you to share with roommates.
                </p>
                <FieldError msg={errors.groupSize} />
              </div>
            ) : null}

            {form.groupRole === "joining" ? (
              <div className="space-y-2">
                <Label htmlFor="groupId" required>
                  Group ID
                </Label>
                <p className="text-xs text-slate-500">Paste the Group ID shared by the first applicant. Format: AXISGRP-…</p>
                <Input
                  id="groupId"
                  value={form.groupId}
                  onChange={(e) => patch({ groupId: e.target.value })}
                  placeholder="AXISGRP-…"
                  autoComplete="off"
                  className={errors.groupId ? "border-red-400 ring-2 ring-red-100" : ""}
                />
                <FieldError msg={errors.groupId} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Co-signer</h2>
          <StepIntro>
            A co-signer may strengthen your application. This step only records your intent; they will complete a separate
            short form later.
          </StepIntro>
        </div>
        <div className="space-y-2">
          <Label required>Will someone be co-signing this application with you?</Label>
          <YesNoPills
            value={form.hasCosigner}
            error={errors.hasCosigner}
            name="Co-signer"
            onChange={(v) => patch({ hasCosigner: v })}
          />
        </div>
        {form.hasCosigner === "yes" ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-sm leading-relaxed text-slate-700">
            After you pay the listing&apos;s application fee (or waive it with promo <span className="font-mono font-semibold">FEEWAIVE</span> on
            the last step), you&apos;ll receive an <strong className="text-slate-900">Application ID</strong> to share with your co-signer so they
            can link their information to yours.
          </div>
        ) : null}
      </div>
    );
  }

  if (step === 3) {
    const rooms = roomSelectOptionsWithNone(form.propertyId).filter((o) => o.value !== "");
    const roomsWithNone = roomSelectOptionsWithNone(form.propertyId);
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Property information</h2>
          <StepIntro>
            Choose the listing you are applying for and your room preferences. Lease dates should match what you are prepared to
            sign.
          </StepIntro>
        </div>

        <div className="space-y-2">
          <Label htmlFor="propertyId" required>
            Property name
          </Label>
          <Select
            id="propertyId"
            value={form.propertyId}
            onChange={(e) => {
              const pid = e.target.value;
              patch({ propertyId: pid, roomChoice1: "", roomChoice2: "", roomChoice3: "" });
            }}
            className={errors.propertyId ? "border-red-400 ring-2 ring-red-100" : ""}
          >
            <option value="">Select a property</option>
            {propertyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <FieldError msg={errors.propertyId} />
        </div>

        <div className="space-y-2">
          <Label required>Room preferences</Label>
          <p className="text-xs text-slate-500">
            Your first choice is used for availability and processing; second and third choices help with placement.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">1st choice</span>
              <Select
                value={form.roomChoice1}
                disabled={!form.propertyId}
                onChange={(e) => patch({ roomChoice1: e.target.value })}
                className={errors.roomChoice1 ? "border-red-400 ring-2 ring-red-100" : ""}
              >
                <option value="">{form.propertyId ? "Select a room" : "Select a property first"}</option>
                {rooms.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <FieldError msg={errors.roomChoice1} />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">2nd choice</span>
              <Select
                value={form.roomChoice2}
                disabled={!form.propertyId}
                onChange={(e) => patch({ roomChoice2: e.target.value })}
                className={errors.roomChoice2 ? "border-red-400 ring-2 ring-red-100" : ""}
              >
                {roomsWithNone.map((o) => (
                  <option key={o.label + o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <FieldError msg={errors.roomChoice2} />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">3rd choice</span>
              <Select
                value={form.roomChoice3}
                disabled={!form.propertyId}
                onChange={(e) => patch({ roomChoice3: e.target.value })}
                className={errors.roomChoice3 ? "border-red-400 ring-2 ring-red-100" : ""}
              >
                {roomsWithNone.map((o) => (
                  <option key={`t-${o.label}-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <FieldError msg={errors.roomChoice3} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leaseTerm" required>
            Lease term
          </Label>
          <Select
            id="leaseTerm"
            value={form.leaseTerm}
            onChange={(e) => patch({ leaseTerm: e.target.value })}
            className={errors.leaseTerm ? "border-red-400 ring-2 ring-red-100" : ""}
          >
            <option value="">Select lease length</option>
            {LEASE_TERM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <FieldError msg={errors.leaseTerm} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leaseStart" required>
              Lease start date
            </Label>
            <Input
              id="leaseStart"
              type="date"
              value={form.leaseStart}
              onChange={(e) => patch({ leaseStart: e.target.value })}
              className={errors.leaseStart ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.leaseStart} />
          </div>
          <div className="space-y-2">
            {form.leaseTerm === "Month-to-Month" ? (
              <Label htmlFor="leaseEnd" optional>
                Lease end date
              </Label>
            ) : (
              <Label htmlFor="leaseEnd" required>
                Lease end date
              </Label>
            )}
            {form.leaseTerm === "Month-to-Month" ? (
              <p className="text-xs text-slate-500">Not required for month-to-month; add an end date if you have a planned move-out.</p>
            ) : null}
            <Input
              id="leaseEnd"
              type="date"
              value={form.leaseEnd}
              onChange={(e) => patch({ leaseEnd: e.target.value })}
              className={errors.leaseEnd ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.leaseEnd} />
          </div>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Signer information</h2>
          <StepIntro className="mt-3">
            Enter your legal name and contact details exactly as they appear on your ID. This section is encrypted in transit in
            production environments.
          </StepIntro>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Identity & contact</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullLegalName" required>
                Full legal name
              </Label>
              <Input
                id="fullLegalName"
                value={form.fullLegalName}
                onChange={(e) => patch({ fullLegalName: e.target.value })}
                placeholder="First and last name"
                autoComplete="name"
                className={errors.fullLegalName ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.fullLegalName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth" required>
                Date of birth
              </Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => patch({ dateOfBirth: e.target.value })}
                className={errors.dateOfBirth ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.dateOfBirth} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssn" required>
                Social Security number
              </Label>
              <Input
                id="ssn"
                inputMode="numeric"
                autoComplete="off"
                value={form.ssn}
                onChange={(e) => p.setSsn(e.target.value)}
                placeholder="###-##-####"
                className={errors.ssn ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.ssn} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driversLicense" required>
                Driver&apos;s license or ID number
              </Label>
              <Input
                id="driversLicense"
                value={form.driversLicense}
                onChange={(e) => patch({ driversLicense: e.target.value })}
                className={errors.driversLicense ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.driversLicense} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" required>
                Phone number
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => p.setPhone(e.target.value)}
                placeholder="(###) ###-####"
                className={errors.phone ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.phone} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email" required>
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="you@example.com"
                className={errors.email ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.email} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Current address</h2>
          <StepIntro className="mt-3">Where you live today. Landlord and move dates help us verify your rental history.</StepIntro>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentStreet" required>
            Street address
          </Label>
          <Input
            id="currentStreet"
            value={form.currentStreet}
            onChange={(e) => patch({ currentStreet: e.target.value })}
            autoComplete="street-address"
            className={errors.currentStreet ? "border-red-400 ring-2 ring-red-100" : ""}
          />
          <FieldError msg={errors.currentStreet} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="currentCity" required>
              City
            </Label>
            <Input
              id="currentCity"
              value={form.currentCity}
              onChange={(e) => patch({ currentCity: e.target.value })}
              className={errors.currentCity ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.currentCity} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentState" required>
              State
            </Label>
            <Input
              id="currentState"
              value={form.currentState}
              onChange={(e) => patch({ currentState: e.target.value.toUpperCase() })}
              maxLength={2}
              placeholder="WA"
              className={errors.currentState ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.currentState} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentZip" required>
              ZIP code
            </Label>
            <Input
              id="currentZip"
              inputMode="numeric"
              value={form.currentZip}
              onChange={(e) => patch({ currentZip: e.target.value })}
              className={errors.currentZip ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.currentZip} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="currentLandlordName" optional>
              Current landlord name
            </Label>
            <Input
              id="currentLandlordName"
              value={form.currentLandlordName}
              onChange={(e) => patch({ currentLandlordName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentLandlordPhone" optional>
              Current landlord phone
            </Label>
            <Input
              id="currentLandlordPhone"
              type="tel"
              value={form.currentLandlordPhone}
              onChange={(e) => p.setLandlordPhone(e.target.value)}
              placeholder="(###) ###-####"
              className={errors.currentLandlordPhone ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.currentLandlordPhone} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="currentMoveIn" optional>
              Current move-in date
            </Label>
            <Input id="currentMoveIn" type="date" value={form.currentMoveIn} onChange={(e) => patch({ currentMoveIn: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentMoveOut" optional>
              Current move-out date
            </Label>
            <Input id="currentMoveOut" type="date" value={form.currentMoveOut} onChange={(e) => patch({ currentMoveOut: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentReasonLeaving" optional>
            Reason for leaving
          </Label>
          <Textarea
            id="currentReasonLeaving"
            value={form.currentReasonLeaving}
            onChange={(e) => patch({ currentReasonLeaving: e.target.value })}
            placeholder="e.g. relocating for work, lease ending…"
            rows={3}
          />
        </div>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Previous address</h2>
          <StepIntro className="mt-3">If this is your first lease, you can indicate that you have no prior address to report.</StepIntro>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
            checked={form.noPreviousAddress}
            onChange={(e) => patch({ noPreviousAddress: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">I do not have a previous address to provide</span>
        </label>

        {!form.noPreviousAddress ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="prevStreet" required>
                Street address
              </Label>
              <Input
                id="prevStreet"
                value={form.prevStreet}
                onChange={(e) => patch({ prevStreet: e.target.value })}
                disabled={form.noPreviousAddress}
                className={errors.prevStreet ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.prevStreet} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="prevCity" required>
                  City
                </Label>
                <Input
                  id="prevCity"
                  value={form.prevCity}
                  onChange={(e) => patch({ prevCity: e.target.value })}
                  className={errors.prevCity ? "border-red-400 ring-2 ring-red-100" : ""}
                />
                <FieldError msg={errors.prevCity} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevState" required>
                  State
                </Label>
                <Input
                  id="prevState"
                  value={form.prevState}
                  onChange={(e) => patch({ prevState: e.target.value.toUpperCase() })}
                  maxLength={2}
                  className={errors.prevState ? "border-red-400 ring-2 ring-red-100" : ""}
                />
                <FieldError msg={errors.prevState} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevZip" required>
                  ZIP code
                </Label>
                <Input
                  id="prevZip"
                  value={form.prevZip}
                  onChange={(e) => patch({ prevZip: e.target.value })}
                  className={errors.prevZip ? "border-red-400 ring-2 ring-red-100" : ""}
                />
                <FieldError msg={errors.prevZip} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prevLandlordName" optional>
                  Previous landlord name
                </Label>
                <Input id="prevLandlordName" value={form.prevLandlordName} onChange={(e) => patch({ prevLandlordName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevLandlordPhone" optional>
                  Previous landlord phone
                </Label>
                <Input
                  id="prevLandlordPhone"
                  type="tel"
                  value={form.prevLandlordPhone}
                  onChange={(e) => p.setPrevLandlordPhone(e.target.value)}
                  placeholder="(###) ###-####"
                  className={errors.prevLandlordPhone ? "border-red-400 ring-2 ring-red-100" : ""}
                />
                <FieldError msg={errors.prevLandlordPhone} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prevMoveIn" optional>
                  Move-in date
                </Label>
                <Input id="prevMoveIn" type="date" value={form.prevMoveIn} onChange={(e) => patch({ prevMoveIn: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevMoveOut" optional>
                  Move-out date
                </Label>
                <Input id="prevMoveOut" type="date" value={form.prevMoveOut} onChange={(e) => patch({ prevMoveOut: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prevReasonLeaving" optional>
                Reason for leaving
              </Label>
              <Textarea
                id="prevReasonLeaving"
                value={form.prevReasonLeaving}
                onChange={(e) => patch({ prevReasonLeaving: e.target.value })}
                rows={3}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (step === 7) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Employment and income</h2>
          <StepIntro className="mt-3">
            Income helps us confirm you can meet rent obligations. If you are between jobs, use Other income and explain in
            notes on the next screens if needed.
          </StepIntro>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
            checked={form.notEmployed}
            onChange={(e) => patch({ notEmployed: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">I am not currently employed</span>
        </label>

        {errors._general ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errors._general}</p> : null}

        <div className={`space-y-5 rounded-2xl border border-slate-200 p-5 sm:p-6 ${form.notEmployed ? "opacity-50" : ""}`}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Employment</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employer" required={!form.notEmployed}>
                Employer
              </Label>
              <Input
                id="employer"
                value={form.employer}
                disabled={form.notEmployed}
                onChange={(e) => patch({ employer: e.target.value })}
                className={errors.employer ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.employer} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employerAddress" optional>
                Employer address
              </Label>
              <Input id="employerAddress" value={form.employerAddress} disabled={form.notEmployed} onChange={(e) => patch({ employerAddress: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisorName" optional>
                Supervisor name
              </Label>
              <Input id="supervisorName" value={form.supervisorName} disabled={form.notEmployed} onChange={(e) => patch({ supervisorName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisorPhone" optional>
                Supervisor phone
              </Label>
              <Input
                id="supervisorPhone"
                type="tel"
                value={form.supervisorPhone}
                disabled={form.notEmployed}
                onChange={(e) => p.setSupervisorPhone(e.target.value)}
                placeholder="(###) ###-####"
                className={errors.supervisorPhone ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.supervisorPhone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle" optional>
                Job title
              </Label>
              <Input id="jobTitle" value={form.jobTitle} disabled={form.notEmployed} onChange={(e) => patch({ jobTitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentStart" optional>
                Employment start date
              </Label>
              <Input id="employmentStart" type="date" value={form.employmentStart} disabled={form.notEmployed} onChange={(e) => patch({ employmentStart: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Income</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthlyIncome" optional>
                Monthly gross income
              </Label>
              <Input
                id="monthlyIncome"
                inputMode="decimal"
                value={form.monthlyIncome}
                onChange={(e) => patch({ monthlyIncome: e.target.value })}
                onBlur={() => patch({ monthlyIncome: formatMoneyBlur(form.monthlyIncome) })}
                placeholder="e.g. 4,200"
                className={errors.monthlyIncome ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.monthlyIncome} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="annualIncome" optional>
                Annual gross income
              </Label>
              <Input
                id="annualIncome"
                inputMode="decimal"
                value={form.annualIncome}
                onChange={(e) => patch({ annualIncome: e.target.value })}
                onBlur={() => patch({ annualIncome: formatMoneyBlur(form.annualIncome) })}
                placeholder="e.g. 52,000"
                className={errors.annualIncome ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.annualIncome} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="otherIncome" optional>
                Other income
              </Label>
              <Input
                id="otherIncome"
                value={form.otherIncome}
                onChange={(e) => patch({ otherIncome: e.target.value })}
                onBlur={() => patch({ otherIncome: formatMoneyBlur(form.otherIncome) })}
                placeholder="Benefits, stipends, trust distributions…"
                className={errors.otherIncome ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.otherIncome} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 8) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">References</h2>
          <StepIntro className="mt-3">List people who can speak to your character or employment. Avoid family members when possible.</StepIntro>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Reference 1</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ref1Name" required>
                Name
              </Label>
              <Input id="ref1Name" value={form.ref1Name} onChange={(e) => patch({ ref1Name: e.target.value })} className={errors.ref1Name ? "border-red-400 ring-2 ring-red-100" : ""} />
              <FieldError msg={errors.ref1Name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref1Relationship" required>
                Relationship
              </Label>
              <Input
                id="ref1Relationship"
                value={form.ref1Relationship}
                onChange={(e) => patch({ ref1Relationship: e.target.value })}
                placeholder="e.g. supervisor, colleague"
                className={errors.ref1Relationship ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.ref1Relationship} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ref1Phone" required>
                Phone
              </Label>
              <Input
                id="ref1Phone"
                type="tel"
                value={form.ref1Phone}
                onChange={(e) => p.setRef1Phone(e.target.value)}
                placeholder="(###) ###-####"
                className={errors.ref1Phone ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.ref1Phone} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Reference 2</p>
          <p className="mt-1 text-xs text-slate-500">Optional — leave blank if you only have one reference.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ref2Name" optional>
                Name
              </Label>
              <Input id="ref2Name" value={form.ref2Name} onChange={(e) => patch({ ref2Name: e.target.value })} className={errors.ref2Name ? "border-red-400 ring-2 ring-red-100" : ""} />
              <FieldError msg={errors.ref2Name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref2Relationship" optional>
                Relationship
              </Label>
              <Input id="ref2Relationship" value={form.ref2Relationship} onChange={(e) => patch({ ref2Relationship: e.target.value })} className={errors.ref2Relationship ? "border-red-400 ring-2 ring-red-100" : ""} />
              <FieldError msg={errors.ref2Relationship} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ref2Phone" optional>
                Phone
              </Label>
              <Input
                id="ref2Phone"
                type="tel"
                value={form.ref2Phone}
                onChange={(e) => p.setRef2Phone(e.target.value)}
                placeholder="(###) ###-####"
                className={errors.ref2Phone ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.ref2Phone} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 9) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Additional details</h2>
          <StepIntro className="mt-3">
            These questions are standard for rental screening. Your answers are reviewed in context; answer honestly.
          </StepIntro>
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupancyCount" required>
            Number of occupants
          </Label>
          <Select
            id="occupancyCount"
            value={form.occupancyCount}
            onChange={(e) => patch({ occupancyCount: e.target.value })}
            className={errors.occupancyCount ? "border-red-400 ring-2 ring-red-100" : ""}
          >
            <option value="">Select</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </Select>
          <FieldError msg={errors.occupancyCount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pets" optional>
            Pets
          </Label>
          <Textarea id="pets" value={form.pets} onChange={(e) => patch({ pets: e.target.value })} placeholder="Type, breed, weight, or write “None”" rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expectedUtilitiesMonthly" optional>
            Expected monthly utilities (your estimate)
          </Label>
          <Input
            id="expectedUtilitiesMonthly"
            value={form.expectedUtilitiesMonthly}
            onChange={(e) => patch({ expectedUtilitiesMonthly: e.target.value })}
            placeholder="e.g. $120 or $95–140/mo (all-in electric, gas, internet…)"
          />
          <p className="text-xs text-slate-500">
            Optional. The listing may show a separate landlord estimate; this helps your manager understand your budget.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <Label required>Eviction history</Label>
          <YesNoPills
            value={form.evictionHistory}
            error={errors.evictionHistory}
            name="Eviction history"
            onChange={(v) => patch({ evictionHistory: v, evictionDetails: v === "no" ? "" : form.evictionDetails })}
          />
          {form.evictionHistory === "yes" ? (
            <div className="space-y-2">
              <Label htmlFor="evictionDetails">Brief details</Label>
              <Textarea
                id="evictionDetails"
                value={form.evictionDetails}
                onChange={(e) => patch({ evictionDetails: e.target.value })}
                rows={3}
                className={errors.evictionDetails ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.evictionDetails} />
            </div>
          ) : null}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <Label required>Bankruptcy history</Label>
          <YesNoPills
            value={form.bankruptcyHistory}
            error={errors.bankruptcyHistory}
            name="Bankruptcy history"
            onChange={(v) => patch({ bankruptcyHistory: v, bankruptcyDetails: v === "no" ? "" : form.bankruptcyDetails })}
          />
          {form.bankruptcyHistory === "yes" ? (
            <div className="space-y-2">
              <Label htmlFor="bankruptcyDetails">Brief details</Label>
              <Textarea
                id="bankruptcyDetails"
                value={form.bankruptcyDetails}
                onChange={(e) => patch({ bankruptcyDetails: e.target.value })}
                rows={3}
                className={errors.bankruptcyDetails ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.bankruptcyDetails} />
            </div>
          ) : null}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <Label required>Criminal history</Label>
          <YesNoPills
            value={form.criminalHistory}
            error={errors.criminalHistory}
            name="Criminal history"
            onChange={(v) => patch({ criminalHistory: v, criminalDetails: v === "no" ? "" : form.criminalDetails })}
          />
          {form.criminalHistory === "yes" ? (
            <div className="space-y-2">
              <Label htmlFor="criminalDetails">Brief details</Label>
              <Textarea
                id="criminalDetails"
                value={form.criminalDetails}
                onChange={(e) => patch({ criminalDetails: e.target.value })}
                rows={3}
                className={errors.criminalDetails ? "border-red-400 ring-2 ring-red-100" : ""}
              />
              <FieldError msg={errors.criminalDetails} />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalNotes" optional>
            Additional notes
          </Label>
          <Textarea id="additionalNotes" value={form.additionalNotes} onChange={(e) => patch({ additionalNotes: e.target.value })} rows={4} placeholder="Anything else we should know" />
        </div>
      </div>
    );
  }

  if (step === 10) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Consent and signature</h2>
          <StepIntro className="mt-3">Review the authorizations below. Your typed name carries the same effect as a handwritten signature.</StepIntro>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-sm leading-relaxed text-slate-700">
          <p>
            By submitting this application, you authorize the property manager to obtain consumer reports (including credit and
            criminal history) and to verify employment, income, and rental history. You understand that false or incomplete
            information may result in denial or termination of a lease.
          </p>
          <p className="mt-3 text-xs text-slate-500">This demo does not store or transmit your data to a server.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
            checked={form.consentCredit}
            onChange={(e) => patch({ consentCredit: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">I authorize a credit and background check.</span>
        </label>
        <FieldError msg={errors.consentCredit} />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
            checked={form.consentTruth}
            onChange={(e) => patch({ consentTruth: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">I confirm the information provided is true and complete.</span>
        </label>
        <FieldError msg={errors.consentTruth} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="digitalSignature" required>
              Digital signature (type your full legal name)
            </Label>
            <Input
              id="digitalSignature"
              value={form.digitalSignature}
              onChange={(e) => patch({ digitalSignature: e.target.value })}
              className={errors.digitalSignature ? "border-red-400 ring-2 ring-red-100" : ""}
            />
            <FieldError msg={errors.digitalSignature} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateSigned" required>
              Date signed
            </Label>
            <Input id="dateSigned" type="date" value={form.dateSigned} onChange={(e) => patch({ dateSigned: e.target.value })} className={errors.dateSigned ? "border-red-400 ring-2 ring-red-100" : ""} />
            <FieldError msg={errors.dateSigned} />
          </div>
        </div>
      </div>
    );
  }

  if (step === 11) {
    const prop = getPropertyById(form.propertyId);
    const roomLabel = (id: string) => {
      const r = getPropertyById(id);
      return r ? `${r.buildingName} · ${r.unitLabel}` : "";
    };
    const ReviewSection = ({
      title,
      stepTarget,
      children,
    }: {
      title: string;
      stepTarget: number;
      children: ReactNode;
    }) => (
      <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
          <button type="button" onClick={() => goToStep(stepTarget)} className="shrink-0 text-sm font-semibold text-primary hover:underline">
            Edit
          </button>
        </div>
        <dl className="mt-4 space-y-3 text-sm">{children}</dl>
      </section>
    );
    const Row = ({ k, v }: { k: string; v: ReactNode }) => (
      <div className="grid gap-1 border-b border-slate-100/80 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,38%)_1fr] sm:gap-4">
        <dt className="font-medium text-slate-500">{k}</dt>
        <dd className="text-slate-900">{v}</dd>
      </div>
    );
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Review</h2>
          <StepIntro className="mt-3">Confirm everything below, then continue to the application fee step.</StepIntro>
        </div>
        <div className="space-y-4">
          <ReviewSection title="Group application" stepTarget={1}>
            <Row k="Applying as group" v={form.applyingAsGroup === "yes" ? "Yes" : form.applyingAsGroup === "no" ? "No" : "—"} />
            {form.applyingAsGroup === "yes" ? (
              <>
                <Row k="Role" v={form.groupRole === "first" ? "First applicant" : form.groupRole === "joining" ? "Joining group" : "—"} />
                <Row k={form.groupRole === "first" ? "Group size" : "Group ID"} v={displayOrDash(form.groupRole === "first" ? form.groupSize : form.groupId)} />
              </>
            ) : null}
          </ReviewSection>
          <ReviewSection title="Co-signer" stepTarget={2}>
            <Row k="Co-signer planned" v={form.hasCosigner === "yes" ? "Yes" : form.hasCosigner === "no" ? "No" : "—"} />
          </ReviewSection>
          <ReviewSection title="Property information" stepTarget={3}>
            <Row k="Property" v={displayOrDash(prop?.title)} />
            <Row k="1st choice room" v={displayOrDash(roomLabel(form.roomChoice1))} />
            <Row k="2nd choice room" v={displayOrDash(roomLabel(form.roomChoice2))} />
            <Row k="3rd choice room" v={displayOrDash(roomLabel(form.roomChoice3))} />
            <Row k="Lease term" v={displayOrDash(form.leaseTerm)} />
            <Row k="Lease start" v={displayOrDash(form.leaseStart)} />
            <Row k="Lease end" v={displayOrDash(form.leaseEnd)} />
          </ReviewSection>
          {prop?.listingSubmission?.v === 1 ? (
            <ReviewSection title="Housing charges (this listing)" stepTarget={3}>
              <Row k="Application fee" v={displayOrDash(prop.listingSubmission.applicationFee)} />
              <Row k="Security deposit" v={displayOrDash(prop.listingSubmission.securityDeposit)} />
              <Row k="Move-in fee" v={displayOrDash(prop.listingSubmission.moveInFee)} />
              <Row k="Payment due at signing" v={displayOrDash(paymentAtSigningPriceLabel(prop.listingSubmission))} />
              <Row k="Utilities (estimate, by room)" v={displayOrDash(utilitiesListingEstimateLabel(prop.listingSubmission))} />
              {form.expectedUtilitiesMonthly.trim() ? (
                <Row k="Your expected utilities / mo" v={displayOrDash(form.expectedUtilitiesMonthly)} />
              ) : null}
            </ReviewSection>
          ) : (
            <ReviewSection title="Housing charges" stepTarget={3}>
              <Row
                k="Listing fees"
                v="This property has not published detailed fee lines yet. Confirm dollar amounts with the property manager before you pay or sign."
              />
              {form.expectedUtilitiesMonthly.trim() ? (
                <Row k="Your expected utilities / mo" v={displayOrDash(form.expectedUtilitiesMonthly)} />
              ) : null}
            </ReviewSection>
          )}
          <ReviewSection title="Personal information" stepTarget={4}>
            <Row k="Legal name" v={displayOrDash(form.fullLegalName)} />
            <Row k="Date of birth" v={displayOrDash(form.dateOfBirth)} />
            <Row k="SSN" v={maskSsnReview(form.ssn)} />
            <Row k="ID number" v={displayOrDash(form.driversLicense)} />
            <Row k="Phone" v={displayOrDash(form.phone)} />
            <Row k="Email" v={displayOrDash(form.email)} />
          </ReviewSection>
          <ReviewSection title="Address history" stepTarget={5}>
            <Row
              k="Current address"
              v={displayOrDash(
                [form.currentStreet, [form.currentCity, form.currentState, form.currentZip].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", "),
              )}
            />
            <Row
              k="Landlord (current)"
              v={displayOrDash([form.currentLandlordName, form.currentLandlordPhone].filter(Boolean).join(" · "))}
            />
            <Row
              k="Move-in / move-out (current)"
              v={displayOrDash([form.currentMoveIn, form.currentMoveOut].filter(Boolean).join(" → "))}
            />
            <Row k="Reason for leaving (current)" v={displayOrDash(form.currentReasonLeaving)} />
            {form.noPreviousAddress ? (
              <Row k="Previous address" v="Not provided (none reported)" />
            ) : (
              <>
                <Row
                  k="Previous address"
                  v={displayOrDash(
                    [form.prevStreet, [form.prevCity, form.prevState, form.prevZip].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(", "),
                  )}
                />
                <Row
                  k="Landlord (previous)"
                  v={displayOrDash([form.prevLandlordName, form.prevLandlordPhone].filter(Boolean).join(" · "))}
                />
                <Row
                  k="Move-in / move-out (previous)"
                  v={displayOrDash([form.prevMoveIn, form.prevMoveOut].filter(Boolean).join(" → "))}
                />
                <Row k="Reason for leaving (previous)" v={displayOrDash(form.prevReasonLeaving)} />
              </>
            )}
          </ReviewSection>
          <ReviewSection title="Employment" stepTarget={7}>
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
          <ReviewSection title="References" stepTarget={8}>
            <Row k="Reference 1" v={displayOrDash(`${form.ref1Name} · ${form.ref1Relationship} · ${form.ref1Phone}`)} />
            <Row k="Reference 2" v={form.ref2Name.trim() ? displayOrDash(`${form.ref2Name} · ${form.ref2Relationship} · ${form.ref2Phone}`) : displayOrDash("")} />
          </ReviewSection>
          <ReviewSection title="Additional details" stepTarget={9}>
            <Row k="Occupants" v={displayOrDash(form.occupancyCount)} />
            <Row k="Pets" v={displayOrDash(form.pets)} />
            <Row k="Eviction" v={form.evictionHistory === "yes" ? `Yes — ${form.evictionDetails}` : form.evictionHistory === "no" ? "No" : "—"} />
            <Row k="Bankruptcy" v={form.bankruptcyHistory === "yes" ? `Yes — ${form.bankruptcyDetails}` : form.bankruptcyHistory === "no" ? "No" : "—"} />
            <Row k="Criminal history" v={form.criminalHistory === "yes" ? `Yes — ${form.criminalDetails}` : form.criminalHistory === "no" ? "No" : "—"} />
            <Row k="Notes" v={displayOrDash(form.additionalNotes)} />
          </ReviewSection>
          <ReviewSection title="Consent" stepTarget={10}>
            <Row k="Credit / background" v={form.consentCredit ? "Authorized" : "Not checked"} />
            <Row k="Accuracy confirmed" v={form.consentTruth ? "Yes" : "Not checked"} />
            <Row k="Signature" v={displayOrDash(form.digitalSignature)} />
            <Row k="Date signed" v={displayOrDash(form.dateSigned)} />
          </ReviewSection>
        </div>
        <p className="text-center text-xs text-slate-500">Next: application fee confirmation before final submit.</p>
      </div>
    );
  }

  if (step === 12) {
    const prop = form.propertyId ? getPropertyById(form.propertyId) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const appFeeLabel = sub?.applicationFee?.trim() || (applicationFeeGate.needsFee ? applicationFeeGate.displayLabel : "—");
    const sdLabel = sub?.securityDeposit?.trim() || "—";
    const signingLabel = sub ? paymentAtSigningPriceLabel(sub) : "—";
    const utilLabel = sub ? utilitiesListingEstimateLabel(sub) : "—";
    const zelleOn = Boolean(sub?.zellePaymentsEnabled && sub.zelleContact?.trim());
    const gate = applicationFeeGate;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Application fee & housing charges</h2>
          <StepIntro className="mt-2">
            Dollar amounts shown here come from this listing&apos;s published manager settings (not invented by the application). If a line
            shows “—”, the property has not published that fee yet — confirm with the manager. When an application fee applies, you must pay it
            (your manager marks it received in this demo) or enter promo code <span className="font-mono font-semibold">FEEWAIVE</span> before
            you can submit and receive an Application ID. Submitting also creates other move-in lines in your resident portal; there is no live
            card charge here.
          </StepIntro>
        </div>
        {gate.needsFee ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              gate.waived
                ? "border-violet-200 bg-violet-50/70 text-violet-950"
                : gate.paid
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                  : "border-amber-200 bg-amber-50/70 text-amber-950"
            }`}
          >
            {gate.waived ? (
              <p>
                <span className="font-semibold">Fee waived.</span> You applied promo {APPLICATION_FEE_PROMO_WAIVE_CODE}. You can submit the
                application.
              </p>
            ) : gate.paid ? (
              <p>
                <span className="font-semibold">Application fee paid.</span> Your manager marked this fee received. You can submit the
                application.
              </p>
            ) : (
              <p>
                <span className="font-semibold">Application fee required.</span> Pay the amount below (e.g. via Zelle if shown), then ask your
                manager to mark the fee paid in Payments, or use promo {APPLICATION_FEE_PROMO_WAIVE_CODE} to waive it in this demo.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            This listing does not publish a positive application fee amount, so no fee payment is required before submit.
          </div>
        )}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-5 sm:p-6">
          <p className="text-3xl font-bold tabular-nums text-slate-900">{appFeeLabel}</p>
          <p className="mt-1 text-sm text-slate-600">Non-refundable application fee (per this listing).</p>
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Also recorded for move-in (pending until paid)</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
              <li>Security deposit: {sdLabel}</li>
              {sub?.moveInFee?.trim() ? <li>Move-in fee: {sub.moveInFee.trim()}</li> : null}
              <li>Payment due at signing: {signingLabel}</li>
              {utilLabel.trim() && utilLabel !== "—" ? <li>Utilities (estimate, by room): {utilLabel}</li> : null}
              {form.expectedUtilitiesMonthly.trim() ? (
                <li>Your expected utilities / mo (from application): {form.expectedUtilitiesMonthly.trim()}</li>
              ) : null}
            </ul>
          </div>
          {zelleOn ? (
            <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
              <p className="font-semibold">Zelle payment</p>
              <p className="mt-1">
                Send to <span className="font-mono font-semibold">{sub!.zelleContact!.trim()}</span>. Include your name and unit in the memo.
                Your manager will mark the charge paid when funds are received.
              </p>
            </div>
          ) : null}
          {gate.needsFee ? (
            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <Label htmlFor="applicationFeePromoCode" optional>
                Promo code (waive application fee)
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Input
                  id="applicationFeePromoCode"
                  className="sm:flex-1"
                  value={form.applicationFeePromoCode}
                  onChange={(e) => {
                    mergeErrors({ applicationFeePromoCode: "" });
                    patch({ applicationFeePromoCode: e.target.value });
                  }}
                  placeholder="FEEWAIVE"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] shrink-0 sm:min-w-[120px]"
                  onClick={() => {
                    const code = form.applicationFeePromoCode.trim().toUpperCase();
                    if (code !== APPLICATION_FEE_PROMO_WAIVE_CODE) {
                      mergeErrors({
                        applicationFeePromoCode: `Invalid code. Enter ${APPLICATION_FEE_PROMO_WAIVE_CODE} to waive the application fee in this demo.`,
                      });
                      return;
                    }
                    if (form.propertyId.trim()) {
                      removePendingApplicationFeeCharge(form.email, form.propertyId.trim());
                    }
                    mergeErrors({ applicationFeePromoCode: "" });
                    patch({ applicationFeeWaivedByPromo: true, applicationFeePromoCode: "" });
                  }}
                >
                  Apply code
                </Button>
              </div>
              <FieldError msg={errors.applicationFeePromoCode} />
            </div>
          ) : null}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
              checked={form.applicationFeeAcknowledged}
              onChange={(e) => patch({ applicationFeeAcknowledged: e.target.checked })}
            />
            <span className="text-sm font-medium leading-snug text-slate-800">
              I understand the application fee is non-refundable and agree to these housing charge amounts as stated for this listing.
            </span>
          </label>
          <FieldError msg={errors.applicationFeeAcknowledged} />
        </div>
      </div>
    );
  }

  return null;
}

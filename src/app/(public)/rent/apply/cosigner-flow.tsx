"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import {
  validateDateRequired,
  validateEmail,
  validateFullName,
  validateMoney,
  validatePhone10,
  validateRequired,
  validateSsn,
  validateStateAbbrev,
  validateZip,
} from "./apply-validation";

const COSIGNER_STEPS = 5;

type CosignerFields = {
  signerAppId: string;
  signerFullName: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  dlNumber: string;
  ssn: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notEmployed: boolean;
  employerName: string;
  employerAddress: string;
  supervisorName: string;
  supervisorPhone: string;
  jobTitle: string;
  monthlyIncome: string;
  annualIncome: string;
  employmentStart: string;
  otherIncome: string;
  bankruptcy: string;
  criminal: string;
  consentCredit: boolean;
  signature: string;
  dateSigned: string;
  notes: string;
};

function emptyCosigner(): CosignerFields {
  return {
    signerAppId: "",
    signerFullName: "",
    fullName: "",
    email: "",
    phone: "",
    dob: "",
    dlNumber: "",
    ssn: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    notEmployed: false,
    employerName: "",
    employerAddress: "",
    supervisorName: "",
    supervisorPhone: "",
    jobTitle: "",
    monthlyIncome: "",
    annualIncome: "",
    employmentStart: "",
    otherIncome: "",
    bankruptcy: "",
    criminal: "",
    consentCredit: false,
    signature: "",
    dateSigned: "",
    notes: "",
  };
}

function patchField(setF: Dispatch<SetStateAction<CosignerFields>>, key: keyof CosignerFields, value: string | boolean) {
  setF((prev) => ({ ...prev, [key]: value } as CosignerFields));
}

export function CosignerApplyFlow({
  onBack,
  showToast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState<CosignerFields>(emptyCosigner);

  const progress = useMemo(() => Math.round((step / COSIGNER_STEPS) * 100), [step]);

  const stepTitle = (() => {
    if (step === 1) return "Link to Signer";
    if (step === 2) return "Co-Signer Information";
    if (step === 3) return "Employment & Income";
    if (step === 4) return "Financial Background & Legal";
    return "Signature";
  })();

  const validateStep1 = (): boolean => {
    const id = f.signerAppId.trim();
    const name = f.signerFullName.trim();
    if (!id && !name) {
      showToast("Enter a Signer Application ID and/or the signer’s full name.");
      return false;
    }
    if (name) {
      const r = validateFullName(name);
      if (!r.ok) {
        showToast(r.message);
        return false;
      }
    }
    if (id && id.length < 4) {
      showToast("Signer Application ID looks too short.");
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const checks: Array<{ ok: boolean; message: string }> = [];
    const n = validateFullName(f.fullName);
    checks.push(n.ok ? { ok: true, message: "" } : { ok: false, message: n.message });
    const e = validateEmail(f.email);
    checks.push(e.ok ? { ok: true, message: "" } : { ok: false, message: e.message });
    const ph = validatePhone10(f.phone);
    checks.push(ph.ok ? { ok: true, message: "" } : { ok: false, message: ph.message });
    checks.push(validateDateRequired(f.dob, "Date of birth").ok ? { ok: true, message: "" } : { ok: false, message: "Date of birth is required." });
    checks.push(validateRequired(f.dlNumber, "Driver's license / ID number").ok ? { ok: true, message: "" } : { ok: false, message: "Driver's license or ID number is required." });
    const ssn = validateSsn(f.ssn);
    checks.push(ssn.ok ? { ok: true, message: "" } : { ok: false, message: ssn.message });
    checks.push(validateRequired(f.address, "Current address").ok ? { ok: true, message: "" } : { ok: false, message: "Current address is required." });
    checks.push(validateRequired(f.city, "City").ok ? { ok: true, message: "" } : { ok: false, message: "City is required." });
    const st = validateStateAbbrev(f.state);
    checks.push(st.ok ? { ok: true, message: "" } : { ok: false, message: st.message });
    const z = validateZip(f.zip);
    checks.push(z.ok ? { ok: true, message: "" } : { ok: false, message: z.message });
    return run(checks);
  };

  const validateStep3 = (): boolean => {
    if (f.notEmployed) {
      const o = validateMoney(f.otherIncome, "Other / non-employment income");
      return run([o.ok ? { ok: true, message: "" } : { ok: false, message: o.message }]);
    }
    const checks: Array<{ ok: boolean; message: string }> = [];
    checks.push(validateRequired(f.employerName, "Employer name").ok ? { ok: true, message: "" } : { ok: false, message: "Employer name is required." });
    checks.push(validateRequired(f.employerAddress, "Employer address").ok ? { ok: true, message: "" } : { ok: false, message: "Employer address is required." });
    checks.push(validateRequired(f.supervisorName, "Supervisor name").ok ? { ok: true, message: "" } : { ok: false, message: "Supervisor name is required." });
    checks.push(validateRequired(f.jobTitle, "Job title").ok ? { ok: true, message: "" } : { ok: false, message: "Job title is required." });
    checks.push(validateMoney(f.monthlyIncome, "Monthly income").ok ? { ok: true, message: "" } : { ok: false, message: "Monthly income is required and must be a number." });
    checks.push(validateMoney(f.annualIncome, "Annual income").ok ? { ok: true, message: "" } : { ok: false, message: "Annual income is required and must be a number." });
    checks.push(
      validateDateRequired(f.employmentStart, "Employment start date").ok
        ? { ok: true, message: "" }
        : { ok: false, message: "Employment start date is required." },
    );
    if (f.supervisorPhone.trim()) {
      const sp = validatePhone10(f.supervisorPhone);
      checks.push(sp.ok ? { ok: true, message: "" } : { ok: false, message: sp.message });
    }
    return run(checks);
  };

  const validateStep4 = (): boolean => {
    if (!f.bankruptcy) {
      showToast("Select a bankruptcy history option.");
      return false;
    }
    if (!f.criminal) {
      showToast("Select a criminal convictions option.");
      return false;
    }
    if (!f.consentCredit) {
      showToast("Consent for credit and background check is required.");
      return false;
    }
    return true;
  };

  const validateStep5 = (): boolean => {
    if (!f.signature.trim()) {
      showToast("Co-signer signature is required.");
      return false;
    }
    const d = validateDateRequired(f.dateSigned, "Date signed");
    if (!d.ok) {
      showToast("Date signed is required.");
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 4 && !validateStep4()) return;
    if (step === 5) {
      if (!validateStep5()) return;
      showToast("Co-signer application submitted (demo).");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step <= 1) onBack();
    else setStep((s) => s - 1);
  };

  const inputClass = "mt-1.5";

  return (
    <>
      <p className="mt-6 text-center text-xs font-semibold uppercase tracking-wide text-muted sm:text-left">Rent with Axis</p>
      <p className="mt-1 text-center text-sm text-muted sm:text-left">
        Step {step} of {COSIGNER_STEPS} — {stepTitle}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <button type="button" className="text-xs font-semibold text-primary" onClick={() => showToast("Change type: coming soon")}>
          Change type
        </button>
      </div>

      <Card className="mt-8 p-6">
        {step === 1 ? (
          <>
            <CardHeader
              title="Link This Co-Signer To A Signer Application"
              subtitle="Provide the signer’s application ID, their full name, or both."
            />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Signer Application ID" hint="Recommended if you have their Application ID.">
                <Input
                  value={f.signerAppId}
                  onChange={(e) => applyField(setF, "signerAppId", e.target.value)}
                  placeholder="APP-recXXXXXXXXXXXXXXXXX"
                  className={inputClass}
                />
              </Field>
              <Field label="Signer Full Name" hint="Use this when you do not have the Application ID.">
                <Input
                  value={f.signerFullName}
                  onChange={(e) => applyField(setF, "signerFullName", e.target.value)}
                  placeholder="First Last"
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <CardHeader title="Co-Signer Information" subtitle="All fields marked with * are required." />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" hint="First and last name required.">
                <Input value={f.fullName} onChange={(e) => applyField(setF, "fullName", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Email *">
                <Input type="email" value={f.email} onChange={(e) => applyField(setF, "email", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Phone number *" hint="10 digits">
                <Input type="tel" value={f.phone} onChange={(e) => applyField(setF, "phone", e.target.value)} placeholder="(206) 555-0100" className={inputClass} />
              </Field>
              <Field label="Date of birth *">
                <Input type="date" value={f.dob} onChange={(e) => applyField(setF, "dob", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Driver's License / ID # *" hint="Enter your license or ID number.">
                <Input value={f.dlNumber} onChange={(e) => applyField(setF, "dlNumber", e.target.value)} placeholder="License or ID number" className={inputClass} />
              </Field>
              <Field label="Social Security # *" hint="9 digits — ###-##-####">
                <Input value={f.ssn} onChange={(e) => applyField(setF, "ssn", e.target.value)} placeholder="123-45-6789" className={inputClass} />
              </Field>
              <Field label="Current address *" className="sm:col-span-2">
                <Input value={f.address} onChange={(e) => applyField(setF, "address", e.target.value)} placeholder="123 Main St" className={inputClass} />
              </Field>
              <Field label="City *">
                <Input value={f.city} onChange={(e) => applyField(setF, "city", e.target.value)} placeholder="Seattle" className={inputClass} />
              </Field>
              <Field label="State *" hint="Two letters, e.g. WA, CA">
                <Input value={f.state} onChange={(e) => applyField(setF, "state", e.target.value.toUpperCase())} placeholder="WA" maxLength={2} className={inputClass} />
              </Field>
              <Field label="ZIP *">
                <Input value={f.zip} onChange={(e) => applyField(setF, "zip", e.target.value)} placeholder="98105" className={inputClass} />
              </Field>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <CardHeader title="Employment & Income" />
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={f.notEmployed}
                onChange={(e) => applyField(setF, "notEmployed", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary"
              />
              I am not currently employed
            </label>

            {f.notEmployed ? (
              <div className="mt-6">
                <Field label="Other / Non-Employment Income ($)" hint="e.g. rental income, investments, child support, disability">
                  <Input value={f.otherIncome} onChange={(e) => applyField(setF, "otherIncome", e.target.value)} placeholder="0" className={inputClass} />
                </Field>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Employer name *">
                    <Input value={f.employerName} onChange={(e) => applyField(setF, "employerName", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Employer address *">
                    <Input value={f.employerAddress} onChange={(e) => applyField(setF, "employerAddress", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Supervisor name *">
                    <Input value={f.supervisorName} onChange={(e) => applyField(setF, "supervisorName", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Supervisor phone">
                    <Input value={f.supervisorPhone} onChange={(e) => applyField(setF, "supervisorPhone", e.target.value)} placeholder="(206) 555-0100" className={inputClass} />
                  </Field>
                  <Field label="Job title *">
                    <Input value={f.jobTitle} onChange={(e) => applyField(setF, "jobTitle", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Monthly income ($) *">
                    <Input value={f.monthlyIncome} onChange={(e) => applyField(setF, "monthlyIncome", e.target.value)} placeholder="0" className={inputClass} />
                  </Field>
                  <Field label="Annual income ($) *">
                    <Input value={f.annualIncome} onChange={(e) => applyField(setF, "annualIncome", e.target.value)} placeholder="0" className={inputClass} />
                  </Field>
                  <Field label="Employment start date *">
                    <Input type="date" value={f.employmentStart} onChange={(e) => applyField(setF, "employmentStart", e.target.value)} className={inputClass} />
                  </Field>
                </div>
                <Field label="Other / Non-Employment Income ($)" hint="Optional — e.g. rental income, investments">
                  <Input value={f.otherIncome} onChange={(e) => applyField(setF, "otherIncome", e.target.value)} placeholder="0" className={inputClass} />
                </Field>
              </div>
            )}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <CardHeader title="Financial Background / Legal" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Bankruptcy history *">
                <select
                  value={f.bankruptcy}
                  onChange={(e) => applyField(setF, "bankruptcy", e.target.value)}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary`}
                >
                  <option value="">Select…</option>
                  <option value="never">Never filed</option>
                  <option value="past_discharged">Past bankruptcy (discharged)</option>
                  <option value="current">Current / active</option>
                </select>
              </Field>
              <Field label="Criminal convictions *">
                <select
                  value={f.criminal}
                  onChange={(e) => applyField(setF, "criminal", e.target.value)}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary`}
                >
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-800">Consent for Credit and Background Check *</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={f.consentCredit}
                  onChange={(e) => applyField(setF, "consentCredit", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
                />
                I consent to a credit and background check.
              </label>
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <CardHeader title="Signature" />
            <Field label="Co-Signer Signature *">
              <Input value={f.signature} onChange={(e) => applyField(setF, "signature", e.target.value)} placeholder="Type your full legal name" className={inputClass} />
            </Field>
            <Field label="Date signed *">
              <Input type="date" value={f.dateSigned} onChange={(e) => applyField(setF, "dateSigned", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Additional notes" className="mt-4">
              <Textarea value={f.notes} onChange={(e) => applyField(setF, "notes", e.target.value)} placeholder="Optional context for our team" className={inputClass} />
            </Field>
          </>
        ) : null}
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" className="sm:w-auto" onClick={handleBack}>
          Back
        </Button>
        <Button type="button" className="sm:min-w-[200px]" onClick={handleContinue}>
          {step === 5 ? "Submit co-signer form" : "Continue"}
        </Button>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-slate-600">
        {label}
        {label.includes("*") ? null : null}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
      {children}
    </div>
  );
}

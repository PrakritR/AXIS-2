"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearCosignerDraft, loadCosignerDraft, saveCosignerDraft } from "@/lib/rental-application/drafts";
import { todayISO } from "@/lib/rental-application/state";
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
import { ApplyFieldRow } from "./apply-field-row";

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
    dateSigned: todayISO(),
  };
}

function patchField(setF: Dispatch<SetStateAction<CosignerFields>>, key: keyof CosignerFields, value: string | boolean) {
  setF((prev) => ({ ...prev, [key]: value } as CosignerFields));
}

const errRing = "border-red-500 ring-2 ring-red-100";

export function CosignerApplyFlow({
  onBack,
  showToast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState<CosignerFields>(emptyCosigner);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    const draft = loadCosignerDraft<CosignerFields>();
    if (draft) {
      setF((current) => ({ ...current, ...draft }));
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    saveCosignerDraft(f);
  }, [draftReady, f]);

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const progress = useMemo(() => Math.round((step / COSIGNER_STEPS) * 100), [step]);

  const stepTitle = (() => {
    if (step === 1) return "Link to Signer";
    if (step === 2) return "Co-Signer Information";
    if (step === 3) return "Employment & Income";
    if (step === 4) return "Financial Background & Legal";
    return "Signature";
  })();

  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    const id = f.signerAppId.trim();
    const name = f.signerFullName.trim();
    if (!id && !name) {
      const msg = "Enter an Axis ID or the signer’s full name.";
      errs.signerAppId = msg;
      errs.signerFullName = msg;
    } else {
      if (name) {
        const r = validateFullName(name);
        if (!r.ok) errs.signerFullName = r.message;
      }
      if (id && id.length < 4) errs.signerAppId = "Axis ID looks too short.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errs: Record<string, string> = {};
    const n = validateFullName(f.fullName);
    if (!n.ok) errs.fullName = n.message;
    const e = validateEmail(f.email);
    if (!e.ok) errs.email = e.message;
    const ph = validatePhone10(f.phone);
    if (!ph.ok) errs.phone = ph.message;
    const dob = validateDateRequired(f.dob, "Date of birth");
    if (!dob.ok) errs.dob = dob.message;
    const dl = validateRequired(f.dlNumber, "Driver's license / ID number");
    if (!dl.ok) errs.dlNumber = dl.message;
    const ssn = validateSsn(f.ssn);
    if (!ssn.ok) errs.ssn = ssn.message;
    const ad = validateRequired(f.address, "Current address");
    if (!ad.ok) errs.address = ad.message;
    const ci = validateRequired(f.city, "City");
    if (!ci.ok) errs.city = ci.message;
    const st = validateStateAbbrev(f.state);
    if (!st.ok) errs.state = st.message;
    const z = validateZip(f.zip);
    if (!z.ok) errs.zip = z.message;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep3 = (): boolean => {
    const errs: Record<string, string> = {};
    if (f.notEmployed) {
      const o = validateMoney(f.otherIncome, "Other / non-employment income");
      if (!o.ok) errs.otherIncome = o.message;
      setFieldErrors(errs);
      return Object.keys(errs).length === 0;
    }
    const en = validateRequired(f.employerName, "Employer name");
    if (!en.ok) errs.employerName = en.message;
    const ea = validateRequired(f.employerAddress, "Employer address");
    if (!ea.ok) errs.employerAddress = ea.message;
    const sn = validateRequired(f.supervisorName, "Supervisor name");
    if (!sn.ok) errs.supervisorName = sn.message;
    const jt = validateRequired(f.jobTitle, "Job title");
    if (!jt.ok) errs.jobTitle = jt.message;
    const mi = validateMoney(f.monthlyIncome, "Monthly income");
    if (!mi.ok) errs.monthlyIncome = mi.message;
    const ai = validateMoney(f.annualIncome, "Annual income");
    if (!ai.ok) errs.annualIncome = ai.message;
    const es = validateDateRequired(f.employmentStart, "Employment start date");
    if (!es.ok) errs.employmentStart = es.message;
    if (f.supervisorPhone.trim()) {
      const sp = validatePhone10(f.supervisorPhone);
      if (!sp.ok) errs.supervisorPhone = sp.message;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep4 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!f.bankruptcy) errs.bankruptcy = "Select a bankruptcy history option.";
    if (!f.criminal) errs.criminal = "Select a criminal convictions option.";
    if (!f.consentCredit) errs.consentCredit = "Consent for credit and background check is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep5 = (): boolean => {
    const errs: Record<string, string> = {};
    const sig = validateFullName(f.signature);
    if (!sig.ok) {
      errs.signature = sig.message === "Name is required." ? "Co-signer signature is required." : sig.message;
    }
    const d = validateDateRequired(f.dateSigned, "Date signed");
    if (!d.ok) errs.dateSigned = d.message;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleContinue = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 4 && !validateStep4()) return;
    if (step === 5) {
      if (!validateStep5()) return;
      setFieldErrors({});
      clearCosignerDraft();
      setF(emptyCosigner());
      setStep(1);
      showToast("Co-signer application submitted.");
      return;
    }
    setFieldErrors({});
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setFieldErrors({});
    if (step <= 1) onBack();
    else setStep((s) => s - 1);
  };

  const inputClass = "";
  const err = (key: keyof CosignerFields | string) => (fieldErrors[key] ? errRing : "");

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
              subtitle="Provide the signer’s Axis ID, their full name, or both."
            />
            <div className="mt-6 divide-y divide-slate-100">
              <Field label="Signer Axis ID" optional hint="Recommended if you have their Axis ID." error={fieldErrors.signerAppId}>
                <Input
                  value={f.signerAppId}
                  onChange={(e) => {
                    patchField(setF, "signerAppId", e.target.value);
                    clearError("signerAppId");
                  }}
                  placeholder="AXIS-XXXXXXXX"
                  className={`${inputClass} ${err("signerAppId")}`}
                />
              </Field>
              <Field label="Signer Full Name" optional hint="Use this when you do not have the Axis ID." error={fieldErrors.signerFullName}>
                <Input
                  value={f.signerFullName}
                  onChange={(e) => {
                    patchField(setF, "signerFullName", e.target.value);
                    clearError("signerFullName");
                  }}
                  placeholder="First Last"
                  className={`${inputClass} ${err("signerFullName")}`}
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <CardHeader title="Co-Signer Information" subtitle="All fields marked with * are required." />
            <div className="mt-6 divide-y divide-slate-100">
              <Field label="Full name" hint="First and last name required." error={fieldErrors.fullName}>
                <Input
                  value={f.fullName}
                  onChange={(e) => {
                    patchField(setF, "fullName", e.target.value);
                    clearError("fullName");
                  }}
                  className={`${inputClass} ${err("fullName")}`}
                />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <Input
                  type="email"
                  value={f.email}
                  onChange={(e) => {
                    patchField(setF, "email", e.target.value);
                    clearError("email");
                  }}
                  className={`${inputClass} ${err("email")}`}
                />
              </Field>
              <Field label="Phone number" hint="10 digits" error={fieldErrors.phone}>
                <Input
                  type="tel"
                  value={f.phone}
                  onChange={(e) => {
                    patchField(setF, "phone", e.target.value);
                    clearError("phone");
                  }}
                  placeholder="(206) 555-0100"
                  className={`${inputClass} ${err("phone")}`}
                />
              </Field>
              <Field label="Date of birth" error={fieldErrors.dob}>
                <Input
                  type="date"
                  value={f.dob}
                  onChange={(e) => {
                    patchField(setF, "dob", e.target.value);
                    clearError("dob");
                  }}
                  className={`${inputClass} ${err("dob")}`}
                />
              </Field>
              <Field label="Driver's License / ID #" hint="Enter your license or ID number." error={fieldErrors.dlNumber}>
                <Input
                  value={f.dlNumber}
                  onChange={(e) => {
                    patchField(setF, "dlNumber", e.target.value);
                    clearError("dlNumber");
                  }}
                  placeholder="License or ID number"
                  className={`${inputClass} ${err("dlNumber")}`}
                />
              </Field>
              <Field label="Social Security #" hint="9 digits — ###-##-####" error={fieldErrors.ssn}>
                <Input
                  value={f.ssn}
                  onChange={(e) => {
                    patchField(setF, "ssn", e.target.value);
                    clearError("ssn");
                  }}
                  placeholder="123-45-6789"
                  className={`${inputClass} ${err("ssn")}`}
                />
              </Field>
              <Field label="Current address" className="sm:col-span-2" error={fieldErrors.address}>
                <Input
                  value={f.address}
                  onChange={(e) => {
                    patchField(setF, "address", e.target.value);
                    clearError("address");
                  }}
                  placeholder="123 Main St"
                  className={`${inputClass} ${err("address")}`}
                />
              </Field>
              <Field label="City" error={fieldErrors.city}>
                <Input
                  value={f.city}
                  onChange={(e) => {
                    patchField(setF, "city", e.target.value);
                    clearError("city");
                  }}
                  placeholder="Your city"
                  className={`${inputClass} ${err("city")}`}
                />
              </Field>
              <Field label="State" hint="Two letters, e.g. WA, CA" error={fieldErrors.state}>
                <Input
                  value={f.state}
                  onChange={(e) => {
                    patchField(setF, "state", e.target.value.toUpperCase());
                    clearError("state");
                  }}
                  placeholder="WA"
                  maxLength={2}
                  className={`${inputClass} ${err("state")}`}
                />
              </Field>
              <Field label="ZIP" error={fieldErrors.zip}>
                <Input
                  value={f.zip}
                  onChange={(e) => {
                    patchField(setF, "zip", e.target.value);
                    clearError("zip");
                  }}
                  placeholder="98105"
                  className={`${inputClass} ${err("zip")}`}
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <CardHeader title="Employment & Income" />
            <div className="mt-6 divide-y divide-slate-100">
              <ApplyFieldRow label="Not employed" optional hint="Check if you are not currently working.">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={f.notEmployed}
                    onChange={(e) => {
                      patchField(setF, "notEmployed", e.target.checked);
                      setFieldErrors({});
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  I am not currently employed
                </label>
              </ApplyFieldRow>

            {f.notEmployed ? (
                <Field
                  label="Other / Non-Employment Income ($)"
                  hint="e.g. rental income, investments, child support, disability"
                  error={fieldErrors.otherIncome}
                >
                  <Input
                    value={f.otherIncome}
                    onChange={(e) => {
                      patchField(setF, "otherIncome", e.target.value);
                      clearError("otherIncome");
                    }}
                    placeholder="0"
                    className={`${inputClass} ${err("otherIncome")}`}
                  />
                </Field>
            ) : (
              <>
                <Field label="Employer name" error={fieldErrors.employerName}>
                    <Input
                      value={f.employerName}
                      onChange={(e) => {
                        patchField(setF, "employerName", e.target.value);
                        clearError("employerName");
                      }}
                      className={`${inputClass} ${err("employerName")}`}
                    />
                  </Field>
                  <Field label="Employer address" error={fieldErrors.employerAddress}>
                    <Input
                      value={f.employerAddress}
                      onChange={(e) => {
                        patchField(setF, "employerAddress", e.target.value);
                        clearError("employerAddress");
                      }}
                      className={`${inputClass} ${err("employerAddress")}`}
                    />
                  </Field>
                  <Field label="Supervisor name" error={fieldErrors.supervisorName}>
                    <Input
                      value={f.supervisorName}
                      onChange={(e) => {
                        patchField(setF, "supervisorName", e.target.value);
                        clearError("supervisorName");
                      }}
                      className={`${inputClass} ${err("supervisorName")}`}
                    />
                  </Field>
                  <Field label="Supervisor phone" optional error={fieldErrors.supervisorPhone}>
                    <Input
                      value={f.supervisorPhone}
                      onChange={(e) => {
                        patchField(setF, "supervisorPhone", e.target.value);
                        clearError("supervisorPhone");
                      }}
                      placeholder="(206) 555-0100"
                      className={`${inputClass} ${err("supervisorPhone")}`}
                    />
                  </Field>
                  <Field label="Job title" error={fieldErrors.jobTitle}>
                    <Input
                      value={f.jobTitle}
                      onChange={(e) => {
                        patchField(setF, "jobTitle", e.target.value);
                        clearError("jobTitle");
                      }}
                      className={`${inputClass} ${err("jobTitle")}`}
                    />
                  </Field>
                  <Field label="Monthly income ($)" error={fieldErrors.monthlyIncome}>
                    <Input
                      value={f.monthlyIncome}
                      onChange={(e) => {
                        patchField(setF, "monthlyIncome", e.target.value);
                        clearError("monthlyIncome");
                      }}
                      placeholder="0"
                      className={`${inputClass} ${err("monthlyIncome")}`}
                    />
                  </Field>
                  <Field label="Annual income ($)" error={fieldErrors.annualIncome}>
                    <Input
                      value={f.annualIncome}
                      onChange={(e) => {
                        patchField(setF, "annualIncome", e.target.value);
                        clearError("annualIncome");
                      }}
                      placeholder="0"
                      className={`${inputClass} ${err("annualIncome")}`}
                    />
                  </Field>
                <Field label="Employment start date" error={fieldErrors.employmentStart}>
                  <Input
                    type="date"
                    value={f.employmentStart}
                    onChange={(e) => {
                      patchField(setF, "employmentStart", e.target.value);
                      clearError("employmentStart");
                    }}
                    className={`${inputClass} ${err("employmentStart")}`}
                  />
                </Field>
                <Field label="Other / Non-Employment Income ($)" optional hint="Optional — e.g. rental income, investments">
                  <Input
                    value={f.otherIncome}
                    onChange={(e) => patchField(setF, "otherIncome", e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                </Field>
              </>
            )}
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <CardHeader title="Financial Background / Legal" />
            <div className="mt-6 divide-y divide-slate-100">
              <Field label="Bankruptcy history" error={fieldErrors.bankruptcy}>
                <select
                  value={f.bankruptcy}
                  onChange={(e) => {
                    patchField(setF, "bankruptcy", e.target.value);
                    clearError("bankruptcy");
                  }}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary ${err("bankruptcy")}`}
                >
                  <option value="">Select…</option>
                  <option value="never">Never filed</option>
                  <option value="past_discharged">Past bankruptcy (discharged)</option>
                  <option value="current">Current / active</option>
                </select>
              </Field>
              <Field label="Criminal convictions" error={fieldErrors.criminal}>
                <select
                  value={f.criminal}
                  onChange={(e) => {
                    patchField(setF, "criminal", e.target.value);
                    clearError("criminal");
                  }}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary ${err("criminal")}`}
                >
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
            <div
              className={`mt-6 rounded-xl border p-4 ${
                fieldErrors.consentCredit
                  ? "border-red-500 bg-red-50/50 ring-2 ring-red-100"
                  : "border-slate-200 bg-slate-50/80"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800">
                Consent for Credit and Background Check
                <span className="font-semibold text-primary"> *</span>
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={f.consentCredit}
                  onChange={(e) => {
                    patchField(setF, "consentCredit", e.target.checked);
                    clearError("consentCredit");
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
                />
                I consent to a credit and background check.
              </label>
              {fieldErrors.consentCredit ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                  <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700">
                    !
                  </span>
                  {fieldErrors.consentCredit}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <CardHeader title="Signature" />
            <div className="mt-6 divide-y divide-slate-100">
              <Field label="Co-Signer Signature" error={fieldErrors.signature}>
                <Input
                  value={f.signature}
                  onChange={(e) => {
                    patchField(setF, "signature", e.target.value);
                    clearError("signature");
                  }}
                  placeholder="Type your full legal name"
                  className={`${inputClass} ${err("signature")}`}
                />
              </Field>
              <Field label="Date signed" error={fieldErrors.dateSigned}>
                <Input
                  type="date"
                  value={f.dateSigned}
                  onChange={(e) => {
                    patchField(setF, "dateSigned", e.target.value);
                    clearError("dateSigned");
                  }}
                  className={`${inputClass} ${err("dateSigned")}`}
                />
              </Field>
            </div>
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
  error,
  children,
  className = "",
  optional = false,
}: {
  label: string;
  hint?: string;
  /** Inline validation message shown under the control */
  error?: string;
  children: React.ReactNode;
  className?: string;
  /** When false, shows a blue asterisk like the signer application mockups */
  optional?: boolean;
}) {
  return (
    <ApplyFieldRow label={label} hint={hint} error={error} optional={optional} className={className}>
      {children}
    </ApplyFieldRow>
  );
}

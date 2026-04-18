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
    const n = validateFullName(f.fullName);
    if (!n.ok) {
      showToast(n.message);
      return false;
    }
    const e = validateEmail(f.email);
    if (!e.ok) {
      showToast(e.message);
      return false;
    }
    const ph = validatePhone10(f.phone);
    if (!ph.ok) {
      showToast(ph.message);
      return false;
    }
    const dob = validateDateRequired(f.dob, "Date of birth");
    if (!dob.ok) {
      showToast(dob.message);
      return false;
    }
    const dl = validateRequired(f.dlNumber, "Driver's license / ID number");
    if (!dl.ok) {
      showToast(dl.message);
      return false;
    }
    const ssn = validateSsn(f.ssn);
    if (!ssn.ok) {
      showToast(ssn.message);
      return false;
    }
    const ad = validateRequired(f.address, "Current address");
    if (!ad.ok) {
      showToast(ad.message);
      return false;
    }
    const ci = validateRequired(f.city, "City");
    if (!ci.ok) {
      showToast(ci.message);
      return false;
    }
    const st = validateStateAbbrev(f.state);
    if (!st.ok) {
      showToast(st.message);
      return false;
    }
    const z = validateZip(f.zip);
    if (!z.ok) {
      showToast(z.message);
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (f.notEmployed) {
      const o = validateMoney(f.otherIncome, "Other / non-employment income");
      if (!o.ok) {
        showToast(o.message);
        return false;
      }
      return true;
    }
    const en = validateRequired(f.employerName, "Employer name");
    if (!en.ok) {
      showToast(en.message);
      return false;
    }
    const ea = validateRequired(f.employerAddress, "Employer address");
    if (!ea.ok) {
      showToast(ea.message);
      return false;
    }
    const sn = validateRequired(f.supervisorName, "Supervisor name");
    if (!sn.ok) {
      showToast(sn.message);
      return false;
    }
    const jt = validateRequired(f.jobTitle, "Job title");
    if (!jt.ok) {
      showToast(jt.message);
      return false;
    }
    const mi = validateMoney(f.monthlyIncome, "Monthly income");
    if (!mi.ok) {
      showToast(mi.message);
      return false;
    }
    const ai = validateMoney(f.annualIncome, "Annual income");
    if (!ai.ok) {
      showToast(ai.message);
      return false;
    }
    const es = validateDateRequired(f.employmentStart, "Employment start date");
    if (!es.ok) {
      showToast(es.message);
      return false;
    }
    if (f.supervisorPhone.trim()) {
      const sp = validatePhone10(f.supervisorPhone);
      if (!sp.ok) {
        showToast(sp.message);
        return false;
      }
    }
    return true;
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
    const sig = validateFullName(f.signature);
    if (!sig.ok) {
      showToast(sig.message === "Name is required." ? "Co-signer signature is required." : sig.message);
      return false;
    }
    const d = validateDateRequired(f.dateSigned, "Date signed");
    if (!d.ok) {
      showToast(d.message);
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
              <Field label="Signer Application ID" optional hint="Recommended if you have their Application ID.">
                <Input
                  value={f.signerAppId}
                  onChange={(e) => patchField(setF, "signerAppId", e.target.value)}
                  placeholder="APP-recXXXXXXXXXXXXXXXXX"
                  className={inputClass}
                />
              </Field>
              <Field label="Signer Full Name" optional hint="Use this when you do not have the Application ID.">
                <Input
                  value={f.signerFullName}
                  onChange={(e) => patchField(setF, "signerFullName", e.target.value)}
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
              <Field label="Full name" hint="First and last name required.">
                <Input value={f.fullName} onChange={(e) => patchField(setF, "fullName", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Email">
                <Input type="email" value={f.email} onChange={(e) => patchField(setF, "email", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Phone number" hint="10 digits">
                <Input type="tel" value={f.phone} onChange={(e) => patchField(setF, "phone", e.target.value)} placeholder="(206) 555-0100" className={inputClass} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" value={f.dob} onChange={(e) => patchField(setF, "dob", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Driver's License / ID #" hint="Enter your license or ID number.">
                <Input value={f.dlNumber} onChange={(e) => patchField(setF, "dlNumber", e.target.value)} placeholder="License or ID number" className={inputClass} />
              </Field>
              <Field label="Social Security #" hint="9 digits — ###-##-####">
                <Input value={f.ssn} onChange={(e) => patchField(setF, "ssn", e.target.value)} placeholder="123-45-6789" className={inputClass} />
              </Field>
              <Field label="Current address" className="sm:col-span-2">
                <Input value={f.address} onChange={(e) => patchField(setF, "address", e.target.value)} placeholder="123 Main St" className={inputClass} />
              </Field>
              <Field label="City">
                <Input value={f.city} onChange={(e) => patchField(setF, "city", e.target.value)} placeholder="Seattle" className={inputClass} />
              </Field>
              <Field label="State" hint="Two letters, e.g. WA, CA">
                <Input value={f.state} onChange={(e) => patchField(setF, "state", e.target.value.toUpperCase())} placeholder="WA" maxLength={2} className={inputClass} />
              </Field>
              <Field label="ZIP">
                <Input value={f.zip} onChange={(e) => patchField(setF, "zip", e.target.value)} placeholder="98105" className={inputClass} />
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
                onChange={(e) => patchField(setF, "notEmployed", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary"
              />
              I am not currently employed
            </label>

            {f.notEmployed ? (
              <div className="mt-6">
                <Field label="Other / Non-Employment Income ($)" hint="e.g. rental income, investments, child support, disability">
                  <Input value={f.otherIncome} onChange={(e) => patchField(setF, "otherIncome", e.target.value)} placeholder="0" className={inputClass} />
                </Field>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Employer name">
                    <Input value={f.employerName} onChange={(e) => patchField(setF, "employerName", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Employer address">
                    <Input value={f.employerAddress} onChange={(e) => patchField(setF, "employerAddress", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Supervisor name">
                    <Input value={f.supervisorName} onChange={(e) => patchField(setF, "supervisorName", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Supervisor phone" optional>
                    <Input value={f.supervisorPhone} onChange={(e) => patchField(setF, "supervisorPhone", e.target.value)} placeholder="(206) 555-0100" className={inputClass} />
                  </Field>
                  <Field label="Job title">
                    <Input value={f.jobTitle} onChange={(e) => patchField(setF, "jobTitle", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Monthly income ($)">
                    <Input value={f.monthlyIncome} onChange={(e) => patchField(setF, "monthlyIncome", e.target.value)} placeholder="0" className={inputClass} />
                  </Field>
                  <Field label="Annual income ($)">
                    <Input value={f.annualIncome} onChange={(e) => patchField(setF, "annualIncome", e.target.value)} placeholder="0" className={inputClass} />
                  </Field>
                  <Field label="Employment start date">
                    <Input type="date" value={f.employmentStart} onChange={(e) => patchField(setF, "employmentStart", e.target.value)} className={inputClass} />
                  </Field>
                </div>
                <Field label="Other / Non-Employment Income ($)" optional hint="Optional — e.g. rental income, investments">
                  <Input value={f.otherIncome} onChange={(e) => patchField(setF, "otherIncome", e.target.value)} placeholder="0" className={inputClass} />
                </Field>
              </div>
            )}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <CardHeader title="Financial Background / Legal" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Bankruptcy history">
                <select
                  value={f.bankruptcy}
                  onChange={(e) => patchField(setF, "bankruptcy", e.target.value)}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary`}
                >
                  <option value="">Select…</option>
                  <option value="never">Never filed</option>
                  <option value="past_discharged">Past bankruptcy (discharged)</option>
                  <option value="current">Current / active</option>
                </select>
              </Field>
              <Field label="Criminal convictions">
                <select
                  value={f.criminal}
                  onChange={(e) => patchField(setF, "criminal", e.target.value)}
                  className={`${inputClass} w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm outline-none focus:border-primary`}
                >
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Consent for Credit and Background Check
                <span className="font-semibold text-primary"> *</span>
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={f.consentCredit}
                  onChange={(e) => patchField(setF, "consentCredit", e.target.checked)}
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
            <Field label="Co-Signer Signature">
              <Input value={f.signature} onChange={(e) => patchField(setF, "signature", e.target.value)} placeholder="Type your full legal name" className={inputClass} />
            </Field>
            <Field label="Date signed">
              <Input type="date" value={f.dateSigned} onChange={(e) => patchField(setF, "dateSigned", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Additional notes" optional className="mt-4">
              <Textarea value={f.notes} onChange={(e) => patchField(setF, "notes", e.target.value)} placeholder="Optional context for our team" className={inputClass} />
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
  optional = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** When false, shows a blue asterisk like the signer application mockups */
  optional?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-slate-800">
        {label}
        {!optional ? <span className="font-semibold text-primary"> *</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
      {children}
    </div>
  );
}

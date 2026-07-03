"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { RentalWizardStepBody } from "@/components/marketing/rental-wizard-steps";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  replaceManagerApplicationRowInCache,
  upsertApplicationRowToServerAwait,
} from "@/lib/manager-applications-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import { maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";
import {
  computeLeaseEndDate,
  normalizeIsoDateInput,
  shouldAutoComputeLeaseEnd,
} from "@/lib/rental-application/lease-dates";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardErrors, RentalWizardFormState } from "@/lib/rental-application/types";
import { countValidationErrors, validateRentalWizardStep } from "@/lib/rental-application/validate";
import {
  RENTAL_WIZARD_STEP_FIELD_ORDER,
  scrollToFirstWizardFieldError,
} from "@/lib/wizard-field-errors";
import { canNavigateToWizardStep, nextWizardMaxReached } from "@/lib/wizard-step-nav";

const EDIT_STEP_META = [
  { n: 1, title: "Group Application" },
  { n: 2, title: "Co-Signer" },
  { n: 3, title: "Property Information" },
  { n: 4, title: "Signer Information" },
  { n: 5, title: "Current Address" },
  { n: 6, title: "Previous Address" },
  { n: 7, title: "Employment and Income" },
  { n: 8, title: "References" },
  { n: 9, title: "Additional Details" },
  { n: 10, title: "Consent and Signature" },
  { n: 11, title: "Review" },
] as const;

const EDIT_STEP_COUNT = EDIT_STEP_META.length;

type Props = {
  row: DemoApplicantRow;
  residentEmail: string;
  onCancel: () => void;
  onSaved: () => void;
};

export function ResidentApplicationEditor({ row, residentEmail, onCancel, onSaved }: Props) {
  const { showToast } = useAppUi();
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState<number>(EDIT_STEP_COUNT);
  const [form, setForm] = useState<RentalWizardFormState>(() => ({
    ...createInitialRentalWizardState(),
    ...(row.application ?? {}),
    email: residentEmail,
  }));
  const [errors, setErrors] = useState<RentalWizardErrors>({});
  const [saving, setSaving] = useState(false);
  const [occupancySyncEpoch] = useState(0);
  const [showAvailabilityWarnings, setShowAvailabilityWarnings] = useState(false);

  const propertyOptions = useMemo(() => {
    const pid = form.propertyId.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
    if (!pid) return [];
    const prop = getPropertyById(pid);
    if (!prop) return [{ value: pid, label: row.property || pid }];
    return [{ value: prop.id, label: prop.title }];
  }, [form.propertyId, row.application?.propertyId, row.property, row.propertyId]);

  const patchForm = useCallback(
    (p: Partial<RentalWizardFormState>) => {
      setForm((f) => {
        const merged: RentalWizardFormState = { ...f, ...p, email: residentEmail };
        if ("leaseStart" in p) merged.leaseStart = normalizeIsoDateInput(p.leaseStart);
        if ("leaseEnd" in p) merged.leaseEnd = p.leaseEnd ? normalizeIsoDateInput(p.leaseEnd) : "";
        if ("leaseTerm" in p && p.leaseTerm === "Month-to-Month") merged.leaseEnd = "";
        const endExplicit = "leaseEnd" in p;
        if (
          !endExplicit &&
          ("leaseTerm" in p || "leaseStart" in p) &&
          shouldAutoComputeLeaseEnd(merged.leaseTerm, merged.rentalType)
        ) {
          const computed = computeLeaseEndDate(merged.leaseStart, merged.leaseTerm);
          if (computed) merged.leaseEnd = computed;
        }
        return merged;
      });
      if (
        Object.keys(p).some((k) =>
          ["propertyId", "roomChoice1", "roomChoice2", "roomChoice3", "rentalType", "leaseTerm", "leaseStart", "leaseEnd"].includes(k),
        )
      ) {
        setShowAvailabilityWarnings(false);
      }
      setErrors((e) => {
        const next = { ...e };
        for (const key of Object.keys(p) as (keyof RentalWizardFormState)[]) {
          delete next[key];
        }
        if ("customFieldAnswers" in p) {
          for (const key of Object.keys(next)) if (key.startsWith("custom:")) delete next[key];
        }
        return next;
      });
    },
    [residentEmail],
  );

  const setPhoneMasked = useCallback((key: keyof RentalWizardFormState, next: string) => {
    setForm((f) => ({ ...f, [key]: maskPhoneInput(String(f[key] ?? ""), next), email: residentEmail }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }, [residentEmail]);

  const setPhone = useCallback((next: string) => setPhoneMasked("phone", next), [setPhoneMasked]);
  const setLandlordPhone = useCallback((next: string) => setPhoneMasked("currentLandlordPhone", next), [setPhoneMasked]);
  const setPrevLandlordPhone = useCallback((next: string) => setPhoneMasked("prevLandlordPhone", next), [setPhoneMasked]);
  const setSupervisorPhone = useCallback((next: string) => setPhoneMasked("supervisorPhone", next), [setPhoneMasked]);
  const setRef1Phone = useCallback((next: string) => setPhoneMasked("ref1Phone", next), [setPhoneMasked]);
  const setRef2Phone = useCallback((next: string) => setPhoneMasked("ref2Phone", next), [setPhoneMasked]);

  const setSsn = useCallback((next: string) => {
    setForm((f) => ({ ...f, ssn: maskSsnInput(next), email: residentEmail }));
    setErrors((e) => ({ ...e, ssn: "" }));
  }, [residentEmail]);

  const goToStep = useCallback(
    (n: number) => {
      if (!canNavigateToWizardStep(n, maxStepReached)) return;
      setStep(n);
      setErrors({});
      if (n === 3) setShowAvailabilityWarnings(false);
    },
    [maxStepReached],
  );

  const editFromReview = useCallback(
    (n: number) => {
      if (!canNavigateToWizardStep(n, maxStepReached)) return;
      setStep(n);
      setErrors({});
      if (n === 3) setShowAvailabilityWarnings(false);
    },
    [maxStepReached],
  );

  const validateCurrentStep = useCallback(() => {
    const e = validateRentalWizardStep(step, form);
    if (countValidationErrors(e) > 0) {
      setErrors(e);
      queueMicrotask(() => scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[step] ?? [], e));
      return false;
    }
    return true;
  }, [form, step]);

  const validateAllPrior = useCallback(() => {
    for (let s = 1; s <= 10; s++) {
      const e = validateRentalWizardStep(s, form);
      if (countValidationErrors(e) > 0) {
        setErrors(e);
        setStep(s);
        showToast("Please review the highlighted fields before saving.");
        queueMicrotask(() => scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[s] ?? [], e));
        return false;
      }
    }
    return true;
  }, [form, showToast]);

  const handleContinue = useCallback(() => {
    if (step < EDIT_STEP_COUNT) {
      if (!validateCurrentStep()) return;
      const next = step + 1;
      setStep(next);
      setMaxStepReached((m) => nextWizardMaxReached(m, next));
      setErrors({});
      return;
    }
    if (!validateAllPrior()) return;
    void (async () => {
      setSaving(true);
      const pid = form.propertyId.trim() || row.propertyId?.trim() || "";
      const prop = pid ? getPropertyById(pid) : undefined;
      const updated: DemoApplicantRow = {
        ...row,
        name: form.fullLegalName.trim() || row.name,
        property: prop?.title?.trim() || row.property,
        propertyId: pid || row.propertyId,
        email: residentEmail,
        bucket: "pending",
        stage: row.stage || "Submitted",
        detail: `Updated ${new Date().toLocaleString()}`,
        application: structuredClone({ ...form, email: residentEmail }),
      };
      const result = await upsertApplicationRowToServerAwait(updated);
      setSaving(false);
      if (!result.ok) {
        showToast(result.error ?? "Could not save application.");
        return;
      }
      replaceManagerApplicationRowInCache(updated);
      showToast("Application saved.");
      onSaved();
    })();
  }, [form, onSaved, residentEmail, row, showToast, step, validateAllPrior, validateCurrentStep]);

  const handleBack = useCallback(() => {
    if (step <= 1) {
      onCancel();
      return;
    }
    setStep((s) => s - 1);
    setErrors({});
  }, [onCancel, step]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setForm({
        ...createInitialRentalWizardState(),
        ...(row.application ?? {}),
        email: residentEmail,
      });
      setStep(1);
      setMaxStepReached(EDIT_STEP_COUNT);
      setErrors({});
    });
  }, [residentEmail, row]);

  const meta = EDIT_STEP_META[step - 1] ?? EDIT_STEP_META[0];
  const applicationFeeGate = { needsFee: false, paid: true, displayLabel: "", amount: 0 };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="border-b border-border pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted/70">
          Step {step} of {EDIT_STEP_COUNT}
        </p>
        <p className="mt-1 text-lg font-bold tracking-tight text-foreground">{meta.title}</p>
      </div>

      <div className="mt-6">
        <RentalWizardStepBody
          step={step}
          form={form}
          errors={errors}
          propertyOptions={propertyOptions}
          propertyLocked={false}
          patch={patchForm}
          applicationFeeGate={applicationFeeGate}
          occupancySyncEpoch={occupancySyncEpoch}
          showAvailabilityWarnings={showAvailabilityWarnings}
          setPhone={setPhone}
          setLandlordPhone={setLandlordPhone}
          setPrevLandlordPhone={setPrevLandlordPhone}
          setSupervisorPhone={setSupervisorPhone}
          setRef1Phone={setRef1Phone}
          setRef2Phone={setRef2Phone}
          setSsn={setSsn}
          goToStep={goToStep}
          editFromReview={editFromReview}
        />
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
          {step <= 1 ? "Cancel" : "Back"}
        </Button>
        <Button type="button" onClick={handleContinue} disabled={saving}>
          {saving ? "Saving…" : step === EDIT_STEP_COUNT ? "Save application" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

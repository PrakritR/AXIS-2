"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";
import {
  ensurePendingApplicationFeeCharge,
  findApplicationFeeCharge,
  HOUSEHOLD_CHARGES_EVENT,
  listingApplicationFeeAmount,
  recordApplicationCharges,
} from "@/lib/household-charges";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getPropertyById, getPropertySelectOptions, getRoomOptionsForProperty } from "@/lib/rental-application/data";
import { clearRentalWizardDraft, loadRentalWizardDraft, saveRentalWizardDraft } from "@/lib/rental-application/drafts";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardErrors, RentalWizardFormState } from "@/lib/rental-application/types";
import { RENTAL_WIZARD_STEP_COUNT } from "@/lib/rental-application/types";
import { maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";
import { countValidationErrors, validateRentalWizardStep } from "@/lib/rental-application/validate";
import { RentalWizardStepBody } from "./rental-wizard-steps";

function makeNewApplicationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `APP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  }
  return `APP-${Date.now().toString(36).toUpperCase()}`;
}

const STEP_META = [
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
  { n: 12, title: "Application fee" },
] as const;

export function RentalApplicationWizard({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-600">Loading application…</div>
      }
    >
      <RentalApplicationWizardInner showToast={showToast} />
    </Suspense>
  );
}

function RentalApplicationWizardInner({ showToast }: { showToast: (msg: string) => void }) {
  const searchParams = useSearchParams();
  const [applicationPath, setApplicationPath] = useState<"signer" | "cosigner">("signer");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RentalWizardFormState>(createInitialRentalWizardState);
  const [errors, setErrors] = useState<RentalWizardErrors>({});
  const [draftReady, setDraftReady] = useState(false);
  const [extrasTick, setExtrasTick] = useState(0);
  const [chargeTick, setChargeTick] = useState(0);
  const [feeStepUserId, setFeeStepUserId] = useState<string | null>(null);
  const [postSubmit, setPostSubmit] = useState<{ applicationId: string } | null>(null);

  const listingPrefillKey = useMemo(() => {
    return [
      searchParams.get("propertyId") ?? "",
      searchParams.get("roomName") ?? "",
      searchParams.get("floor") ?? "",
      searchParams.get("roomPrice") ?? "",
      searchParams.get("listingRoomId") ?? "",
    ].join("|");
  }, [searchParams]);

  useEffect(() => {
    const on = () => setExtrasTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, []);

  useEffect(() => {
    const on = () => setChargeTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  useEffect(() => {
    if (step !== 12) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setFeeStepUserId(user?.id ?? null);
      } catch {
        if (!cancelled) setFeeStepUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (!draftReady || step !== 12) return;
    if (form.applicationFeeWaivedByPromo) return;
    const email = form.email.trim();
    const pid = form.propertyId.trim();
    if (!email.includes("@") || !pid) return;
    const { amount } = listingApplicationFeeAmount(pid);
    if (amount <= 0) return;
    ensurePendingApplicationFeeCharge({
      residentEmail: form.email,
      residentName: form.fullLegalName,
      residentUserId: feeStepUserId,
      propertyId: pid,
    });
  }, [
    draftReady,
    step,
    form.applicationFeeWaivedByPromo,
    form.email,
    form.fullLegalName,
    form.propertyId,
    feeStepUserId,
    chargeTick,
  ]);

  const propertyOptions = useMemo(() => {
    const base = getPropertySelectOptions();
    const seen = new Set(base.map((b) => b.value));
    const extra = readExtraListings()
      .filter((p) => !seen.has(p.id))
      .map((p) => ({ value: p.id, label: p.title }));
    return [...base, ...extra];
  }, [extrasTick]);

  useEffect(() => {
    const draft = loadRentalWizardDraft();
    if (draft) {
      setForm((current) => ({ ...current, ...draft }));
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    saveRentalWizardDraft(form);
  }, [draftReady, form]);

  useEffect(() => {
    if (!draftReady) return;
    const pid = searchParams.get("propertyId")?.trim();
    if (!pid) return;
    const prop = getPropertyById(pid);
    if (!prop) return;

    const roomName = searchParams.get("roomName");
    const floor = searchParams.get("floor") ?? "";
    const roomPrice = searchParams.get("roomPrice") ?? "";
    const listingRoomId = searchParams.get("listingRoomId") ?? "";

    setForm((prev) => {
      const opts = getRoomOptionsForProperty(pid).filter((o) => o.value);
      const room1 = opts.some((o) => o.value === pid) ? pid : opts[0]?.value ?? "";

      let notes = prev.additionalNotes;
      if (roomName || floor || roomPrice) {
        const roomPart = [floor, roomName].filter(Boolean).join(" · ");
        const line = `[Listing preference${listingRoomId ? ` · ref ${listingRoomId}` : ""}: ${[roomPart, roomPrice].filter(Boolean).join(" — ")}]`;
        if (!notes.includes(line)) {
          notes = notes.trim() ? `${line}\n\n${notes}` : line;
        }
      } else {
        const line = `[Application started from: ${prop.title}]`;
        if (!notes.includes(line)) {
          notes = notes.trim() ? `${line}\n\n${notes}` : line;
        }
      }

      return {
        ...prev,
        propertyId: pid,
        roomChoice1: room1 || prev.roomChoice1,
        roomChoice2: "",
        roomChoice3: "",
        additionalNotes: notes,
      };
    });
  }, [draftReady, listingPrefillKey]);

  const patchForm = useCallback((p: Partial<RentalWizardFormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k];
      return next;
    });
  }, []);

  const setPhoneMasked = useCallback((key: keyof RentalWizardFormState, next: string) => {
    setForm((f) => ({ ...f, [key]: maskPhoneInput(String(f[key] ?? ""), next) }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }, []);

  const setPhone = useCallback((next: string) => setPhoneMasked("phone", next), [setPhoneMasked]);
  const setLandlordPhone = useCallback((next: string) => setPhoneMasked("currentLandlordPhone", next), [setPhoneMasked]);
  const setPrevLandlordPhone = useCallback((next: string) => setPhoneMasked("prevLandlordPhone", next), [setPhoneMasked]);
  const setSupervisorPhone = useCallback((next: string) => setPhoneMasked("supervisorPhone", next), [setPhoneMasked]);
  const setRef1Phone = useCallback((next: string) => setPhoneMasked("ref1Phone", next), [setPhoneMasked]);
  const setRef2Phone = useCallback((next: string) => setPhoneMasked("ref2Phone", next), [setPhoneMasked]);

  const setSsn = useCallback((next: string) => {
    setForm((f) => ({ ...f, ssn: maskSsnInput(next) }));
    setErrors((e) => ({ ...e, ssn: "" }));
  }, []);

  const goToStep = useCallback((n: number) => {
    setStep(n);
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const validateAllPrior = useCallback(() => {
    for (let s = 1; s <= 10; s++) {
      const e = validateRentalWizardStep(s, form);
      if (countValidationErrors(e) > 0) {
        setErrors(e);
        setStep(s);
        showToast("Please review the highlighted fields before submitting.");
        return false;
      }
    }
    return true;
  }, [form, showToast]);

  const mergeErrors = useCallback((partial: RentalWizardErrors) => {
    setErrors((prev) => ({ ...prev, ...partial }));
  }, []);

  const applicationFeeGate = useMemo(() => {
    const pid = form.propertyId.trim();
    const email = form.email.trim();
    const { amount, displayLabel } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && email.includes("@") && amount > 0);
    const charge = pid && email ? findApplicationFeeCharge(email, pid, feeStepUserId) : undefined;
    const paid = charge?.status === "paid";
    return { needsFee, paid, displayLabel, amount, waived: form.applicationFeeWaivedByPromo };
  }, [form.propertyId, form.email, form.applicationFeeWaivedByPromo, feeStepUserId, chargeTick]);

  const handleContinue = () => {
    if (step === 12) {
      if (!validateAllPrior()) return;
      const e12 = validateRentalWizardStep(12, form);
      setErrors(e12);
      if (countValidationErrors(e12) > 0) {
        showToast("Confirm the application fee to submit.");
        return;
      }
      void (async () => {
        let residentUserId: string | null = null;
        try {
          const supabase = createSupabaseBrowserClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          residentUserId = user?.id ?? null;
        } catch {
          /* ignore */
        }
        const pid = form.propertyId.trim();
        const { amount } = listingApplicationFeeAmount(pid);
        const needsFee = amount > 0;
        if (needsFee && !form.applicationFeeWaivedByPromo) {
          const appFee = findApplicationFeeCharge(form.email, pid, residentUserId);
          if (!appFee || appFee.status !== "paid") {
            showToast(
              "The application fee for this listing must be marked paid (resident portal Payments) before you can submit, unless you apply promo code FEEWAIVE."
            );
            return;
          }
        }
        recordApplicationCharges(
          {
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId,
            propertyId: form.propertyId,
          },
          { skipApplicationFee: Boolean(form.applicationFeeWaivedByPromo) }
        );
        clearRentalWizardDraft();
        const nextInitial = createInitialRentalWizardState();
        setForm(nextInitial);
        setStep(1);
        setErrors({});
        setPostSubmit({ applicationId: makeNewApplicationId() });
        showToast("Application submitted.");
      })();
      return;
    }
    if (step === 11) {
      if (!validateAllPrior()) return;
      setStep(12);
      setErrors({});
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const e = validateRentalWizardStep(step, form);
    setErrors(e);
    if (countValidationErrors(e) > 0) {
      showToast("Please fix the highlighted fields before continuing.");
      return;
    }
    setStep((s) => s + 1);
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (step <= 1) return;
    if (step === 12) {
      setStep(11);
      setErrors({});
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setStep((s) => s - 1);
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const meta = STEP_META[step - 1];
  const progressPct = Math.round((step / RENTAL_WIZARD_STEP_COUNT) * 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="text-center sm:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-[#0d1f4e] sm:text-3xl md:text-4xl">Residential rental application</h1>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_16px_48px_-28px_rgba(15,23,42,0.18)] sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Choose your form</p>
        <div className="mt-4">
          <SegmentedTwo
            value={applicationPath}
            onChange={setApplicationPath}
            left={{ id: "signer", label: "Signer form" }}
            right={{ id: "cosigner", label: "Co-signer form" }}
            className="max-w-md"
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {applicationPath === "signer"
            ? "Use the signer form if you are the main applicant for the lease."
            : "Filing as a co-signer on someone else's application? Open the co-signer form."}
        </p>
        {applicationPath === "cosigner" ? (
          <div className="mt-5">
            <Link href="/rent/apply/cosigner" className="inline-flex">
              <Button type="button" className="min-h-[48px] px-6">
                Open the co-signer form
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      {applicationPath === "signer" ? (
        postSubmit ? (
          <div
            className="mt-8 rounded-3xl border border-emerald-200/90 bg-emerald-50/40 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.18)] sm:p-9 md:p-11"
            style={{ boxShadow: "0 24px 80px -32px rgba(15,23,42,0.18), 0 1px 0 rgba(255,255,255,0.9) inset" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800/80">Application received</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Save your Application ID</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Use this ID when you create your resident account, and share it with a co-signer if they are filing separately. Other move-in
              charges from the listing appear under Payments in the resident portal; your manager marks Zelle or offline payments as received.
            </p>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application ID</p>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{postSubmit.applicationId}</p>
            </div>
            <div className="mt-8">
              <Button type="button" className="min-h-[48px] px-8" onClick={() => setPostSubmit(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="mt-8 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.18)] sm:p-9 md:p-11"
            style={{ boxShadow: "0 24px 80px -32px rgba(15,23,42,0.18), 0 1px 0 rgba(255,255,255,0.9) inset" }}
          >
            <div className="border-b border-slate-100 pb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Step {step} of {RENTAL_WIZARD_STEP_COUNT}
              </p>
              <p className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{meta.title}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="pt-8">
              <RentalWizardStepBody
                step={step}
                form={form}
                errors={errors}
                propertyOptions={propertyOptions}
                patch={patchForm}
                mergeErrors={mergeErrors}
                applicationFeeGate={applicationFeeGate}
                setPhone={setPhone}
                setLandlordPhone={setLandlordPhone}
                setPrevLandlordPhone={setPrevLandlordPhone}
                setSupervisorPhone={setSupervisorPhone}
                setRef1Phone={setRef1Phone}
                setRef2Phone={setRef2Phone}
                setSsn={setSsn}
                goToStep={goToStep}
              />
            </div>

            <div className="mt-10 flex flex-col-reverse gap-3 border-t border-slate-100 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]" onClick={handleBack} disabled={step <= 1}>
                Back
              </Button>
              <Button type="button" className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]" onClick={handleContinue}>
                {step === 12 ? "Submit application" : "Continue"}
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

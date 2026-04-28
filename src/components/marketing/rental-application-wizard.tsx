"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { PROPERTY_PIPELINE_EVENT, readAllExtraListings, readExtraListings } from "@/lib/demo-property-pipeline";
import {
  ensurePendingApplicationFeeCharge,
  findApplicationFeeCharge,
  HOUSEHOLD_CHARGES_EVENT,
  listingApplicationFeeAmount,
  markApplicationFeePaidAfterStripe,
  recordApplicationCharges,
} from "@/lib/household-charges";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getPropertyById, getPropertySelectOptions, getRoomOptionsForProperty, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { resolveApplicationFeePayChannel } from "@/lib/rental-application/application-fee-channel";
import { clearRentalWizardDraft, loadRentalWizardDraft, saveRentalWizardDraft } from "@/lib/rental-application/drafts";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardErrors, RentalWizardFormState } from "@/lib/rental-application/types";
import { RENTAL_WIZARD_STEP_COUNT } from "@/lib/rental-application/types";
import { maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";
import { countValidationErrors, validateRentalWizardStep } from "@/lib/rental-application/validate";
import { appendManagerApplicationRow } from "@/lib/manager-applications-storage";
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
  const [reviewReturnStep, setReviewReturnStep] = useState<number | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [postSubmit, setPostSubmit] = useState<{ applicationId: string } | null>(null);
  const [emailAccountStatus, setEmailAccountStatus] = useState<{ exists: boolean; axisId: string | null } | null>(null);
  const router = useRouter();

  // Check if the entered email already has an Axis account.
  useEffect(() => {
    const em = form.email.trim().toLowerCase();
    if (!em || !em.includes("@")) {
      setEmailAccountStatus(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/auth/account-email-status?email=${encodeURIComponent(em)}`)
      .then(async (res) => {
        const body = (await res.json()) as { exists?: boolean; roles?: string[]; axisId?: string | null };
        if (!cancelled) {
          setEmailAccountStatus({ exists: Boolean(body.exists), axisId: body.axisId ?? null });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.email]);

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
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem("axis_application_fee_resume") : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { step?: number };
        if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= 12) {
          setStep(parsed.step);
        }
        window.sessionStorage.removeItem("axis_application_fee_resume");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    saveRentalWizardDraft(form);
  }, [draftReady, form]);

  useEffect(() => {
    if (!draftReady) return;
    const pid = searchParams.get("propertyId")?.trim();
    if (!pid) return;

    const listingRoomId = searchParams.get("listingRoomId") ?? "";

    setForm((prev) => {
      const opts = getRoomOptionsForProperty(pid).filter((o) => o.value);
      let room1 = opts[0]?.value ?? "";
      const lr = listingRoomId.trim();
      if (lr) {
        const composite = `${pid}${LISTING_ROOM_CHOICE_SEP}${lr}`;
        const hit = opts.find((o) => o.value === composite);
        if (hit) room1 = hit.value;
      }

      return {
        ...prev,
        propertyId: pid,
        roomChoice1: room1 || prev.roomChoice1,
        roomChoice2: "",
        roomChoice3: "",
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

  useEffect(() => {
    if (!draftReady || step !== 12) return;
    const pid = form.propertyId.trim();
    const prop = pid ? getPropertyById(pid) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const next = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (next !== form.applicationFeePayChannel) patchForm({ applicationFeePayChannel: next });
  }, [draftReady, step, form.propertyId, form.applicationFeePayChannel, patchForm]);

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
    setReviewReturnStep(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const editFromReview = useCallback((n: number) => {
    setStep(n);
    setErrors({});
    setReviewReturnStep(n);
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

  const applicationFeeGate = useMemo(() => {
    const pid = form.propertyId.trim();
    const email = form.email.trim();
    const { amount, displayLabel } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && email.includes("@") && amount > 0);
    const charge = pid && email ? findApplicationFeeCharge(email, pid, feeStepUserId) : undefined;
    const paid = charge?.status === "paid";
    return { needsFee, paid, displayLabel, amount };
  }, [form.propertyId, form.email, feeStepUserId, chargeTick]);

  const finalizeApplicationSubmit = useCallback(
    (residentUserId: string | null) => {
      const pid = form.propertyId.trim();
      const emailTrim = form.email.trim();
      const prop = pid ? getPropertyById(pid) : undefined;

      recordApplicationCharges({
        residentEmail: form.email,
        residentName: form.fullLegalName,
        residentUserId,
        propertyId: form.propertyId,
      });

      const applicationId = makeNewApplicationId();
      const listing = prop ?? readAllExtraListings().find((p) => p.id === pid);
      const feeCharge = findApplicationFeeCharge(form.email, pid, residentUserId);
      appendManagerApplicationRow({
        id: applicationId,
        name: form.fullLegalName.trim() || "Applicant",
        property: (listing?.title?.trim() || pid.trim()) || "Listing",
        propertyId: pid || undefined,
        managerUserId: listing?.managerUserId ?? feeCharge?.managerUserId ?? prop?.managerUserId ?? null,
        stage: "Submitted",
        bucket: "pending",
        detail: `Submitted ${new Date().toLocaleString()}`,
        email: emailTrim,
        application: structuredClone(form),
      });

      clearRentalWizardDraft();
      setForm(createInitialRentalWizardState());
      setStep(1);
      setErrors({});
      setPostSubmit({ applicationId });
      setChargeTick((n) => n + 1);
      showToast("Application submitted.");
    },
    [form, showToast],
  );

  const primaryButtonLabel = useMemo(() => {
    if (step !== 12) return "Continue";
    const pid = form.propertyId.trim();
    const email = form.email.trim();
    const { amount } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && email.includes("@") && amount > 0);
    if (!needsFee) return "Submit application";
    const prop = pid ? getPropertyById(pid) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const payChannel = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (payChannel === "stripe") {
      return checkoutBusy ? "Opening Stripe…" : applicationFeeGate.paid ? "Submit application" : "Pay with Stripe";
    }
    if (payChannel === "zelle") {
      return "Submit application";
    }
    return "Submit application";
  }, [
    step,
    form.propertyId,
    form.email,
    form.applicationFeePayChannel,
    checkoutBusy,
    applicationFeeGate.paid,
  ]);

  useEffect(() => {
    if (!draftReady) return;
    const feeCheckout = searchParams.get("fee_checkout");
    if (feeCheckout === "cancel") {
      showToast("Checkout cancelled. You can try again when you are ready.");
      router.replace("/rent/apply");
      return;
    }
    if (feeCheckout !== "success") return;
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) return;

    const pid = form.propertyId.trim();
    const em = form.email.trim();
    if (!pid || !em.includes("@")) return;

    const okKey = `axis_application_fee_marked_${sessionId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(okKey)) {
      router.replace("/rent/apply");
      return;
    }

    void (async () => {
      const res = await fetch(`/api/stripe/application-fee-verify?session_id=${encodeURIComponent(sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        error?: string;
        propertyId?: string | null;
        residentEmail?: string | null;
      };
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "Could not verify payment.");
        router.replace("/rent/apply");
        return;
      }
      if (!data.paid) {
        showToast(typeof data.error === "string" ? data.error : "Payment not completed yet.");
        router.replace("/rent/apply");
        return;
      }
      if (
        String(data.propertyId ?? "")
          .trim()
          .toLowerCase() !== pid.toLowerCase() ||
        String(data.residentEmail ?? "")
          .trim()
          .toLowerCase() !== em.toLowerCase()
      ) {
        showToast("Payment confirmation does not match this application. Use the same email and listing as before checkout.");
        router.replace("/rent/apply");
        return;
      }
      ensurePendingApplicationFeeCharge({
        residentEmail: form.email,
        residentName: form.fullLegalName,
        residentUserId: feeStepUserId,
        propertyId: pid,
      });
      const marked = markApplicationFeePaidAfterStripe(form.email, pid, feeStepUserId);
      if (!marked) {
        showToast("Payment succeeded, but the application fee line could not be updated.");
        router.replace("/rent/apply");
        return;
      }
      setChargeTick((n) => n + 1);
      if (typeof window !== "undefined") window.sessionStorage.setItem(okKey, "1");
      finalizeApplicationSubmit(feeStepUserId);
      router.replace("/rent/apply");
    })();
  }, [draftReady, searchParams, form.propertyId, form.email, feeStepUserId, router, showToast, finalizeApplicationSubmit]);

  const handleContinue = () => {
    if (step === 12) {
      if (!validateAllPrior()) return;
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
        const emailTrim = form.email.trim();
        const prop = pid ? getPropertyById(pid) : undefined;
        const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
        const payChannel = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
        const { amount } = listingApplicationFeeAmount(pid);
        const needsFee = Boolean(pid && emailTrim.includes("@") && amount > 0);

        if (needsFee && payChannel === "stripe") {
          const charge = findApplicationFeeCharge(form.email, pid, residentUserId);
          if (charge?.status === "paid") {
            finalizeApplicationSubmit(residentUserId);
            return;
          }

          const listingForPay = prop ?? readAllExtraListings().find((p) => p.id === pid);
          const managerUserId = listingForPay?.managerUserId?.trim() ?? "";
          if (!managerUserId) {
            showToast("This listing cannot take Stripe payments yet. Contact the manager before submitting.");
            return;
          }

          const amountCents = Math.round(amount * 100);
          setCheckoutBusy(true);
          try {
            const res = await fetch("/api/stripe/application-fee-checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                propertyId: pid,
                residentEmail: form.email.trim(),
                residentName: form.fullLegalName.trim(),
                amountCents,
                managerUserId,
              }),
            });
            const payload = (await res.json().catch(() => ({}))) as {
              url?: string;
              error?: string;
            };

            if (!res.ok) {
              showToast(typeof payload.error === "string" ? payload.error : "Could not start Stripe payment.");
              return;
            }

            const checkoutUrl = typeof payload.url === "string" ? payload.url : "";
            if (checkoutUrl && typeof window !== "undefined") {
              window.sessionStorage.setItem("axis_application_fee_resume", JSON.stringify({ step: 12 }));
              window.location.href = checkoutUrl;
              return;
            }
            showToast("Stripe did not return a checkout URL.");
          } finally {
            setCheckoutBusy(false);
          }
          return;
        }

        if (needsFee && payChannel === "zelle") {
          ensurePendingApplicationFeeCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId,
            propertyId: pid,
          });
          const zelleContact = sub?.zelleContact?.trim() ?? "the manager's Zelle contact";
          const confirmed = typeof window === "undefined" ? true : window.confirm(`Confirm you already sent the application fee by Zelle to ${zelleContact}.`);
          if (!confirmed) {
            return;
          }
          finalizeApplicationSubmit(residentUserId);
          return;
        }

        finalizeApplicationSubmit(residentUserId);
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
    if (reviewReturnStep != null && reviewReturnStep === step) {
      setStep(11);
      setReviewReturnStep(null);
    } else {
      setStep((s) => s + 1);
    }
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
    if (reviewReturnStep != null && reviewReturnStep === step) {
      setStep(11);
      setErrors({});
      setReviewReturnStep(null);
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
              {emailAccountStatus?.exists
                ? "Your application has been received. Since you already have an Axis account, sign in to track your application — no new account needed."
                : <>Use this ID when you create your resident account (open signup below with it filled in). Share it with a co-signer if they apply separately. After signup, your account stays limited to <strong>Dashboard</strong>, <strong>Profile</strong>, and <strong>Inbox</strong>{" "}until the manager marks your application fee paid and approves your application. Stripe payments are marked paid automatically after checkout.</>}
            </p>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application ID</p>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{postSubmit.applicationId}</p>
              {emailAccountStatus?.axisId ? (
                <p className="mt-2 text-xs text-slate-500">Your Axis ID: <span className="font-mono font-semibold text-slate-800">{emailAccountStatus.axisId}</span></p>
              ) : null}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {emailAccountStatus?.exists ? (
                <Link
                  href="/auth/sign-in"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-8 text-[14px] font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-px"
                >
                  Sign in to your account
                </Link>
              ) : (
                <Link
                  href={`/auth/create-account?role=resident&application_id=${encodeURIComponent(postSubmit.applicationId)}`}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-8 text-[14px] font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-px"
                >
                  Create resident account with Application ID
                </Link>
              )}
              <Button type="button" variant="outline" className="min-h-[48px] px-8" onClick={() => setPostSubmit(null)}>
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
              {emailAccountStatus?.exists ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm">
                  <span className="text-sky-900">
                    This email already has an Axis account.{emailAccountStatus.axisId ? <> Axis ID: <span className="font-mono font-semibold">{emailAccountStatus.axisId}</span>.</> : null}
                  </span>
                  <Link href="/auth/sign-in" className="shrink-0 font-semibold text-primary hover:opacity-80">
                    Sign in →
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="pt-8">
              <RentalWizardStepBody
                step={step}
                form={form}
                errors={errors}
                propertyOptions={propertyOptions}
                patch={patchForm}
                applicationFeeGate={applicationFeeGate}
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

            <div className="mt-10 flex flex-col-reverse gap-3 border-t border-slate-100 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]" onClick={handleBack} disabled={step <= 1}>
                {reviewReturnStep != null && reviewReturnStep === step ? "Back to review" : "Back"}
              </Button>
              <Button
                type="button"
                className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]"
                onClick={handleContinue}
                disabled={checkoutBusy}
              >
                {primaryButtonLabel}
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

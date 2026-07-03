"use client";

import { track } from "@/lib/analytics/track-client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import {
  loadPublicPropertyLeadFromServer,
  PROPERTY_PIPELINE_EVENT,
} from "@/lib/demo-property-pipeline";
import {
  ensurePendingApplicationFeeCharge,
  findApplicationFeeCharge,
  HOUSEHOLD_CHARGES_EVENT,
  listingApplicationFeeAmount,
  markApplicationFeePaidAfterStripe,
  recordApplicationCharges,
} from "@/lib/household-charges";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getPropertyById,
  getPropertyForPublicLink,
  getRoomOptionsForProperty,
  isRoomApprovedConflict,
  isRoomPendingConflict,
  LISTING_ROOM_CHOICE_SEP,
} from "@/lib/rental-application/data";
import { resolveApplicationFeePayChannel, isAchApplicationFeeChannel } from "@/lib/rental-application/application-fee-channel";
import { clearRentalWizardDraft, loadRentalWizardDraft, saveRentalWizardDraft } from "@/lib/rental-application/drafts";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardErrors, RentalWizardFormState } from "@/lib/rental-application/types";
import {
  computeLeaseEndDate,
  normalizeIsoDateInput,
  shouldAutoComputeLeaseEnd,
} from "@/lib/rental-application/lease-dates";
import { RENTAL_WIZARD_STEP_COUNT } from "@/lib/rental-application/types";
import { maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";
import { countValidationErrors, validateRentalWizardStep } from "@/lib/rental-application/validate";
import {
  RENTAL_WIZARD_STEP_FIELD_ORDER,
  scrollToFirstWizardFieldError,
} from "@/lib/wizard-field-errors";
import {
  appendManagerApplicationRow,
  syncPublicApprovedApplicationsFromServer,
  upsertApplicationRowToServerAwait,
} from "@/lib/manager-applications-storage";
import { RentalWizardStepBody } from "./rental-wizard-steps";
import { ManagerLinkGate } from "@/components/marketing/manager-link-gate";
import { RentalApplicationFinishPanel } from "@/components/marketing/rental-application-finish-panel";
import { canNavigateToWizardStep, nextWizardMaxReached } from "@/lib/wizard-step-nav";

const processedApplicationFeeSessions = new Set<string>();

function makeNewApplicationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `AXIS-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }
  return `AXIS-${Date.now().toString(36).toUpperCase()}`;
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

function rentalApplicationExitPath(): string {
  return "/auth/sign-in";
}

function RentalWizardExitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rental-wizard-exit inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 py-2 text-sm font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 active:bg-primary/15"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
}

export function RentalApplicationWizard({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">Loading application…</div>
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
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [form, setForm] = useState<RentalWizardFormState>(() => {
    const draft = loadRentalWizardDraft();
    return draft ? { ...createInitialRentalWizardState(), ...draft } : createInitialRentalWizardState();
  });
  const [errors, setErrors] = useState<RentalWizardErrors>({});
  const [draftReady] = useState(true);
  const [extrasTick, setExtrasTick] = useState(0);
  const [chargeTick, setChargeTick] = useState(0);
  const [feeStepUserId, setFeeStepUserId] = useState<string | null>(null);
  const [reviewReturnStep, setReviewReturnStep] = useState<number | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [postSubmit, setPostSubmit] = useState<{
    axisId: string;
    email: string;
    propertyTitle?: string;
    emailSent?: boolean;
    syncError?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAvailabilityWarnings, setShowAvailabilityWarnings] = useState(false);
  /** Bumps after server sync so step 3 room dropdowns re-filter against approved occupancy. */
  const [occupancySyncEpoch, setOccupancySyncEpoch] = useState(0);
  const router = useRouter();

  const exitApplication = useCallback(() => {
    router.push(rentalApplicationExitPath());
  }, [router]);

  const listingPrefillKey = useMemo(() => {
    return [
      searchParams.get("propertyId") ?? "",
      searchParams.get("roomName") ?? "",
      searchParams.get("floor") ?? "",
      searchParams.get("roomPrice") ?? "",
      searchParams.get("listingRoomId") ?? "",
    ].join("|");
  }, [searchParams]);

  const linkedPropertyId = searchParams.get("propertyId")?.trim() ?? "";

  useEffect(() => {
    void syncPublicApprovedApplicationsFromServer().then(() => setOccupancySyncEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    const on = () => setExtrasTick((n) => n + 1);
    if (linkedPropertyId) {
      void loadPublicPropertyLeadFromServer(linkedPropertyId).then(() => on());
    }
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, [linkedPropertyId]);

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
    void extrasTick;
    if (!linkedPropertyId) return [];
    const prop = getPropertyForPublicLink(linkedPropertyId);
    if (!prop) return [];
    return [{ value: prop.id, label: prop.title }];
  }, [extrasTick, linkedPropertyId]);

  const linkedProperty = useMemo(() => {
    void extrasTick;
    if (!linkedPropertyId) return undefined;
    return getPropertyForPublicLink(linkedPropertyId);
  }, [extrasTick, linkedPropertyId]);

  useEffect(() => {
    if (!draftReady) return;
    saveRentalWizardDraft(form);
  }, [draftReady, form]);

  useEffect(() => {
    if (!draftReady) return;
    const pid = searchParams.get("propertyId")?.trim();
    if (!pid) return;

    const listingRoomId = searchParams.get("listingRoomId") ?? "";

    queueMicrotask(() => {
      setForm((prev) => {
        const opts = getRoomOptionsForProperty(pid, { includeUnavailable: true }).filter((o) => o.value);
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
          // A restored draft may hold answers for a different listing's questions.
          ...(prev.propertyId && prev.propertyId !== pid ? { customFieldAnswers: [] } : {}),
        };
      });
    });
  }, [draftReady, listingPrefillKey, searchParams]);

  const patchForm = useCallback((p: Partial<RentalWizardFormState>) => {
    setForm((f) => {
      const merged: RentalWizardFormState = { ...f, ...p };
      // Custom application answers belong to one listing — drop them if the property changes.
      if ("propertyId" in p && (p.propertyId ?? "") !== f.propertyId && !("customFieldAnswers" in p)) {
        merged.customFieldAnswers = [];
      }
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
    if (Object.keys(p).some((k) => ["propertyId", "roomChoice1", "roomChoice2", "roomChoice3", "rentalType", "leaseTerm", "leaseStart", "leaseEnd"].includes(k))) {
      setShowAvailabilityWarnings(false);
    }
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k];
      if ("customFieldAnswers" in p) {
        for (const k of Object.keys(next)) if (k.startsWith("custom:")) delete next[k];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!draftReady || step !== 12) return;
    const pid = form.propertyId.trim();
    const prop = pid ? getPropertyById(pid) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const next = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (next !== form.applicationFeePayChannel) {
      queueMicrotask(() => patchForm({ applicationFeePayChannel: next }));
    }
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
    if (!canNavigateToWizardStep(n, maxStepReached)) return;
    setStep(n);
    setErrors({});
    setReviewReturnStep(null);
    if (n === 3) setShowAvailabilityWarnings(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [maxStepReached]);

  const editFromReview = useCallback((n: number) => {
    if (!canNavigateToWizardStep(n, maxStepReached)) return;
    setStep(n);
    setErrors({});
    setReviewReturnStep(n);
    if (n === 3) setShowAvailabilityWarnings(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [maxStepReached]);

  const validateAllPrior = useCallback(() => {
    for (let s = 1; s <= 10; s++) {
      const e = validateRentalWizardStep(s, form);
      if (countValidationErrors(e) > 0) {
        setErrors(e);
        setStep(s);
        showToast("Please review the highlighted fields before submitting.");
        queueMicrotask(() =>
          scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[s] ?? [], e),
        );
        return false;
      }
    }
    return true;
  }, [form, showToast]);

  const applicationFeeGate = useMemo(() => {
    void chargeTick;
    const pid = form.propertyId.trim();
    const email = form.email.trim();
    const { amount, displayLabel } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && email.includes("@") && amount > 0);
    const charge = pid && email ? findApplicationFeeCharge(email, pid, feeStepUserId) : undefined;
    const paid = charge?.status === "paid";
    return { needsFee, paid, displayLabel, amount };
  }, [form.propertyId, form.email, feeStepUserId, chargeTick]);

  const finalizeApplicationSubmit = useCallback(
    async (residentUserId: string | null) => {
      if (submitting) return;
      setSubmitting(true);
      const pid = form.propertyId.trim();
      const emailTrim = form.email.trim();
      const prop = pid ? getPropertyById(pid) : undefined;
      const axisId = makeNewApplicationId();
      const listing = prop;
      const applicantName = form.fullLegalName.trim() || "Applicant";

      recordApplicationCharges({
        residentEmail: form.email,
        residentName: form.fullLegalName,
        residentUserId,
        propertyId: form.propertyId,
        applicationId: axisId,
        managerUserId: listing?.managerUserId ?? prop?.managerUserId ?? null,
      });

      const feeCharge = findApplicationFeeCharge(form.email, pid, residentUserId);
      const applicationRow = {
        id: axisId,
        name: applicantName,
        property: (listing?.title?.trim() || pid.trim()) || "Listing",
        propertyId: pid || undefined,
        managerUserId: listing?.managerUserId ?? feeCharge?.managerUserId ?? prop?.managerUserId ?? null,
        stage: "Submitted" as const,
        bucket: "pending" as const,
        backgroundCheckStatus: "pending_review" as const,
        detail: `Submitted ${new Date().toLocaleString()}`,
        email: emailTrim,
        application: structuredClone(form),
      };

      appendManagerApplicationRow(applicationRow);
      const sync = await upsertApplicationRowToServerAwait(applicationRow);

      let emailSent = false;
      const propertyTitle = (listing?.title?.trim() || pid.trim()) || undefined;
      if (sync.ok && emailTrim.includes("@")) {
        try {
          const res = await fetch("/api/portal/send-application-submitted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailTrim,
              axisId,
              applicantName: applicantName !== "Applicant" ? applicantName : undefined,
              propertyTitle,
            }),
          });
          emailSent = res.ok;
        } catch {
          emailSent = false;
        }
      }

      track("rental_application_submitted", {
        axis_id: axisId,
        property_id: pid || undefined,
        synced_to_server: sync.ok,
        email_sent: emailSent,
      });
      clearRentalWizardDraft();
      setForm(createInitialRentalWizardState());
      setStep(1);
      setErrors({});
      setPostSubmit({
        axisId,
        email: emailTrim,
        propertyTitle,
        emailSent,
        syncError: sync.ok ? undefined : sync.error,
      });
      setChargeTick((n) => n + 1);
      setSubmitting(false);
      if (sync.ok) {
        showToast("Application submitted.");
      } else {
        showToast(sync.error ?? "Application saved locally but could not sync to server. Try again from create account.");
      }
    },
    [form, showToast, submitting],
  );

  const primaryButtonLabel = useMemo(() => {
    if (step !== 12) return "Continue";
    const pid = form.propertyId.trim();
    const email = form.email.trim();
    const { amount } = listingApplicationFeeAmount(pid);
    const needsFee = Boolean(pid && email.includes("@") && amount > 0);
    if (!needsFee) return submitting ? "Submitting…" : "Submit application";
    const prop = pid ? getPropertyById(pid) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const payChannel = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (isAchApplicationFeeChannel(payChannel)) {
      return checkoutBusy ? "Opening bank checkout…" : applicationFeeGate.paid ? "Submit application" : "Pay with bank (ACH)";
    }
    if (payChannel === "zelle" || payChannel === "venmo" || payChannel === "other") {
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
    submitting,
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

    if (processedApplicationFeeSessions.has(sessionId)) {
      router.replace("/rent/apply");
      return;
    }

    void (async () => {
      const res = await fetch(`/api/stripe/application-fee-verify?session_id=${encodeURIComponent(sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        processing?: boolean;
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
        if (data.processing) {
          ensurePendingApplicationFeeCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId: feeStepUserId,
            propertyId: pid,
          });
          processedApplicationFeeSessions.add(sessionId);
          showToast("Bank transfer submitted. Your application fee will be marked paid when the transfer clears.");
          finalizeApplicationSubmit(feeStepUserId);
          router.replace("/rent/apply");
          return;
        }
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
      processedApplicationFeeSessions.add(sessionId);
      finalizeApplicationSubmit(feeStepUserId);
      router.replace("/rent/apply");
    })();
  }, [draftReady, searchParams, form.propertyId, form.email, form.fullLegalName, feeStepUserId, router, showToast, finalizeApplicationSubmit]);

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

        if (needsFee && isAchApplicationFeeChannel(payChannel)) {
          const charge = findApplicationFeeCharge(form.email, pid, residentUserId);
          if (charge?.status === "paid") {
            finalizeApplicationSubmit(residentUserId);
            return;
          }

          const listingForPay = prop;
          const managerUserId = listingForPay?.managerUserId?.trim() ?? "";
          if (!managerUserId) {
            showToast("This listing cannot take Stripe payments yet. Contact the manager before submitting.");
            return;
          }

          const amountCents = Math.round(amount * 100);
          setCheckoutBusy(true);
          track("application_fee_payment_started", { property_id: pid || undefined });
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
              showToast(typeof payload.error === "string" ? payload.error : "Could not start bank payment.");
              return;
            }

            const checkoutUrl = typeof payload.url === "string" ? payload.url : "";
            if (checkoutUrl && typeof window !== "undefined") {
              window.location.href = checkoutUrl;
              return;
            }
            showToast("Stripe did not return a checkout URL.");
          } finally {
            setCheckoutBusy(false);
          }
          return;
        }

        if (needsFee && (payChannel === "zelle" || payChannel === "venmo" || payChannel === "other")) {
          const e = validateRentalWizardStep(12, form);
          if (countValidationErrors(e) > 0) {
            setErrors(e);
            showToast("Please confirm your application fee payment before submitting.");
            queueMicrotask(() =>
              scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[12] ?? [], e),
            );
            return;
          }
          ensurePendingApplicationFeeCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId,
            propertyId: pid,
          });
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
      setMaxStepReached((m) => nextWizardMaxReached(m, 12));
      setErrors({});
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const e = validateRentalWizardStep(step, form);
    setErrors(e);
    if (countValidationErrors(e) > 0) {
      showToast("Please fix the highlighted fields before continuing.");
      queueMicrotask(() =>
        scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[step] ?? [], e),
      );
      return;
    }
    if (step === 1 && maxStepReached < 2) {
      track("rental_application_started", { property_id: form.propertyId || undefined });
    }
    if (step === 3) {
      const approvedConflict = form.roomChoice1
        ? isRoomApprovedConflict(form.roomChoice1, form.leaseStart, form.leaseEnd)
        : false;
      const pendingConflict = !approvedConflict && form.roomChoice1
        ? isRoomPendingConflict(form.roomChoice1, form.leaseStart, form.leaseEnd)
        : false;
      setShowAvailabilityWarnings(approvedConflict || pendingConflict);
      if (approvedConflict) {
        showToast("Your first-choice room may be unavailable for those move-in dates, but your application can still continue.");
      } else if (pendingConflict) {
        showToast("Someone else has already applied for your first-choice room on those dates, but your application can still continue.");
      }
    }
    if (reviewReturnStep != null && reviewReturnStep === step) {
      setStep(11);
      setReviewReturnStep(null);
    } else {
      const next = step + 1;
      setStep(next);
      setMaxStepReached((m) => nextWizardMaxReached(m, next));
    }
    setErrors({});
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (step <= 1) {
      exitApplication();
      return;
    }
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
    if (step - 1 === 3) setShowAvailabilityWarnings(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const meta = STEP_META[step - 1];
  const progressPct = Math.round((step / RENTAL_WIZARD_STEP_COUNT) * 100);

  return (
    <div className="rental-wizard mx-auto max-w-3xl px-4 py-5 sm:py-14">
      {applicationPath === "signer" && !postSubmit ? (
        <div className="rental-wizard-exit-row mb-2 sm:mb-3">
          <RentalWizardExitButton onClick={exitApplication} />
        </div>
      ) : null}

      <div className="rental-wizard-page-title text-center sm:text-left">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">Rental application</h1>
      </div>

      {!linkedPropertyId ? (
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-[0_16px_48px_-28px_rgba(15,23,42,0.18)] sm:mt-6 sm:rounded-3xl sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted/70">Choose your form</p>
        <div className="mt-3 sm:mt-4">
          <SegmentedTwo
            value={applicationPath}
            onChange={setApplicationPath}
            left={{ id: "signer", label: "Signer form" }}
            right={{ id: "cosigner", label: "Co-signer form" }}
            className="max-w-md"
          />
        </div>
        <p className="rental-wizard-form-hint mt-3 text-sm leading-relaxed text-muted sm:mt-4">
          {applicationPath === "signer"
            ? "Use the signer form if you are the main applicant for the lease."
            : "Filing as a co-signer on someone else's application? Open the co-signer form."}
        </p>
        {applicationPath === "cosigner" ? (
          <div className="mt-4 sm:mt-5">
            <Link href="/rent/apply/cosigner" className="inline-flex">
              <Button type="button" className="min-h-[44px] px-5 sm:min-h-[48px] sm:px-6">
                Open co-signer form
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
      ) : null}

      {applicationPath === "signer" ? (
        !linkedPropertyId || !linkedProperty ? (
          <div className="mt-8">
            <ManagerLinkGate
              title="Open your manager’s apply link"
              body={
                linkedPropertyId && !linkedProperty
                  ? "This property link is invalid or no longer active. Ask your property manager for a new apply link."
                  : "Applications start from a link your property manager shares after you find a unit on Zillow, Redfin, or elsewhere."
              }
            />
          </div>
        ) : postSubmit ? (
          <RentalApplicationFinishPanel
            axisId={postSubmit.axisId}
            email={postSubmit.email}
            emailSent={postSubmit.emailSent}
            syncError={postSubmit.syncError}
            onDone={() => setPostSubmit(null)}
          />
        ) : (
          <div
            className="rental-wizard-shell mt-4 rounded-2xl border border-border bg-card p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.18)] sm:mt-8 sm:rounded-3xl sm:p-9 md:p-11"
            style={{ boxShadow: "0 24px 80px -32px rgba(15,23,42,0.18), 0 1px 0 rgba(255,255,255,0.9) inset" }}
          >
            <div className="rental-wizard-step-header border-b border-border pb-4 sm:pb-6">
              <p className="rental-wizard-step-eyebrow text-[10px] font-bold uppercase tracking-[0.18em] text-muted/70 sm:text-[11px]">
                Step {step} of {RENTAL_WIZARD_STEP_COUNT}
              </p>
              <p className="rental-wizard-step-title mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {meta.title}
              </p>
              <div className="rental-wizard-step-dots -mx-1 mt-3 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:mt-4">
                <div className="flex min-w-max gap-1 px-1">
                  {STEP_META.map((s) => {
                    const reachable = canNavigateToWizardStep(s.n, maxStepReached);
                    const completed = s.n < step;
                    return (
                      <button
                        key={s.n}
                        type="button"
                        disabled={!reachable}
                        title={s.title}
                        onClick={() => goToStep(s.n)}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                          s.n === step
                            ? "bg-primary text-white"
                            : completed
                              ? "bg-primary/15 text-primary"
                              : reachable
                                ? "bg-accent/30 text-muted hover:bg-accent/40"
                                : "cursor-not-allowed bg-accent/30 text-foreground/30"
                        }`}
                      >
                        {completed ? "✓" : s.n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rental-wizard-progress mt-3 h-1.5 overflow-hidden rounded-full bg-accent/30 sm:mt-4 sm:h-2">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="rental-wizard-step-content pt-5 sm:pt-8">
              <RentalWizardStepBody
                step={step}
                form={form}
                errors={errors}
                propertyOptions={propertyOptions}
                propertyLocked={Boolean(linkedProperty)}
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

            <div className="rental-wizard-actions mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:pt-8">
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]"
                onClick={handleBack}
              >
                {step <= 1 ? "Exit application" : reviewReturnStep != null && reviewReturnStep === step ? "Back to review" : "Back"}
              </Button>
              <Button
                type="button"
                className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]"
                onClick={handleContinue}
                disabled={checkoutBusy || submitting}
              >
                {submitting ? "Submitting…" : primaryButtonLabel}
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

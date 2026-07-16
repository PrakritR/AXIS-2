"use client";

import { track } from "@/lib/analytics/track-client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import {
  loadPublicExtraListingsFromServer,
  loadPublicPropertyLeadFromServer,
  PROPERTY_PIPELINE_EVENT,
  isPropertyActiveForLeads,
  readExtraListingsPublic,
} from "@/lib/demo-property-pipeline";
import { filterSandboxFromPublicCatalog } from "@/lib/public-sandbox-listings";
import { isProductionPublicSite } from "@/lib/public-demo-access";
import {
  ensurePendingApplicationFeeCharge,
  findApplicationFeeCharge,
  HOUSEHOLD_CHARGES_EVENT,
  markApplicationFeePaidAfterStripe,
  recordApplicationCharges,
} from "@/lib/household-charges";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getBundleOptionsForProperty,
  getPropertyById,
  getPropertyForPublicLink,
  getRoomOptionsForProperty,
  isEntireHomeProperty,
  isPropertyRentedByRoom,
  isRoomApprovedConflict,
  isRoomPendingConflict,
  LISTING_ROOM_CHOICE_SEP,
} from "@/lib/rental-application/data";
import { resolveApplicationFeePayChannel, isAchApplicationFeeChannel } from "@/lib/rental-application/application-fee-channel";
import { clearRentalWizardDraft, loadRentalWizardDraft, loadRentalWizardDraftAxisId, saveRentalWizardDraft, saveRentalWizardDraftAxisId } from "@/lib/rental-application/drafts";
import {
  applicationsForResidentEmail,
  residentApplicationFeeGate,
  residentApplicationSubmitBlocked,
} from "@/lib/rental-application/application-policy";
import {
  isInProgressApplicationRow,
  syncInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
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
  replaceManagerApplicationRowInCache,
  syncManagerApplicationsFromServer,
  syncPublicApprovedApplicationsFromServer,
  upsertApplicationRowToServerAwait,
} from "@/lib/manager-applications-storage";
import { RentalWizardStepBody } from "./rental-wizard-steps";
import { ManagerLinkGate } from "@/components/marketing/manager-link-gate";
import { RentalApplicationFinishPanel } from "@/components/marketing/rental-application-finish-panel";
import { canNavigateToWizardStep, nextWizardMaxReached } from "@/lib/wizard-step-nav";
import { residentBrowseFromApplicationHref } from "@/lib/resident-public-nav";
<<<<<<< HEAD
import { isDemoModeActive, DEMO_GUIDED_USER_ID } from "@/lib/demo/demo-session";
import { buildDemoApplicationAutofill } from "@/lib/demo/demo-application-autofill";
import {
  DEMO_APPLICATION_SUBMITTED_EVENT,
  DEMO_CLOSE_RESIDENT_APPLY_EVENT,
  DEMO_RENTAL_AUTOFILL_EVENT,
} from "@/lib/demo/demo-playback";
=======
import { portalNavClick } from "@/lib/portal-nav-client";
>>>>>>> fm/captain-wip-ship-s1

const processedApplicationFeeSessions = new Set<string>();

export type RentalApplicationWizardMode = "public" | "portal";

export type RentalApplicationWizardProps = {
  showToast: (msg: string) => void;
  mode?: RentalApplicationWizardMode;
  exitPath?: string;
  sessionEmail?: string;
  /** Portal table layout — drops the standalone page chrome. */
  layout?: "standalone" | "embedded";
  /** Demo / embedded portal apply when URL search params are unavailable. */
  linkedPropertyId?: string;
};

function makeNewApplicationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `PROPLANE-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }
  return `PROPLANE-${Date.now().toString(36).toUpperCase()}`;
}

function ensureRentalWizardAxisId(): string {
  const existing = loadRentalWizardDraftAxisId()?.trim();
  if (existing) return existing;
  const id = makeNewApplicationId();
  saveRentalWizardDraftAxisId(id);
  return id;
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

function rentalApplicationApplyPath(mode: RentalApplicationWizardMode): string {
  return mode === "portal" ? "/resident/applications/apply" : "/rent/apply";
}

export function RentalApplicationWizard({
  showToast,
  mode = "public",
  exitPath,
  sessionEmail,
  layout = "standalone",
  linkedPropertyId: linkedPropertyIdProp,
}: RentalApplicationWizardProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">Loading application…</div>
      }
    >
      <RentalApplicationWizardInner
        showToast={showToast}
        mode={mode}
        exitPath={exitPath}
        sessionEmail={sessionEmail}
        layout={layout}
        linkedPropertyId={linkedPropertyIdProp}
      />
    </Suspense>
  );
}

function RentalApplicationWizardInner({
  showToast,
  mode = "public",
  exitPath,
  sessionEmail,
  layout = "standalone",
  linkedPropertyId: linkedPropertyIdProp,
}: RentalApplicationWizardProps) {
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
    guestFlow?: boolean;
    mailtoHref?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAvailabilityWarnings, setShowAvailabilityWarnings] = useState(false);
  const [demoAutofillSubmitPending, setDemoAutofillSubmitPending] = useState(false);
  /** Bumps after server sync so step 3 room dropdowns re-filter against approved occupancy. */
  const [occupancySyncEpoch, setOccupancySyncEpoch] = useState(0);
  const router = useRouter();
  const wizardApplyPath = rentalApplicationApplyPath(mode);
  const browseHomesHref = residentBrowseFromApplicationHref(wizardApplyPath);

  useEffect(() => {
    if (mode !== "portal" || postSubmit || isDemoModeActive()) return;
    const params = new URLSearchParams(searchParams.toString());
    const prev = params.get("wizardStep");
    if (step <= 3) {
      const next = String(step);
      if (prev === next) return;
      params.set("wizardStep", next);
    } else if (prev) {
      params.delete("wizardStep");
    } else {
      return;
    }
    const qs = params.toString();
    router.replace(qs ? `${wizardApplyPath}?${qs}` : wizardApplyPath, { scroll: false });
  }, [mode, postSubmit, router, searchParams, step, wizardApplyPath]);

<<<<<<< HEAD
  const exitApplication = useCallback(() => {
    if (isDemoModeActive()) {
      window.dispatchEvent(new Event(DEMO_CLOSE_RESIDENT_APPLY_EVENT));
      return;
    }
    router.push(wizardExitPath);
  }, [router, wizardExitPath]);
=======
  const browseHomesHref = useMemo(() => {
    const qs = searchParams.toString();
    const applyPath = qs ? `${wizardApplyPath}?${qs}` : wizardApplyPath;
    return residentBrowseFromApplicationHref(applyPath);
  }, [searchParams, wizardApplyPath]);

  const onBrowseHomesClick = useMemo(
    () => portalNavClick(router, browseHomesHref, { preferFullNavigation: true }),
    [browseHomesHref, router],
  );
>>>>>>> fm/captain-wip-ship-s1

  const listingPrefillKey = useMemo(() => {
    return [
      searchParams.get("propertyId") ?? "",
      searchParams.get("roomName") ?? "",
      searchParams.get("floor") ?? "",
      searchParams.get("roomPrice") ?? "",
      searchParams.get("listingRoomId") ?? "",
      searchParams.get("bundle") ?? "",
    ].join("|");
  }, [searchParams]);

  const linkedPropertyId =
    linkedPropertyIdProp?.trim() || searchParams.get("propertyId")?.trim() || "";

  /** listingPrefillKey already applied to the form — prevents re-clobbering user edits when catalogs refresh. */
  const listingPrefillAppliedRef = useRef("");

  useEffect(() => {
    void syncPublicApprovedApplicationsFromServer().then(() => setOccupancySyncEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    if (mode !== "portal" || linkedPropertyId) return;
    void loadPublicExtraListingsFromServer().then(() => setExtrasTick((n) => n + 1));
  }, [mode, linkedPropertyId]);

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
    if (!isDemoModeActive()) return;
    const onAutofill = (e: Event) => {
      const detail = (e as CustomEvent<{
        propertyId?: string;
        form?: RentalWizardFormState;
        submitAfter?: boolean;
      }>).detail;
      const pid = detail?.propertyId?.trim();
      if (!pid) return;
      const next = detail?.form ?? buildDemoApplicationAutofill(pid);
      setForm(next);
      setMaxStepReached(RENTAL_WIZARD_STEP_COUNT);
      setStep(detail?.submitAfter ? RENTAL_WIZARD_STEP_COUNT : 1);
      setErrors({});
      clearRentalWizardDraft();
      saveRentalWizardDraft(next);
      saveRentalWizardDraftAxisId(ensureRentalWizardAxisId());
      if (detail?.submitAfter) setDemoAutofillSubmitPending(true);
    };
    window.addEventListener(DEMO_RENTAL_AUTOFILL_EVENT, onAutofill as EventListener);
    return () => window.removeEventListener(DEMO_RENTAL_AUTOFILL_EVENT, onAutofill as EventListener);
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
    if (mode === "portal" && !linkedPropertyId) {
      return filterSandboxFromPublicCatalog(readExtraListingsPublic(), {
        production: isProductionPublicSite(),
      })
        .filter(isPropertyActiveForLeads)
        .map((property) => ({ value: property.id, label: property.title }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (!linkedPropertyId) return [];
    const prop = getPropertyForPublicLink(linkedPropertyId);
    if (!prop) return [];
    return [{ value: prop.id, label: prop.title }];
  }, [extrasTick, linkedPropertyId, mode]);

  const linkedProperty = useMemo(() => {
    void extrasTick;
    if (linkedPropertyId) return getPropertyForPublicLink(linkedPropertyId);
    if (mode === "portal") {
      const pid = form.propertyId.trim();
      if (!pid) return undefined;
      return getPropertyForPublicLink(pid) ?? getPropertyById(pid);
    }
    return undefined;
  }, [extrasTick, form.propertyId, linkedPropertyId, mode]);

  const canRenderWizard = useMemo(() => {
    if (mode === "portal") {
      if (linkedPropertyId) return Boolean(linkedProperty);
      return true;
    }
    return Boolean(linkedPropertyId && linkedProperty);
  }, [linkedProperty, linkedPropertyId, mode]);

  useEffect(() => {
    if (mode !== "portal") return;
    const email = sessionEmail?.trim();
    if (!email?.includes("@")) return;
    queueMicrotask(() => {
      setForm((prev) => (prev.email.trim() ? prev : { ...prev, email }));
    });
  }, [mode, sessionEmail]);

  useEffect(() => {
    if (!draftReady) return;
    saveRentalWizardDraft(form);
  }, [draftReady, form]);

  useEffect(() => {
    if (!draftReady || mode !== "portal") return;
    const email = form.email.trim();
    const pid = form.propertyId.trim();
    if (!email.includes("@") || !pid) return;
    const axisId = ensureRentalWizardAxisId();
    syncInProgressApplicationRow({ axisId, form, residentEmail: email });
  }, [draftReady, mode, form]);

  useEffect(() => {
    if (!draftReady || mode !== "portal") return;
    const email = (sessionEmail ?? form.email).trim().toLowerCase();
    if (!email.includes("@")) return;
    if (loadRentalWizardDraft()) return;

    let cancelled = false;
    void syncManagerApplicationsFromServer({ force: true }).then(() => {
      if (cancelled || loadRentalWizardDraft()) return;
      const inProgress = applicationsForResidentEmail(email).filter(isInProgressApplicationRow);
      if (inProgress.length === 0) return;
      const linkedPid = searchParams.get("propertyId")?.trim();
      const hit =
        (linkedPid ? inProgress.find((row) => (row.propertyId?.trim() || row.application?.propertyId?.trim()) === linkedPid) : undefined) ??
        inProgress[0];
      if (!hit?.application) return;
      saveRentalWizardDraftAxisId(hit.id);
      saveRentalWizardDraft({ ...createInitialRentalWizardState(), ...hit.application, email });
      queueMicrotask(() => {
        setForm({ ...createInitialRentalWizardState(), ...hit.application, email });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [draftReady, form.email, mode, searchParams, sessionEmail]);

  useEffect(() => {
    if (!draftReady) return;
    const pid = searchParams.get("propertyId")?.trim();
    if (!pid) return;
    if (listingPrefillAppliedRef.current === listingPrefillKey) return;
    // Public listings load async on a cold browser — hold the prefill until the
    // property resolves so room/bundle auto-select doesn't silently miss
    // (extrasTick re-runs this effect as catalogs arrive).
    void extrasTick;
    if (!getPropertyById(pid)) return;
    listingPrefillAppliedRef.current = listingPrefillKey;

    const listingRoomId = searchParams.get("listingRoomId") ?? "";
    const bundleParam = (searchParams.get("bundle") ?? "").trim();

    queueMicrotask(() => {
      setForm((prev) => {
        const opts = getRoomOptionsForProperty(pid, { includeUnavailable: true }).filter((o) => o.value);
        // Entire-home listings apply for the whole place — never pre-select a
        // bedroom, even when the listing page passed a room id for display.
        const entireHome = isEntireHomeProperty(pid);
        let room1 = entireHome ? pid : opts[0]?.value ?? "";
        const lr = listingRoomId.trim();
        if (lr && !entireHome) {
          const composite = `${pid}${LISTING_ROOM_CHOICE_SEP}${lr}`;
          const hit = opts.find((o) => o.value === composite);
          if (hit) room1 = hit.value;
        }

        // "Apply for this bundle" — pre-select the bundle when it matches a
        // manager-defined bundle on this listing. A bundle application on a
        // by-room listing carries no ranked room choices.
        const bundleId = bundleParam && getBundleOptionsForProperty(pid).some((o) => o.value === bundleParam)
          ? bundleParam
          : "";
        const bundleReplacesRooms = Boolean(bundleId) && isPropertyRentedByRoom(pid);

        return {
          ...prev,
          propertyId: pid,
          bundleId,
          roomChoice1: bundleReplacesRooms ? "" : room1 || prev.roomChoice1,
          roomChoice2: "",
          roomChoice3: "",
          // A restored draft may hold answers for a different listing's questions.
          ...(prev.propertyId && prev.propertyId !== pid ? { customFieldAnswers: [] } : {}),
        };
      });
    });
  }, [draftReady, extrasTick, listingPrefillKey, searchParams]);

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
    if (Object.keys(p).some((k) => ["propertyId", "roomChoice1", "roomChoice2", "roomChoice3", "bundleId", "rentalType", "leaseTerm", "leaseStart", "leaseEnd"].includes(k))) {
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
    const gate = residentApplicationFeeGate({
      propertyId: pid,
      residentEmail: email,
      residentUserId: feeStepUserId,
    });
    return {
      needsFee: gate.needsFee,
      paid: gate.paid,
      displayLabel: gate.displayLabel,
      amount: gate.amount,
      waived: gate.waived,
    };
  }, [form.propertyId, form.email, feeStepUserId, chargeTick]);

  const finalizeApplicationSubmit = useCallback(
    async (residentUserId: string | null) => {
      if (submitting) return;
      const pid = form.propertyId.trim();
      const emailTrim = form.email.trim();
      const block = residentApplicationSubmitBlocked({
        propertyId: pid,
        residentEmail: emailTrim,
        roomChoice1: form.roomChoice1,
      });
      if (block.blocked) {
        showToast(block.reason ?? "You cannot submit another application for this listing.");
        return;
      }
      setSubmitting(true);
      const prop = pid ? getPropertyById(pid) : undefined;
      const axisId = loadRentalWizardDraftAxisId()?.trim() || makeNewApplicationId();
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

      replaceManagerApplicationRowInCache(applicationRow);
      const sync = await upsertApplicationRowToServerAwait(applicationRow);

      let emailSent = false;
      let mailtoHref: string | undefined;
      const propertyTitle = (listing?.title?.trim() || pid.trim()) || undefined;
      const isGuestSubmit = !residentUserId && !isDemoModeActive();
      if (sync.ok && emailTrim.includes("@") && isGuestSubmit) {
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
          const payload = (await res.json().catch(() => ({}))) as { mailtoHref?: string };
          emailSent = res.ok;
          if (typeof payload.mailtoHref === "string" && payload.mailtoHref.startsWith("mailto:")) {
            mailtoHref = payload.mailtoHref;
          }
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
      setChargeTick((n) => n + 1);
      setSubmitting(false);
      if (mode === "portal" && sync.ok) {
        showToast("Application submitted.");
        if (isDemoModeActive()) {
          window.dispatchEvent(
            new CustomEvent(DEMO_APPLICATION_SUBMITTED_EVENT, { detail: { axisId } }),
          );
          return;
        }
        router.replace("/resident/applications");
        return;
      }
      setPostSubmit({
        axisId,
        email: emailTrim,
        propertyTitle,
        emailSent,
        syncError: sync.ok ? undefined : sync.error,
        guestFlow: isGuestSubmit,
        mailtoHref,
      });
      if (sync.ok) {
        showToast("Application submitted.");
      } else {
        showToast(sync.error ?? "Application saved locally but could not sync to server. Try again.");
      }
    },
    [form, mode, router, showToast, submitting],
  );

  useEffect(() => {
    if (!demoAutofillSubmitPending || !isDemoModeActive()) return;
    setDemoAutofillSubmitPending(false);
    void finalizeApplicationSubmit(DEMO_GUIDED_USER_ID);
  }, [demoAutofillSubmitPending, finalizeApplicationSubmit, form]);

  const primaryButtonLabel = useMemo(() => {
    if (step === 3) {
      const stepErrors = validateRentalWizardStep(3, form);
      if (countValidationErrors(stepErrors) > 0) return "Search house";
    }
    if (step !== 12) return "Continue";
    if (!applicationFeeGate.needsFee) return submitting ? "Submitting…" : "Submit application";
    const prop = form.propertyId.trim() ? getPropertyById(form.propertyId.trim()) : undefined;
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
    form,
    form.propertyId,
    form.email,
    form.applicationFeePayChannel,
    checkoutBusy,
    applicationFeeGate.paid,
    submitting,
  ]);

  useEffect(() => {
    if (!draftReady || isDemoModeActive()) return;
    const feeCheckout = searchParams.get("fee_checkout");
    if (feeCheckout === "cancel") {
      showToast("Checkout cancelled. You can try again when you are ready.");
      router.replace(wizardApplyPath);
      return;
    }
    if (feeCheckout !== "success") return;
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) return;

    const pid = form.propertyId.trim();
    const em = form.email.trim();
    if (!pid || !em.includes("@")) return;

    if (processedApplicationFeeSessions.has(sessionId)) {
      router.replace(wizardApplyPath);
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
        router.replace(wizardApplyPath);
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
          router.replace(wizardApplyPath);
          return;
        }
        showToast(typeof data.error === "string" ? data.error : "Payment not completed yet.");
        router.replace(wizardApplyPath);
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
        router.replace(wizardApplyPath);
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
        router.replace(wizardApplyPath);
        return;
      }
      setChargeTick((n) => n + 1);
      processedApplicationFeeSessions.add(sessionId);
      finalizeApplicationSubmit(feeStepUserId);
      router.replace(wizardApplyPath);
    })();
  }, [draftReady, searchParams, form.propertyId, form.email, form.fullLegalName, feeStepUserId, router, showToast, finalizeApplicationSubmit, wizardApplyPath]);

  const handleContinue = () => {
    if (step === 12) {
      if (!validateAllPrior()) return;
      void (async () => {
        if (isDemoModeActive()) {
          finalizeApplicationSubmit(feeStepUserId ?? DEMO_GUIDED_USER_ID);
          return;
        }
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
        const feeGate = residentApplicationFeeGate({
          propertyId: pid,
          residentEmail: emailTrim,
          residentUserId,
        });
        const needsFee = feeGate.needsFee;

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

          const amountCents = Math.round(feeGate.amount * 100);
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
                returnPath: wizardApplyPath,
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
    if (step - 1 === 3) setShowAvailabilityWarnings(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const meta = STEP_META[step - 1];
  const progressPct = Math.round((step / RENTAL_WIZARD_STEP_COUNT) * 100);
  const embedded = layout === "embedded";

  return (
    <div
      className={
        embedded
          ? "rental-wizard rental-wizard--embedded"
          : "rental-wizard mx-auto max-w-3xl px-4 py-5 sm:py-14"
      }
    >
      {!embedded ? (
        <div className="rental-wizard-page-title text-center sm:text-left">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">Rental application</h1>
        </div>
      ) : null}

      {!linkedPropertyId && mode !== "portal" ? (
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
        !canRenderWizard ? (
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
            guestFlow={postSubmit.guestFlow}
            mailtoHref={postSubmit.mailtoHref}
            onDone={() => setPostSubmit(null)}
          />
        ) : (
          <div
            className={
              embedded
                ? "rental-wizard-shell rounded-2xl border border-border bg-card p-4 sm:p-6"
                : "rental-wizard-shell mt-4 rounded-2xl border border-border bg-card p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.18)] sm:mt-8 sm:rounded-3xl sm:p-9 md:p-11 [html[data-theme=dark]_&]:shadow-[0_24px_80px_-32px_rgba(0,0,0,0.55)] [html[data-theme=dark]_&]:ring-1 [html[data-theme=dark]_&]:ring-white/8"
            }
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
                              ? "bg-primary/15 text-primary [html[data-theme=dark]_&]:bg-primary/28 [html[data-theme=dark]_&]:text-white"
                              : reachable
                                ? "bg-accent/30 text-muted hover:bg-accent/40 [html[data-theme=dark]_&]:bg-white/10 [html[data-theme=dark]_&]:text-white/70 [html[data-theme=dark]_&]:hover:bg-white/14"
                                : "cursor-not-allowed bg-accent/25 text-muted/80 [html[data-theme=dark]_&]:bg-white/8 [html[data-theme=dark]_&]:text-white/42"
                        }`}
                      >
                        {completed ? "✓" : s.n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rental-wizard-progress mt-3 h-1.5 overflow-hidden rounded-full bg-accent/30 sm:mt-4 sm:h-2 [html[data-theme=dark]_&]:bg-white/10">
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
                mode={mode}
                propertyOptions={propertyOptions}
                propertyLocked={Boolean(linkedPropertyId && linkedProperty)}
                emailLocked={mode === "portal" && Boolean(sessionEmail?.includes("@"))}
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

            <div
              className={`rental-wizard-actions mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:mt-10 sm:pt-8 ${
                step > 1 ? "sm:flex-row sm:items-center sm:justify-between" : "sm:justify-end"
              }`}
            >
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="order-2 w-full min-h-[48px] sm:order-1 sm:w-auto sm:min-w-[120px]"
                  onClick={handleBack}
                >
                  {reviewReturnStep != null && reviewReturnStep === step ? "Back to review" : "Back"}
                </Button>
              ) : null}
              <Button
                type="button"
<<<<<<< HEAD
                variant="outline"
                className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]"
                onClick={handleBack}
              >
                {step <= 1
                  ? embedded
                    ? "Cancel"
                    : "Exit application"
                  : reviewReturnStep != null && reviewReturnStep === step
                    ? "Back to review"
                    : "Back"}
              </Button>
              <Button
                type="button"
                className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]"
                data-attr="rental-wizard-continue"
=======
                className="order-1 w-full min-h-[48px] sm:order-2 sm:w-auto sm:min-w-[200px]"
>>>>>>> fm/captain-wip-ship-s1
                onClick={handleContinue}
                disabled={checkoutBusy || submitting}
              >
                {submitting ? "Submitting…" : primaryButtonLabel}
              </Button>
            </div>
<<<<<<< HEAD
            {step <= 3 ? (
              <p className="rental-wizard-browse-homes mt-4 text-center text-sm">
                <Link
                  href={browseHomesHref}
                  data-attr="rental-wizard-browse-homes"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Browse homes
=======
            {mode === "portal" && step <= 3 ? (
              <p className="rental-wizard-browse-homes mt-5 text-center text-sm text-muted sm:mt-6">
                <Link
                  href={browseHomesHref}
                  onClick={onBrowseHomesClick}
                  data-attr="resident-apply-browse-homes"
                  className="font-semibold text-primary hover:opacity-90"
                >
                  Browse home
>>>>>>> fm/captain-wip-ship-s1
                </Link>
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

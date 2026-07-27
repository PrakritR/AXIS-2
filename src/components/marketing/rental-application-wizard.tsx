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
  ensurePendingHoldingDepositCharge,
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
  findInProgressRowForTarget,
  isInProgressApplicationRow,
  markApplicationSubmitInitiated,
  shouldSyncInProgressDraft,
  syncInProgressApplicationRow,
  targetMatchesApplication,
  type ApplicationRequestTarget,
} from "@/lib/rental-application/in-progress-application";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { GroupRole, RentalWizardErrors, RentalWizardFormState } from "@/lib/rental-application/types";
import { resolveSubmitGroupId } from "@/lib/rental-application/application-groups";
import {
  computeLeaseEndDate,
  normalizeIsoDateInput,
  shouldAutoComputeLeaseEnd,
} from "@/lib/rental-application/lease-dates";
import { RENTAL_WIZARD_STEP_COUNT } from "@/lib/rental-application/types";
import { digitsOnly, maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";
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
import { isDemoModeActive, DEMO_GUIDED_USER_ID } from "@/lib/demo/demo-session";
import { buildDemoApplicationAutofill } from "@/lib/demo/demo-application-autofill";
import {
  DEMO_APPLICATION_SUBMITTED_EVENT,
  DEMO_CLOSE_RESIDENT_APPLY_EVENT,
  DEMO_RENTAL_AUTOFILL_EVENT,
} from "@/lib/demo/demo-playback";

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

function rentalApplicationExitPath(mode: RentalApplicationWizardMode, exitPath?: string): string {
  if (exitPath?.startsWith("/")) return exitPath;
  return mode === "portal" ? "/resident/applications" : "/auth/sign-in";
}

function rentalApplicationApplyPath(mode: RentalApplicationWizardMode): string {
  return mode === "portal" ? "/resident/applications/apply" : "/rent/apply";
}

function wizardTargetFromParam(
  searchParams: { get: (key: string) => string | null },
): ApplicationRequestTarget | null {
  const propertyId = searchParams.get("propertyId")?.trim() || "";
  if (!propertyId) return null;
  return {
    propertyId,
    listingRoomId: searchParams.get("listingRoomId")?.trim() || undefined,
    bundleId: searchParams.get("bundle")?.trim() || undefined,
  };
}

function wizardTargetSignature(target: ApplicationRequestTarget | null): string {
  if (!target) return "";
  return [target.propertyId, target.listingRoomId ?? "", target.bundleId ?? ""].join("::");
}

/**
 * True when `el` is actually rendered on screen (has a layout box), as
 * opposed to a CSS-hidden (`display:none`) duplicate. `offsetParent` is null
 * for `display:none` elements AND their descendants, which is exactly the
 * signal needed to tell a `lg:hidden` / `hidden lg:block` duplicate mount
 * apart from the one the resident is actually looking at.
 */
export function isElementOnScreen(el: HTMLElement | null): boolean {
  return Boolean(el?.offsetParent);
}

/** `wizardStep` is only ever written for steps 1-3 (see the step-tracking effect below), so a value outside that range is never trustworthy. */
function parseBoundedWizardStep(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3) return null;
  return parsed;
}

/**
 * The portal-mode step effect below writes `?wizardStep=N` to the URL for
 * steps 1-3 (removing it above step 3) so a resumed session can land back
 * where it left off — but nothing ever READ it back on mount, so `step`
 * always started at `useState(1)` regardless of the URL. Any remount while
 * on steps 1-3 (a real page reload, or the browser restoring a tab) therefore
 * silently threw the resident back to "Group Application" even though their
 * draft — property, room, everything — was intact. Only trust the param when
 * the locally-loaded draft still matches THIS request's target; otherwise a
 * stale `wizardStep` left over from a different property/room must not skip
 * a fresh application ahead. This covers the fast path where the in-memory
 * draft (module-level, not persisted to disk) survived — e.g. a remount
 * within the same tab. A genuine full-page reload wipes that draft entirely,
 * so the reconciliation effect below ALSO restores `step` once it confirms
 * (via a server fetch) that this target really does match an existing
 * in-progress application. See `tests/unit/rental-wizard-step-resume.test.tsx`.
 */
export function initialWizardStepFromRequest(
  mode: RentalApplicationWizardMode,
  target: ApplicationRequestTarget | null,
  searchParams: { get: (key: string) => string | null },
): number {
  if (mode !== "portal") return 1;
  const parsed = parseBoundedWizardStep(searchParams.get("wizardStep"));
  if (!parsed) return 1;
  const draft = loadRentalWizardDraft();
  if (!draft) return 1;
  if (target && !targetMatchesApplication(target, { application: draft })) return 1;
  return parsed;
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
  const requestedTarget = mode === "portal" ? wizardTargetFromParam(searchParams) : null;
  const requestedTargetSignature = wizardTargetSignature(requestedTarget);
  const [applicationPath, setApplicationPath] = useState<"signer" | "cosigner">("signer");
  const [step, setStep] = useState(() => initialWizardStepFromRequest(mode, requestedTarget, searchParams));
  const [maxStepReached, setMaxStepReached] = useState(() => initialWizardStepFromRequest(mode, requestedTarget, searchParams));
  // Frozen at mount, from the URL as it arrived — NOT re-read later. The
  // step-tracking effect below fires on the very first render (since `step`
  // starts at 1 whenever the local draft fast path above didn't apply) and
  // immediately overwrites `?wizardStep=` to match, so by the time the async
  // reconciliation effect's server fetch resolves, `searchParams.get(
  // "wizardStep")` would already read back that clobbered "1" instead of the
  // real value the resident's browser actually requested — losing the resume
  // step in exactly the full-reload case this exists to fix.
  const initialWizardStepParamRef = useRef(searchParams.get("wizardStep"));
  const [form, setForm] = useState<RentalWizardFormState>(() => {
    const draft = loadRentalWizardDraft();
    if (!draft) return createInitialRentalWizardState();
    // A draft still loaded (same tab, no reload) for a DIFFERENT property/room
    // than this request must never flash onto a fresh apply — start blank and
    // let the reconciliation effect resolve the real target (an existing
    // in-progress application for it, or a clean new one).
    if (requestedTarget && !targetMatchesApplication(requestedTarget, { application: draft })) {
      return createInitialRentalWizardState();
    }
    return { ...createInitialRentalWizardState(), ...draft };
  });
  // Tracks which target signature has been confirmed (matched to an existing
  // in-progress application, or confirmed fresh) by the reconciliation effect.
  // While it disagrees with the CURRENT requested target, no other effect may
  // mint a new axis id or sync/create an application row — otherwise a reload
  // can create a duplicate before the async server lookup below has a chance
  // to find the real match. Mirrors the `form` initializer's own draft-match
  // check (rather than sharing it via a ref, which render may not read/write).
  //
  // A local draft ALONE is not proof this target was already reconciled: on a
  // fresh navigation, the listing-prefill effect can populate a brand-new
  // draft's propertyId/room from the SAME URL before this ever runs, which
  // would coincidentally "match" a target it has never actually checked
  // against the server. Only an already-saved axis id proves this exact
  // session already resolved (found-or-created) a real application for it.
  const [reconciledSignature, setReconciledSignature] = useState<string>(() => {
    if (!loadRentalWizardDraftAxisId()?.trim()) return "";
    const draft = loadRentalWizardDraft();
    const matchedTarget = !draft
      ? !requestedTarget
      : !requestedTarget || targetMatchesApplication(requestedTarget, { application: draft });
    return matchedTarget ? requestedTargetSignature : "";
  });
  const isReconcilingTarget = Boolean(requestedTargetSignature) && reconciledSignature !== requestedTargetSignature;
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
    setupHref?: string;
    /** Shared Group ID for group applications (first applicant shares it, joining members paste it). */
    groupId?: string;
    groupRole?: GroupRole;
    groupSize?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAvailabilityWarnings, setShowAvailabilityWarnings] = useState(false);
  const [demoAutofillSubmitPending, setDemoAutofillSubmitPending] = useState(false);
  /** Bumps after server sync so step 3 room dropdowns re-filter against approved occupancy. */
  const [occupancySyncEpoch, setOccupancySyncEpoch] = useState(0);
  const [applicationFeeCheckBusy, setApplicationFeeCheckBusy] = useState(false);
  const [applicationFeeCheckError, setApplicationFeeCheckError] = useState<string | null>(null);
  const router = useRouter();
  const wizardExitPath = rentalApplicationExitPath(mode, exitPath);
  const wizardApplyPath = rentalApplicationApplyPath(mode);
  const browseHomesHref = residentBrowseFromApplicationHref(wizardApplyPath);
  /**
   * `ResidentApplicationsPanel` renders an expanded in-progress row's detail
   * TWICE per row — once inside the `lg:hidden` mobile card list, once inside
   * the `hidden lg:block` desktop table — so CSS, not React, decides which
   * is on screen. Both mounts are fully live `RentalApplicationWizardInner`
   * instances with independent `step` state. Without this guard, the
   * off-screen instance's `step` never advances (it receives no clicks), so
   * its copy of THIS effect kept firing on every `searchParams` change and
   * rewriting `?wizardStep=` back down to whatever ITS stale `step` was —
   * fighting the on-screen instance's own writes in an unthrottled
   * `router.replace` loop, hundreds of times per second. That is the actual
   * "glitches and goes back to start of application" the captain saw: only
   * the ON-SCREEN instance may own the URL's step bookkeeping.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const isOnScreen = useCallback(() => isElementOnScreen(rootRef.current), []);

  useEffect(() => {
    if (mode !== "portal" || postSubmit || isDemoModeActive() || !isOnScreen()) return;
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
  }, [mode, postSubmit, router, searchParams, step, wizardApplyPath, isOnScreen]);

  const exitApplication = useCallback(() => {
    if (isDemoModeActive()) {
      window.dispatchEvent(new Event(DEMO_CLOSE_RESIDENT_APPLY_EVENT));
      return;
    }
    router.push(wizardExitPath);
  }, [router, wizardExitPath]);

  const listingPrefillKey = useMemo(() => {
    return [
      searchParams.get("propertyId") ?? "",
      searchParams.get("roomName") ?? "",
      searchParams.get("floor") ?? "",
      searchParams.get("roomPrice") ?? "",
      searchParams.get("listingRoomId") ?? "",
      searchParams.get("bundle") ?? "",
      searchParams.get("phone") ?? "",
    ].join("|");
  }, [searchParams]);

  const linkedPropertyId =
    linkedPropertyIdProp?.trim() || searchParams.get("propertyId")?.trim() || "";

  /** listingPrefillKey already applied to the form — prevents re-clobbering user edits when catalogs refresh. */
  const listingPrefillAppliedRef = useRef("");
  const startedSetupEmailAxisRef = useRef<string | null>(null);

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
    // The off-screen duplicate mount (see the `isOnScreen` doc comment above)
    // must never write the shared, module-level draft: its `form` only holds
    // whatever it last reconciled and never receives the resident's actual
    // edits, so a later write from it would silently revert the on-screen
    // instance's fresher data the next time either instance reloads that
    // draft — the "room never lands on the application row" half of the bug.
    if (!draftReady || !isOnScreen()) return;
    saveRentalWizardDraft(form);
  }, [draftReady, form, isOnScreen]);

  useEffect(() => {
    if (!draftReady || !isOnScreen()) return;
    // Wait for reconciliation to confirm this target before minting an axis id
    // or writing anything to the server — otherwise a fresh page load can sync
    // a brand-new row before the async lookup below finds the real match.
    if (mode === "portal" && isReconcilingTarget) return;
    const email = (mode === "portal" ? sessionEmail ?? form.email : form.email).trim();
    const pid = form.propertyId.trim();
    if (!shouldSyncInProgressDraft({ email, propertyId: pid })) return;
    const axisId = ensureRentalWizardAxisId();
    syncInProgressApplicationRow({ axisId, form, residentEmail: email });

    if (mode !== "public" || isDemoModeActive()) return;
    if (startedSetupEmailAxisRef.current === axisId) return;

    const notifyKey = `application_started_notified_${axisId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(notifyKey) === "1") {
      startedSetupEmailAxisRef.current = axisId;
      return;
    }

    const timer = window.setTimeout(() => {
      void fetch("/api/portal/send-application-started", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), axisId }),
      })
        .then((res) => {
          if (!res.ok) return;
          startedSetupEmailAxisRef.current = axisId;
          try {
            window.sessionStorage.setItem(notifyKey, "1");
          } catch {
            /* ignore */
          }
        })
        .catch(() => undefined);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [draftReady, form, mode, sessionEmail, isReconcilingTarget, isOnScreen]);

  useEffect(() => {
    if (!draftReady || mode !== "portal") return;
    const email = (sessionEmail ?? form.email).trim().toLowerCase();
    if (!email.includes("@")) return; // resolved once email is known — effect reruns.

    // Derived fresh from searchParams (not the render-scoped `requestedTarget`
    // object, which is a new reference every render and would make this a
    // dependency that never stabilizes).
    const target = wizardTargetFromParam(searchParams);
    const signature = wizardTargetSignature(target);

    // A local draft is only trustworthy as "already reconciled" if it also
    // carries a saved axis id — proof this exact session already resolved
    // (found-or-created) a real application for it. Without one, a draft can
    // just be the listing-prefill effect's freshly populated propertyId/room
    // for THIS target, which would otherwise look like a false match and skip
    // the one server check that finds the real existing application.
    const existingAxisId = loadRentalWizardDraftAxisId()?.trim();
    const existingDraft = existingAxisId ? loadRentalWizardDraft() : null;
    if (existingDraft) {
      // Bare entry (no explicit property/room in the URL) — keep whatever is
      // already loaded; there's nothing more specific to reconcile against.
      // The loaded draft already IS this exact application — nothing to do.
      if (!target || targetMatchesApplication(target, { application: existingDraft })) {
        setReconciledSignature(signature);
        return;
      }
      // Otherwise the loaded draft belongs to a DIFFERENT property/room than
      // this request. Fall through and resolve the real target below instead
      // of letting an unrelated application's data silently carry over.
    }

    let cancelled = false;
    void syncManagerApplicationsFromServer({ force: true }).then(() => {
      if (cancelled) return;
      const inProgress = applicationsForResidentEmail(email).filter(isInProgressApplicationRow);
      const hit = findInProgressRowForTarget(inProgress, target);
      if (hit?.application) {
        // An in-progress application already exists for this exact target — resume it.
        saveRentalWizardDraftAxisId(hit.id);
        saveRentalWizardDraft({ ...createInitialRentalWizardState(), ...hit.application, email });
        setForm({ ...createInitialRentalWizardState(), ...hit.application, email });
        // The server confirmed this target IS an existing application, so the
        // URL's `wizardStep` (if any) can now be trusted even though the
        // synchronous local-draft fast path in `initialWizardStepFromRequest`
        // couldn't (a full page reload wipes the in-memory draft before this
        // effect ever runs) — this is what actually resumes progress past a
        // real browser refresh, not just an in-tab remount. Read the FROZEN
        // ref, not a live `searchParams` lookup — the step-tracking effect
        // already overwrote the live URL param to match `step`'s initial
        // value of 1 long before this async fetch resolved.
        const resumedStep = parseBoundedWizardStep(initialWizardStepParamRef.current);
        if (resumedStep) {
          setStep(resumedStep);
          setMaxStepReached((prev) => Math.max(prev, resumedStep));
        }
        setReconciledSignature(signature);
        return;
      }
      // No in-progress application matches this target. If a stale draft for
      // a different property/room is still loaded (same browser tab, no
      // reload), it must not bleed into a fresh application — clear it so a
      // new draft (and a new axis id, minted on next save) starts clean.
      if (target && existingDraft) {
        clearRentalWizardDraft();
        setForm({ ...createInitialRentalWizardState(), email });
      }
      // Either a match was found and loaded above, or none exists and this is
      // confirmed to be a genuinely fresh target — either way, it is now safe
      // for the sync/create effect to mint an axis id and write to the server.
      setReconciledSignature(signature);
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
    const phoneParam = (searchParams.get("phone") ?? "").trim();

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

        const phoneDigits = digitsOnly(phoneParam).slice(-10);
        const phone =
          phoneDigits.length === 10 && digitsOnly(prev.phone).length < 10
            ? maskPhoneInput("", phoneDigits)
            : prev.phone;

        return {
          ...prev,
          propertyId: pid,
          bundleId,
          phone,
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
  }, [form, setStep, showToast]);

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

  const applicationFeePaymentVerified =
    applicationFeeGate.paid || form.applicationFeeZelleSentConfirmed;

  const handleCheckApplicationFeePayment = useCallback(async () => {
    const pid = form.propertyId.trim();
    const emailTrim = form.email.trim();
    const prop = pid ? getPropertyById(pid) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const payChannel = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (!pid || !emailTrim.includes("@")) {
      setApplicationFeeCheckError("Enter your email and property before checking payment.");
      return;
    }
    if (isAchApplicationFeeChannel(payChannel)) return;

    setApplicationFeeCheckBusy(true);
    setApplicationFeeCheckError(null);
    try {
      ensurePendingApplicationFeeCharge({
        residentEmail: form.email,
        residentName: form.fullLegalName,
        residentUserId: feeStepUserId,
        propertyId: pid,
      });

      const res = await fetch("/api/public/application-fee-check-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: pid,
          residentEmail: emailTrim,
          channel: payChannel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setApplicationFeeCheckError(typeof data.error === "string" ? data.error : "Could not check payment.");
        return;
      }
      if (!data.paid) {
        setApplicationFeeCheckError(
          typeof data.message === "string" ? data.message : "Payment not paid. Please send payment.",
        );
        setForm((f) => ({ ...f, applicationFeeZelleSentConfirmed: false }));
        setErrors((e) => ({ ...e, applicationFeeZelleSentConfirmed: "" }));
        return;
      }
      setForm((f) => ({ ...f, applicationFeeZelleSentConfirmed: true }));
      setErrors((e) => ({ ...e, applicationFeeZelleSentConfirmed: "" }));
      setChargeTick((n) => n + 1);
      showToast("Payment verified.");
    } finally {
      setApplicationFeeCheckBusy(false);
    }
  }, [feeStepUserId, form.applicationFeePayChannel, form.email, form.fullLegalName, form.propertyId, showToast]);

  useEffect(() => {
    setApplicationFeeCheckError(null);
  }, [form.applicationFeePayChannel]);

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
      // Stop the per-keystroke draft effect from issuing further writes for this
      // application now that it is being submitted.
      markApplicationSubmitInitiated(axisId);
      const listing = prop;
      const applicantName = form.fullLegalName.trim() || "Applicant";

      // Group applications: the first applicant mints a shareable Group ID on submit;
      // joining members keep the id they pasted. Persist it on the stored snapshot so
      // every member's independent application row can be reconciled into one group.
      const resolvedGroupId = resolveSubmitGroupId(form);
      const submittedForm: RentalWizardFormState =
        resolvedGroupId && resolvedGroupId !== form.groupId ? { ...form, groupId: resolvedGroupId } : form;

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
        application: structuredClone(submittedForm),
      };

      replaceManagerApplicationRowInCache(applicationRow);
      const sync = await upsertApplicationRowToServerAwait(applicationRow);

      let emailSent = false;
      let mailtoHref: string | undefined;
      // Seed the finish CTA from the server-authoritative handoff minted during the
      // application upsert. This holds even if the follow-up email route fails, so
      // "Create your resident account" is never lost to a flaky send.
      let setupHref: string | undefined = sync.setupHref;
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
              includeSetupHandoff: true,
              // Reuse the token already minted on the row so the emailed link
              // matches the finish-screen link (the route skips token rotation).
              setupToken: sync.setupToken,
            }),
          });
          const payload = (await res.json().catch(() => ({}))) as { mailtoHref?: string; setupHref?: string };
          emailSent = res.ok;
          if (typeof payload.mailtoHref === "string" && payload.mailtoHref.startsWith("mailto:")) {
            mailtoHref = payload.mailtoHref;
          }
          if (typeof payload.setupHref === "string" && payload.setupHref.startsWith("/auth/resident-setup")) {
            setupHref = payload.setupHref;
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
        group_role: submittedForm.applyingAsGroup === "yes" ? submittedForm.groupRole ?? undefined : undefined,
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
        setupHref,
        groupId: submittedForm.applyingAsGroup === "yes" ? submittedForm.groupId : undefined,
        groupRole: submittedForm.applyingAsGroup === "yes" ? submittedForm.groupRole : undefined,
        groupSize: submittedForm.applyingAsGroup === "yes" ? submittedForm.groupSize : undefined,
      });
      if (sync.ok) {
        showToast("Application submitted.");
      } else {
        showToast(sync.error ?? "Application saved locally but could not sync to server. Try again.");
      }
    },
    [form, mode, router, setStep, showToast, submitting],
  );

  useEffect(() => {
    if (!demoAutofillSubmitPending || !isDemoModeActive()) return;
    setDemoAutofillSubmitPending(false);
    void finalizeApplicationSubmit(DEMO_GUIDED_USER_ID);
  }, [demoAutofillSubmitPending, finalizeApplicationSubmit, form]);

  const primaryButtonLabel = useMemo(() => {
    if (step !== 12) return "Continue";
    if (!applicationFeeGate.needsFee) return submitting ? "Submitting…" : "Submit application";
    const prop = form.propertyId.trim() ? getPropertyById(form.propertyId.trim()) : undefined;
    const sub = prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
    const payChannel = resolveApplicationFeePayChannel(sub, form.applicationFeePayChannel);
    if (isAchApplicationFeeChannel(payChannel)) {
      return checkoutBusy ? "Opening secure checkout…" : applicationFeeGate.paid ? "Submit application" : "Pay application fee";
    }
    if (payChannel === "zelle" || payChannel === "venmo" || payChannel === "other") {
      if (!applicationFeePaymentVerified) {
        return applicationFeeCheckBusy ? "Checking payment…" : "Check payment first";
      }
      return submitting ? "Submitting…" : "Submit application";
    }
    return submitting ? "Submitting…" : "Submit application";
  }, [
    step,
    form,
    form.propertyId,
    form.email,
    form.applicationFeePayChannel,
    checkoutBusy,
    applicationFeeGate.paid,
    applicationFeeGate.needsFee,
    applicationFeePaymentVerified,
    applicationFeeCheckBusy,
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
      const res = await fetch("/api/stripe/application-fee-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, expectedEmail: em }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        processing?: boolean;
        error?: string;
        propertyId?: string | null;
        emailMatches?: boolean;
      };
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "Could not verify payment.");
        router.replace(wizardApplyPath);
        return;
      }
      if (!data.paid) {
        // Retained for legacy in-flight ACH application-fee sessions created
        // before the fee channel switched to card: those still return
        // complete-but-unpaid while the bank transfer clears. New sessions are
        // card, so they come back paid.
        if (data.processing) {
          ensurePendingApplicationFeeCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId: feeStepUserId,
            propertyId: pid,
          });
          ensurePendingHoldingDepositCharge({
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
        data.emailMatches !== true
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
      ensurePendingHoldingDepositCharge({
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
              showToast(typeof payload.error === "string" ? payload.error : "Could not start card payment.");
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
          ensurePendingApplicationFeeCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId,
            propertyId: pid,
          });
          ensurePendingHoldingDepositCharge({
            residentEmail: form.email,
            residentName: form.fullLegalName,
            residentUserId,
            propertyId: pid,
          });

          const checkRes = await fetch("/api/public/application-fee-check-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              propertyId: pid,
              residentEmail: emailTrim,
              channel: payChannel,
            }),
          });
          const checkData = (await checkRes.json().catch(() => ({}))) as {
            paid?: boolean;
            message?: string;
            error?: string;
          };
          if (!checkRes.ok) {
            const msg = typeof checkData.error === "string" ? checkData.error : "Could not verify payment.";
            setApplicationFeeCheckError(msg);
            showToast(msg);
            return;
          }
          if (!checkData.paid) {
            const msg =
              typeof checkData.message === "string"
                ? checkData.message
                : "Payment not paid. Please send payment.";
            setForm((f) => ({ ...f, applicationFeeZelleSentConfirmed: false }));
            setApplicationFeeCheckError(msg);
            setErrors((e) => ({
              ...e,
              applicationFeeZelleSentConfirmed:
                payChannel === "other"
                  ? "Check payment before submitting your application."
                  : `Tap Check payment after sending the application fee by ${payChannel === "venmo" ? "Venmo" : "Zelle"}.`,
            }));
            showToast(msg);
            queueMicrotask(() =>
              scrollToFirstWizardFieldError(RENTAL_WIZARD_STEP_FIELD_ORDER[12] ?? [], {
                applicationFeeZelleSentConfirmed: msg,
              }),
            );
            return;
          }

          setForm((f) => ({ ...f, applicationFeeZelleSentConfirmed: true }));
          setApplicationFeeCheckError(null);
          setErrors((e) => ({ ...e, applicationFeeZelleSentConfirmed: "" }));
          setChargeTick((n) => n + 1);
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
  const embedded = layout === "embedded";

  return (
    <div
      ref={rootRef}
      className={
        embedded
          ? "rental-wizard rental-wizard--embedded"
          : "rental-wizard mx-auto max-w-3xl px-4 py-5 sm:py-14"
      }
    >
      {!embedded && !postSubmit ? (
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
            setupHref={postSubmit.setupHref}
            groupId={postSubmit.groupId}
            groupRole={postSubmit.groupRole}
            groupSize={postSubmit.groupSize}
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
                propertyOptions={propertyOptions}
                propertyLocked={Boolean(linkedPropertyId && linkedProperty)}
                emailLocked={mode === "portal" && Boolean(sessionEmail?.includes("@"))}
                patch={patchForm}
                applicationFeeGate={applicationFeeGate}
                applicationFeeCheckBusy={applicationFeeCheckBusy}
                applicationFeeCheckError={applicationFeeCheckError}
                applicationFeePaymentVerified={applicationFeePaymentVerified}
                onCheckApplicationFeePayment={() => {
                  void handleCheckApplicationFeePayment();
                }}
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
                onClick={handleContinue}
                disabled={checkoutBusy || submitting}
              >
                {submitting ? "Submitting…" : primaryButtonLabel}
              </Button>
            </div>
            {step <= 3 ? (
              <p className="rental-wizard-browse-homes mt-4 text-center text-sm">
                <Link
                  href={browseHomesHref}
                  data-attr="rental-wizard-browse-homes"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Browse homes
                </Link>
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

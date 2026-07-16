/** Demo autoplay events — property creation + resident application tour on `/demo`. */

export const DEMO_LISTING_AUTOFILL_EVENT = "axis:demo-listing-autofill";
export const DEMO_LISTING_SUBMITTED_EVENT = "axis:demo-listing-submitted";
export const DEMO_OPEN_CREATE_LISTING_EVENT = "axis:demo-open-create-listing";
export const DEMO_PROPERTIES_STAGE_EVENT = "axis:demo-properties-stage";
export const DEMO_OPEN_RESIDENT_APPLY_EVENT = "axis:demo-open-resident-apply";
export const DEMO_CLOSE_RESIDENT_APPLY_EVENT = "axis:demo-close-resident-apply";
export const DEMO_RENTAL_AUTOFILL_EVENT = "axis:demo-rental-autofill";
export const DEMO_APPLICATION_SUBMITTED_EVENT = "axis:demo-application-submitted";
export const DEMO_LEASE_SIGN_PREPARE_EVENT = "axis:demo-lease-sign-prepare";
export const DEMO_INBOX_REPLY_PREFILL_EVENT = "axis:demo-inbox-reply-prefill";
export const DEMO_INBOX_COMPOSE_PREFILL_EVENT = "axis:demo-inbox-compose-prefill";
export const DEMO_PROMOTION_AUTOFILL_EVENT = "axis:demo-promotion-autofill";
export const DEMO_PROMOTION_GENERATED_EVENT = "axis:demo-promotion-generated";

/** Demo inbox thread ids from `demoManagerInbox` / `demoResidentInbox`. */
export const DEMO_MANAGER_INBOX_THREAD_ID = "demo-mi-1";
export const DEMO_RESIDENT_INBOX_THREAD_ID = "demo-ri-1";

export type DemoPropertiesStage = "listed" | "unlisted";

let lastSubmittedPendingId: string | null = null;
let lastListedPropertyId: string | null = null;
let lastApplicationAxisId: string | null = null;

export function setDemoPlaybackPendingId(id: string | null): void {
  lastSubmittedPendingId = id?.trim() || null;
}

export function getDemoPlaybackPendingId(): string | null {
  return lastSubmittedPendingId;
}

export function setDemoPlaybackListedPropertyId(id: string | null): void {
  lastListedPropertyId = id?.trim() || null;
}

export function getDemoPlaybackListedPropertyId(): string | null {
  return lastListedPropertyId;
}

export function setDemoPlaybackApplicationAxisId(id: string | null): void {
  lastApplicationAxisId = id?.trim() || null;
}

export function getDemoPlaybackApplicationAxisId(): string | null {
  return lastApplicationAxisId;
}

export function dispatchDemoPropertiesStage(stage: DemoPropertiesStage): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_PROPERTIES_STAGE_EVENT, { detail: { stage } }));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

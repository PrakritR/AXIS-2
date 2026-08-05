/** Anchor id for the billing block inside Settings (`/portal/profile`). */
export const MANAGER_PLAN_PORTAL_SECTION_ID = "portal-plan";

export const MANAGER_PLAN_PORTAL_PATH = "/portal/profile";

export const MANAGER_PLAN_PORTAL_HASH = `#${MANAGER_PLAN_PORTAL_SECTION_ID}`;

export const MANAGER_PLAN_PORTAL_URL = `${MANAGER_PLAN_PORTAL_PATH}${MANAGER_PLAN_PORTAL_HASH}`;

/**
 * Where Stripe's billing portal returns the manager: the Settings billing tab,
 * not the bare Profile pane they never asked for.
 */
export const MANAGER_PLAN_BILLING_RETURN_PATH = `${MANAGER_PLAN_PORTAL_PATH}?tab=billing` as const;

/** Stripe embedded checkout return URL (session id placeholder for Stripe). */
export const MANAGER_PLAN_CHECKOUT_SUCCESS_PATH =
  `${MANAGER_PLAN_PORTAL_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}` as const;

export const MANAGER_PLAN_CHECKOUT_CANCELLED_PATH = `${MANAGER_PLAN_PORTAL_PATH}?checkout=cancelled` as const;

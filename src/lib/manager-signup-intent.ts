import { randomUUID } from "crypto";

/** Synthetic session id for free / promo-skip manager signup (no Stripe checkout). */
export const AXIS_INTENT_PREFIX = "axis_intent_" as const;

export function isAxisIntentSessionId(id: string): boolean {
  return id.startsWith(AXIS_INTENT_PREFIX);
}

export function newAxisIntentSessionId(): string {
  return `${AXIS_INTENT_PREFIX}${randomUUID()}`;
}

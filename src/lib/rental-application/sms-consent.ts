/**
 * A2P 10DLC SMS consent wording — shared, plain-TS module (no React/Next
 * imports) so both the client `SmsConsentCheckbox` and server routes can import
 * it without pulling client code into a server bundle.
 *
 * `SMS_CONSENT_WORDING_VERSION` identifies WHICH wording an applicant consented
 * to; it is stamped server-side onto the application snapshot alongside the
 * server-authoritative `smsConsentAt`. Bump it every time the visible wording
 * in `SmsConsentCheckbox` (or `SMS_CONSENT_WORDING` below, which mirrors it)
 * changes.
 */
export const SMS_CONSENT_WORDING_VERSION = "2026-07-28.1";

/** Canonical plain-text consent wording, matching the Twilio campaign declaration. */
export const SMS_CONSENT_WORDING =
  "I agree to receive text messages from PropLane about my rental application and account. " +
  "Msg & data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.";

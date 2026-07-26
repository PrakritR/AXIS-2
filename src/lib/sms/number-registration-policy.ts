/**
 * Pure policy for the per-manager SMS number system. No Twilio / Supabase
 * imports so it is cheap to unit-test and safe to import from anywhere.
 *
 * Two independent axes decide whether a manager can send from their OWN number:
 *   1. provision_state — does a usable number physically exist yet?
 *   2. registration_state — is that manager's messaging registration approved?
 *
 * The ISV/reseller model makes registration PER MANAGER. A single shared
 * registration is just the degenerate case where every manager's row points at
 * one shared record (`registration_ref`) whose state is resolved from env, so
 * one flip approves everyone through the exact same code path.
 */

export type ProvisionState =
  | "pending_registration"
  | "provisioning"
  | "active"
  | "failed"
  | "released";

export type RegistrationState = "pending" | "approved" | "rejected";

export type ManagerSmsNumberRecord = {
  managerUserId: string;
  phoneNumber: string | null;
  phoneNumberSid: string | null;
  messagingServiceSid: string | null;
  provider: string;
  areaCode: string | null;
  provisionState: ProvisionState;
  registrationState: RegistrationState;
  registrationRef: string | null;
  attempts: number;
  lastError: string | null;
  requestedAt: string | null;
  provisionedAt: string | null;
  releasedAt: string | null;
  registrationUpdatedAt: string | null;
  updatedAt: string | null;
};

const PROVISION_STATES: ReadonlySet<string> = new Set([
  "pending_registration",
  "provisioning",
  "active",
  "failed",
  "released",
]);

const REGISTRATION_STATES: ReadonlySet<string> = new Set(["pending", "approved", "rejected"]);

export function normalizeProvisionState(value: string | null | undefined): ProvisionState {
  const v = String(value ?? "").trim();
  return (PROVISION_STATES.has(v) ? v : "pending_registration") as ProvisionState;
}

export function normalizeRegistrationState(value: string | null | undefined): RegistrationState {
  const v = String(value ?? "").trim();
  return (REGISTRATION_STATES.has(v) ? v : "pending") as RegistrationState;
}

/**
 * Registration state a deployment applies to managers who share ONE registration
 * record (env `SMS_SHARED_REGISTRATION_STATE`, default `pending`). This is what
 * lets a single-brand deployment flip everyone live by changing one env var
 * without touching per-manager rows.
 */
export function sharedRegistrationState(
  env: Record<string, string | undefined> = process.env,
): RegistrationState {
  return normalizeRegistrationState(env.SMS_SHARED_REGISTRATION_STATE);
}

/** The shared-registration ref this deployment recognises (default `shared`). */
export function sharedRegistrationRef(
  env: Record<string, string | undefined> = process.env,
): string {
  return String(env.SMS_SHARED_REGISTRATION_REF ?? "shared").trim() || "shared";
}

/**
 * Effective registration state for a manager. When the row points at the shared
 * registration record, the state comes from env (so one flip moves everyone);
 * otherwise the manager's own per-row state is authoritative. One code path
 * covers both the reseller (per-manager) and single-shared-registration models.
 */
export function effectiveRegistrationState(
  record: Pick<ManagerSmsNumberRecord, "registrationState" | "registrationRef">,
  env: Record<string, string | undefined> = process.env,
): RegistrationState {
  const ref = String(record.registrationRef ?? "").trim();
  if (ref && ref === sharedRegistrationRef(env)) {
    return sharedRegistrationState(env);
  }
  return normalizeRegistrationState(record.registrationState);
}

/**
 * Money guard: real Twilio purchases only happen when explicitly enabled
 * (`SMS_PROVISIONING_ENABLED=1`). Off by default so a fleet of managers can be
 * parked in `pending_registration` with zero spend until an operator opts in.
 * Independent of registration: a number may be bought before it can send.
 */
export function isProvisioningEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return String(env.SMS_PROVISIONING_ENABLED ?? "").trim() === "1";
}

/**
 * True when the manager may send from their own provisioned number: a usable
 * number physically exists AND that manager's registration is approved. A number
 * can be `active` while registration is still `pending` — it exists but cannot
 * send yet, which is exactly the state a freshly provisioned reseller number
 * sits in until its brand clears.
 */
export function managerCanSendFromOwnNumber(
  record: Pick<
    ManagerSmsNumberRecord,
    "provisionState" | "phoneNumber" | "registrationState" | "registrationRef"
  > | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!record) return false;
  if (normalizeProvisionState(record.provisionState) !== "active") return false;
  if (!String(record.phoneNumber ?? "").trim()) return false;
  return effectiveRegistrationState(record, env) === "approved";
}

/** True when a number physically exists (active) regardless of registration. */
export function managerHasActiveNumber(
  record: Pick<ManagerSmsNumberRecord, "provisionState" | "phoneNumber"> | null,
): boolean {
  if (!record) return false;
  return (
    normalizeProvisionState(record.provisionState) === "active" &&
    !!String(record.phoneNumber ?? "").trim()
  );
}

/** States a provisioning sweep should (re)attempt when provisioning is enabled. */
export function needsProvisioning(
  record: Pick<ManagerSmsNumberRecord, "provisionState"> | null,
): boolean {
  if (!record) return true;
  const state = normalizeProvisionState(record.provisionState);
  return state === "pending_registration" || state === "failed";
}

// ---------------------------------------------------------------------------
// Quiet hours — applies to non-urgent AUTOMATED sends (rent reminders, notices),
// never to STOP/HELP control replies or a manager's own live reply.
// ---------------------------------------------------------------------------

export type QuietHoursConfig = {
  /** IANA timezone the window is evaluated in. */
  tz: string;
  /** Inclusive hour [0-23] quiet hours begin (e.g. 21 = 9pm). */
  startHour: number;
  /** Exclusive hour [0-23] quiet hours end (e.g. 8 = 8am). */
  endHour: number;
};

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  tz: "America/Los_Angeles",
  startHour: 21,
  endHour: 8,
};

/** Hour-of-day [0-23] for `date` in the given IANA timezone. */
export function hourInTimezone(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(date);
    const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
    // Intl can emit "24" for midnight under hour12:false — fold to 0.
    const h = Number(raw) % 24;
    return Number.isFinite(h) ? h : 0;
  } catch {
    return date.getUTCHours();
  }
}

/**
 * True when `date` falls inside quiet hours. Handles windows that wrap past
 * midnight (start > end), which is the common 9pm–8am case.
 */
export function isWithinQuietHours(
  date: Date,
  config: QuietHoursConfig = DEFAULT_QUIET_HOURS,
): boolean {
  const hour = hourInTimezone(date, config.tz);
  const { startHour, endHour } = config;
  if (startHour === endHour) return false; // no quiet window
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // Wraps midnight: quiet if at/after start OR before end.
  return hour >= startHour || hour < endHour;
}

export type SmsSendClass = "control" | "transactional" | "automated";

/**
 * Whether a send of the given class is allowed to go out right now. Quiet hours
 * only suppress `automated` traffic (rent reminders, bulk notices). Control
 * (STOP/HELP) and transactional (a manager's live reply, an AI answer to an
 * inbound question) are always allowed.
 */
export function quietHoursBlocks(
  sendClass: SmsSendClass,
  date: Date,
  config: QuietHoursConfig = DEFAULT_QUIET_HOURS,
): boolean {
  if (sendClass !== "automated") return false;
  return isWithinQuietHours(date, config);
}

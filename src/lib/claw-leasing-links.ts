/**
 * Client-safe listing SMS helpers (no Node/ws imports).
 * Used by listing CTAs (`sms:` deep links) and server auto-replies.
 *
 * PropLane messaging (the transport that actually sends and receives) runs on
 * ONE shared Claw Messenger agent line — keep
 * `NEXT_PUBLIC_CLAW_MESSENGER_ENABLED=1` so work-number UI and
 * `proplane-sms-transport.server.ts` keep using the Claw agent phone.
 *
 * Public listing CTAs are the one exception: in PRODUCTION they point at the
 * property's own manager's phone instead. That split lives entirely in
 * `resolveListingCtaSmsPhone` (`src/lib/listing-cta-phone.server.ts`); here,
 * `listingCtaSmsPhone` / `buildSmsDeepLink` just carry whatever number the
 * server resolved.
 */

import { normalizePhoneE164 } from "@/lib/communication-other-recipients";

export const CLAW_DEFAULT_AGENT_PHONE = "+12053690702";

/** Digit forms of the shared Claw agent line. */
export function legacyClawSharedPhoneDigits(): Set<string> {
  return new Set(
    [
      process.env.CLAW_MESSENGER_AGENT_PHONE,
      process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE,
      CLAW_DEFAULT_AGENT_PHONE,
    ]
      .map((p) => String(p ?? "").replace(/\D/g, ""))
      .filter((d) => d.length >= 10),
  );
}

export function isLegacyClawSharedSmsNumber(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 && legacyClawSharedPhoneDigits().has(digits);
}

/** Reserved 555 exchange — seed placeholders, not real lines. */
export function isFictionalUs555Number(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  return national.slice(3, 6) === "555";
}

/**
 * Claw Messenger is the active PropLane messaging system (single shared agent
 * line). Client-safe — driven by NEXT_PUBLIC_ so listing CTAs work in the browser.
 * Set `NEXT_PUBLIC_CLAW_MESSENGER_ENABLED=0` only when flipping to Twilio later.
 */
export function isClawSharedLineBridgeEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED?.trim();
  // Default ON for the Claw-primary era when unset in client bundles that
  // still ship the public agent phone — but prefer an explicit "1".
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  // Fallback: if the public agent phone is configured, treat Claw as primary.
  return Boolean(process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE?.trim());
}

/** @deprecated Alias — Claw is primary, not a temporary bridge. */
export function isClawMessagingPrimary(): boolean {
  return isClawSharedLineBridgeEnabled();
}

/** Fictional 555 placeholders, or non-Claw numbers when Claw is primary. */
export function isPlaceholderManagerWorkNumber(phone: string | null | undefined): boolean {
  if (isFictionalUs555Number(phone)) return true;
  if (isClawSharedLineBridgeEnabled()) {
    // Under Claw-primary, only the shared agent line is a real work number.
    return !isLegacyClawSharedSmsNumber(phone);
  }
  if (isLegacyClawSharedSmsNumber(phone)) return true;
  return false;
}

/**
 * Shared PropLane messaging number for the SEND transport
 * (`proplane-sms-transport.server.ts`) and work-number display. When Claw is
 * primary, ALWAYS the single agent line — one phone runs the entire messaging
 * system.
 *
 * NOT the public listing CTA number any more: that is `listingCtaSmsPhone`
 * below, fed by `resolveListingCtaSmsPhone`, which routes production prospects
 * to the listing's own manager. This helper only backs the dev/preview branch
 * of that split.
 */
export function managerContactSmsPhoneForPublicCta(phone: string | null | undefined): string | null {
  if (isClawSharedLineBridgeEnabled()) {
    return clawLeasingAgentPhoneE164();
  }
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  if (isFictionalUs555Number(trimmed)) return null;
  if (isLegacyClawSharedSmsNumber(trimmed)) return null;
  return trimmed;
}

/** Shared leasing/contact phone (Claw agent line). */
export function clawLeasingAgentPhoneE164(): string {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE || process.env.CLAW_MESSENGER_AGENT_PHONE)) ||
    CLAW_DEFAULT_AGENT_PHONE;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw).trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return CLAW_DEFAULT_AGENT_PHONE;
}

/**
 * The number a public listing CTA texts — EXACTLY the one the server resolved
 * for that listing in `resolveListingCtaSmsPhone`
 * (`src/lib/listing-cta-phone.server.ts`), which is where the production
 * (manager's own phone) vs. dev (shared Claw line) split is decided.
 *
 * The browser deliberately does NOT substitute a number of its own. In
 * production a manager with no verified phone must fall back to the
 * "Schedule a tour / apply online" web links, not silently text the shared
 * line or another manager. So this only normalizes and rejects: it returns a
 * well-formed E.164 number or `null`, never a malformed `sms:` target.
 */
export function listingCtaSmsPhone(contactSmsPhone: string | null | undefined): string | null {
  const e164 = normalizePhoneE164(String(contactSmsPhone ?? ""));
  if (!e164) return null;
  if (isFictionalUs555Number(e164)) return null;
  return e164;
}

/** Whether a listing may show "Text to …" CTAs — i.e. it has a real number. */
export function isClawMessagingPubliclyEnabled(contactSmsPhone?: string | null): boolean {
  return Boolean(listingCtaSmsPhone(contactSmsPhone));
}

export type LeasingIntent =
  | "tour"
  | "apply"
  | "bundle"
  | "question"
  | "lease"
  | "help"
  | "greeting"
  | "tour_details"
  | "unknown";

export function classifyLeasingIntent(text: string): LeasingIntent {
  const t = text.trim().toLowerCase();
  if (!t) return "unknown";

  // Intent keywords before greetings — CTA bodies start with "Hi — I'd like to …"
  if (
    /\bbundle[=:]/i.test(text) ||
    /\bbundleid=/i.test(text) ||
    (/\bbundle\b/.test(t) && /\b(apply|application|interested|text for)\b/.test(t))
  ) {
    return "bundle";
  }
  // Question wins over topic keywords: the site's own question CTA drafts
  // "Hi — I have a question about lease terms at X." — a prospect asking about
  // a lease is a question, not a lease-signing request.
  if (
    /\b(question|have a question|ask about|message about|ask a question)\b/.test(t) ||
    /^hi — i have a question\b/i.test(text.trim()) ||
    /\b(more info|info about|tell me about|learn more|details (on|about|for))\b/.test(t)
  ) {
    return "question";
  }
  if (/\b(apply|application|rental app|submit (an )?app)\b/.test(t)) return "apply";
  if (/\b(lease|sign(ing)?|lease signing|e-?sign|contract)\b/.test(t)) return "lease";
  if (
    /\b(tour|showing|visit|walkthrough|open house)\b/.test(t) ||
    /\b(schedule|book|set up|want|like|need)\s+(a\s+)?(tour|showing|visit)\b/.test(t) ||
    /\b(see|tour)\s+the\s+(place|unit|home|house|property)\b/.test(t) ||
    /\bschedule a (tour|showing)\b/.test(t)
  ) {
    return "tour";
  }
  if (/\b(help|menu|options)\b/.test(t) || t === "info") return "help";

  // Short greeting only
  if (/^(hi|hello|hey|yo)[\s!.?,]*$/i.test(t) || t === "start") return "greeting";

  // Follow-up that looks like answering tour intake questions
  const looksLikeTourAnswer =
    (/(@|\.com|\.edu|\.org)\b/.test(t) && t.length > 8) ||
    /\b(mon|tue|wed|thu|fri|sat|sun|tomorrow|today|morning|afternoon|evening)\b/.test(t) ||
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(t) ||
    /\b(am|pm)\b/.test(t) ||
    /^name\s*:/i.test(text) ||
    /^email\s*:/i.test(text);
  if (looksLikeTourAnswer) return "tour_details";

  // Longer free-form text from "Text a message" → treat as a question for the manager
  if (t.length >= 24) return "question";

  return "unknown";
}

/**
 * Freeform listing / availability interest that is not a sticky resident
 * payment/lease message. Used so "more info about 4709a" hits leasing instead
 * of manager→resident relay when the sender is a mapped manager phone.
 */
export function looksLikeListingInterest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(more info|info about|tell me about|interested in|learn more|details (on|about|for))\b/.test(
      t,
    ) ||
    /\b(is|are)\b.{0,40}\b(available|open|vacant|still listed)\b/.test(t) ||
    /\b(listing|listings|showing|open house|for rent|room bundle|bedroom|studio)\b/.test(t) ||
    /\b(house|home|unit|apartment|property|building)\b/.test(t)
  );
}

/**
 * Prefixed listing CTA bodies / leasing intents — used so prospects (and a
 * manager testing from their personal phone) hit the leasing bot instead of
 * the resident payment/lease hub.
 */
export function looksLikeProspectLeasingCta(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^Hi — /i.test(t) || /^Hi - /i.test(t)) return true;
  if (/propertyId=/i.test(t) || /bundleId=/i.test(t)) return true;
  if (/\/rent\/(listings|apply)\//i.test(t) || /\/rent\/apply\?/i.test(t)) return true;
  if (/^(TOUR|APPLY|LEASE|HELP|BUNDLE)([\s!.?,]|$)/i.test(t)) return true;
  const intent = classifyLeasingIntent(text);
  if (
    intent === "tour" ||
    intent === "tour_details" ||
    intent === "apply" ||
    intent === "bundle"
  ) {
    return true;
  }
  // Freeform "more info about …" / availability questions → leasing, not resident hub.
  if ((intent === "question" || intent === "help" || intent === "unknown") && looksLikeListingInterest(t)) {
    return true;
  }
  return false;
}

export function extractPropertyIdHint(text: string): string | null {
  const m =
    text.match(/propertyId=([a-zA-Z0-9._-]+)/i) ||
    text.match(/\/rent\/listings\/([a-zA-Z0-9._-]+)/i) ||
    text.match(/\/rent\/apply\?[^\s]*propertyId=([a-zA-Z0-9._-]+)/i) ||
    text.match(/\b(?:listing|property|home)\s*[#: ]\s*([a-zA-Z0-9._-]{6,})\b/i) ||
    text.match(/\b(mgr-[a-z0-9-]+)\b/i);
  return m?.[1]?.trim() || null;
}

export function extractBundleIdHint(text: string): string | null {
  const m =
    text.match(/bundleId=([a-zA-Z0-9._-]+)/i) ||
    text.match(/[?&]bundle=([a-zA-Z0-9._-]+)/i);
  return m?.[1]?.trim() || null;
}

/** Pull a human listing/bundle name from a CTA draft for server-side resolve. */
export function extractPropertyLabelHint(text: string): string | null {
  const patterns = [
    /apply for the bundle\s+"[^"]+"\s+at\s+(.+?)\.?$/i,
    /apply for a room bundle at\s+(.+?)\.?$/i,
    /schedule a tour for\s+(.+?)\.?$/i,
    /tour for\s+(.+?)\.?$/i,
    /apply for .+? at\s+(.+?)\.?$/i,
    /apply for\s+(.+?)\.?$/i,
    /question about .+? at\s+(.+?)\.?$/i,
    /question about\s+(.+?)\.?$/i,
    /(?:more )?info(?:rmation)? about\s+(.+?)\.?$/i,
    /tell me about\s+(.+?)\.?$/i,
    /interested in\s+(.+?)\.?$/i,
  ];
  for (const re of patterns) {
    const m = text.trim().match(re);
    const label = m?.[1]?.trim();
    if (label && !/^the bundle\b/i.test(label)) return label;
  }
  return null;
}

export function extractBundleLabelHint(text: string): string | null {
  const m = text.match(/bundle\s+"([^"]+)"/i);
  return m?.[1]?.trim() || null;
}

export type SmsDeepLinkIntent = "tour" | "apply" | "lease" | "bundle" | "question";

export function buildSmsDeepLink(args: {
  intent: SmsDeepLinkIntent;
  propertyId?: string | null;
  propertyLabel?: string | null;
  bundleId?: string | null;
  bundleLabel?: string | null;
  /** Optional context for question CTAs (layout, bathroom, lease terms, …). */
  topic?: string | null;
  roomName?: string | null;
  /**
   * The listing's server-resolved CTA number (production: its own manager's
   * phone; dev/preview: the shared Claw line). No number means no `sms:` link —
   * callers render the web "Schedule a tour / apply online" fallback instead.
   */
  toPhone?: string | null;
}): string {
  const toPhone = listingCtaSmsPhone(args.toPhone);
  if (!toPhone) return "#";
  const phoneDigits = toPhone.replace(/\D/g, "");
  const label = (args.propertyLabel ?? "").trim();
  const bundleLabel = (args.bundleLabel ?? "").trim();
  const topic = (args.topic ?? "").trim();
  const room = (args.roomName ?? "").trim();
  // propertyId / bundleId are still accepted from callers for API stability,
  // but they are intentionally not written into the outbound draft body.
  void args.propertyId;
  void args.bundleId;

  let body = "Hi — I'm interested in your listing.";
  if (args.intent === "tour") {
    body = label ? `Hi — I'd like to schedule a tour for ${label}.` : `Hi — I'd like to schedule a tour.`;
  } else if (args.intent === "apply") {
    if (room) {
      body = label
        ? `Hi — I'd like to apply for ${room} at ${label}.`
        : `Hi — I'd like to apply for ${room}.`;
    } else {
      body = label ? `Hi — I'd like to apply for ${label}.` : `Hi — I'd like to apply.`;
    }
  } else if (args.intent === "bundle") {
    body = bundleLabel
      ? `Hi — I'd like to apply for the bundle "${bundleLabel}"${label ? ` at ${label}` : ""}.`
      : label
        ? `Hi — I'd like to apply for a room bundle at ${label}.`
        : `Hi — I'd like to apply for a room bundle.`;
  } else if (args.intent === "lease") {
    body = `Hi — I'm ready to review / sign my lease.`;
  } else if (args.intent === "question") {
    if (topic && label) {
      body = `Hi — I have a question about ${topic} at ${label}.`;
    } else if (topic) {
      body = `Hi — I have a question about ${topic}.`;
    } else if (label) {
      body = `Hi — I have a question about ${label}.`;
    } else {
      body = `Hi — I have a question.`;
    }
  }

  return `sms:+${phoneDigits}?&body=${encodeURIComponent(body)}`;
}

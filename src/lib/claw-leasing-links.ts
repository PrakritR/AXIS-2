/**
 * Client-safe Claw leasing helpers (no Node/ws imports).
 * Used by listing CTAs (`sms:` deep links) and server auto-replies.
 */

export const CLAW_DEFAULT_AGENT_PHONE = "+12053690702";

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

export function isClawMessagingPubliclyEnabled(): boolean {
  // Public listings only show Text CTAs when the shared agent line is configured.
  if (typeof process === "undefined") return true;
  const flag = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  // Default on when an agent phone is present (including built-in trial number).
  return Boolean(clawLeasingAgentPhoneE164());
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
    /^hi — i have a question\b/i.test(text.trim())
  ) {
    return "question";
  }
  if (/\b(apply|application|rental app|submit (an )?app)\b/.test(t)) return "apply";
  if (/\b(lease|sign(ing)?|lease signing|e-?sign|contract)\b/.test(t)) return "lease";
  if (
    /\b(tour|showing|visit|schedule a (tour|showing)|see the (place|unit|home|house)|walkthrough|open house)\b/.test(
      t,
    )
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
    /apply for .+? at\s+(.+?)\.?$/i,
    /apply for\s+(.+?)\.?$/i,
    /question about .+? at\s+(.+?)\.?$/i,
    /question about\s+(.+?)\.?$/i,
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

/**
 * Prefixed listing CTA bodies / keyword shortcuts — used so a manager testing
 * from their personal phone still gets the leasing bot (not the "reply to
 * resident" relay path).
 */
export function looksLikeProspectLeasingCta(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^Hi — /i.test(t) || /^Hi - /i.test(t)) return true;
  if (/propertyId=/i.test(t) || /bundleId=/i.test(t)) return true;
  if (/\/rent\/(listings|apply)\//i.test(t) || /\/rent\/apply\?/i.test(t)) return true;
  if (/^(TOUR|APPLY|LEASE|HELP|BUNDLE)([\s!.?,]|$)/i.test(t)) return true;
  return false;
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
}): string {
  const phoneDigits = clawLeasingAgentPhoneE164().replace(/\D/g, "");
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

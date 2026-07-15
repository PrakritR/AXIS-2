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

export type LeasingIntent = "tour" | "apply" | "lease" | "help" | "greeting" | "unknown";

export function classifyLeasingIntent(text: string): LeasingIntent {
  const t = text.trim().toLowerCase();
  if (!t) return "unknown";
  if (/^(hi|hello|hey|yo)\b/.test(t) || t === "start") return "greeting";
  if (/\b(help|menu|options|info)\b/.test(t)) return "help";
  if (/\b(tour|showing|visit|see the (place|unit|home|house)|walkthrough|open house)\b/.test(t)) {
    return "tour";
  }
  if (/\b(apply|application|rental app|submit (an )?app)\b/.test(t)) return "apply";
  if (/\b(lease|sign(ing)?|lease signing|e-?sign|contract)\b/.test(t)) return "lease";
  return "unknown";
}

export function extractPropertyIdHint(text: string): string | null {
  const m =
    text.match(/propertyId=([a-zA-Z0-9._-]+)/i) ||
    text.match(/\b(?:listing|property|home)\s*[#: ]\s*([a-zA-Z0-9._-]{6,})\b/i) ||
    text.match(/\b(mgr-[a-z0-9-]+)\b/i);
  return m?.[1]?.trim() || null;
}

export function buildSmsDeepLink(args: {
  intent: "tour" | "apply" | "lease" | "general";
  propertyId?: string | null;
  propertyLabel?: string | null;
}): string {
  const phoneDigits = clawLeasingAgentPhoneE164().replace(/\D/g, "");
  const label = (args.propertyLabel ?? "").trim();
  const id = (args.propertyId ?? "").trim();
  let body = "Hi — I'm interested in your listing.";
  if (args.intent === "tour") {
    body = label
      ? `Hi — I'd like to schedule a tour for ${label}${id ? ` (propertyId=${id})` : ""}.`
      : `Hi — I'd like to schedule a tour${id ? ` (propertyId=${id})` : ""}.`;
  } else if (args.intent === "apply") {
    body = label
      ? `Hi — I'd like to apply for ${label}${id ? ` (propertyId=${id})` : ""}.`
      : `Hi — I'd like to apply${id ? ` (propertyId=${id})` : ""}.`;
  } else if (args.intent === "lease") {
    body = `Hi — I'm ready to review / sign my lease${id ? ` (propertyId=${id})` : ""}.`;
  }
  return `sms:+${phoneDigits}?&body=${encodeURIComponent(body)}`;
}

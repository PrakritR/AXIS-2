/**
 * SINGLE source of truth for which rail PropLane SMS uses.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Twilio is the AUTHORITATIVE PRIMARY transport. Claw Messenger (the one    │
 * │ shared `+1 205 369 0702` agent line) is a LEGACY FALLBACK, engaged only   │
 * │ while its flag is on, and it is being retired.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Historically two independent flags decided the rail and could disagree
 * (`NEXT_PUBLIC_CLAW_MESSENGER_ENABLED` for client-side CTA/work-number display
 * vs. `CLAW_MESSENGER_ENABLED`+key for the server send transport). That
 * split-brain is why the codebase contradicted itself about which rail was
 * primary. This module is now the ONE place the rail is decided; every consumer
 * reads `smsPrimaryTransport()` / `isClawFallbackEnabled()` and the doctrine is
 * uniform: no flag → Twilio.
 *
 * Client-safe: reads only `process.env` (both the `NEXT_PUBLIC_` flag, inlined
 * into client bundles at build time, and — server-side only — the server key),
 * no Node / ws / Supabase imports, so browser bundles can import it.
 *
 * Retiring Claw for good: firstmate turns the Claw fallback flag OFF and turns
 * the provisioning + A2P registration flags ON (`SMS_PROVISIONING_ENABLED`,
 * console/campaign work). Until then production keeps the flag on and behaves
 * exactly as before — see `docs/agents/sms-system.md`.
 */

export type SmsPrimaryTransport = "twilio" | "claw";

/**
 * True when the legacy Claw shared-line fallback is engaged. This is the single
 * master switch for the rail, client-safe (`NEXT_PUBLIC_`), keeping the exact
 * truthiness the old `isClawSharedLineBridgeEnabled()` had so no deployment's
 * behavior changes:
 * - `NEXT_PUBLIC_CLAW_MESSENGER_ENABLED` = `0`/`false` → OFF (Twilio primary)
 * - `NEXT_PUBLIC_CLAW_MESSENGER_ENABLED` = `1`/`true`  → ON  (Claw fallback)
 * - unset → ON only if the public Claw agent phone is configured (a deployment
 *   that still ships the shared line), else OFF.
 *
 * When OFF, every send routes through the per-manager Twilio rail.
 */
export function isClawFallbackEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return Boolean(process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE?.trim());
}

/**
 * The rail PropLane SMS uses right now. `"twilio"` unless the Claw legacy
 * fallback flag is explicitly engaged — Twilio is the default and authoritative
 * primary.
 */
export function smsPrimaryTransport(): SmsPrimaryTransport {
  return isClawFallbackEnabled() ? "claw" : "twilio";
}

/**
 * Money / live-traffic guard for BUYING per-manager Twilio work numbers. OFF by
 * default so the provisioning path stays dark until firstmate flips it on
 * (alongside A2P campaign registration). Twilio being the primary transport does
 * NOT authorize spending — that is a separate, deliberate switch. Server-only
 * (no `NEXT_PUBLIC_`): number purchases never happen client-side.
 */
export function isSmsProvisioningEnabled(): boolean {
  const flag = process.env.SMS_PROVISIONING_ENABLED?.trim();
  return flag === "1" || flag === "true";
}

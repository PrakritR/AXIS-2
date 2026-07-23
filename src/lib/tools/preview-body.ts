/**
 * Shared preview helpers for tools that send agent-drafted text.
 *
 * The confirm card is the prompt-injection catch point (see `ActionPreview` in
 * `registry.ts`): the approver can only veto what they can SEE, so a message
 * body is always shown in full — never truncated for layout. The card scrolls.
 */

export const MESSAGE_LINK_WARNING = "The message body contains a link. Verify it before sending.";

/** Warn when agent-drafted text carries a URL the approver should check. */
export function bodyLinkWarnings(body: string): string[] {
  return /https?:\/\//i.test(body) ? [MESSAGE_LINK_WARNING] : [];
}

/** Spread onto a preview: `...withBodyWarnings(body)` adds `warnings` only when there are any. */
export function withBodyWarnings(body: string): { warnings?: string[] } {
  const warnings = bodyLinkWarnings(body);
  return warnings.length > 0 ? { warnings } : {};
}

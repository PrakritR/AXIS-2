/**
 * Shared preview helpers for tools that send agent-drafted text.
 *
 * The confirm card is the prompt-injection catch point (see `ActionPreview` in
 * `registry.ts`): the approver can only veto what they can SEE, so a message
 * body is always shown in full — never truncated for layout. The card scrolls.
 */

export const MESSAGE_LINK_WARNING = "The message body contains a link. Verify it before sending.";

/**
 * Warn when agent-drafted text carries a URL the approver should check. Pass a
 * `noun` when the text is not an outgoing message body, so the copy names what
 * the approver is actually looking at.
 */
export function bodyLinkWarnings(body: string, noun?: string): string[] {
  if (!/https?:\/\//i.test(body)) return [];
  return [noun ? `The ${noun} contains a link. Verify it before continuing.` : MESSAGE_LINK_WARNING];
}

/** Spread onto a preview: `...withBodyWarnings(body)` adds `warnings` only when there are any. */
export function withBodyWarnings(body: string, noun?: string): { warnings?: string[] } {
  const warnings = bodyLinkWarnings(body, noun);
  return warnings.length > 0 ? { warnings } : {};
}

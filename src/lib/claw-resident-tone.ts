/**
 * PropLane resident/tenant SMS tone — always read like a human texting,
 * never like an AI assistant, menu bot, or branded chatbot.
 */

/** Soft welcome when someone just says hi. */
export function residentGreetingText(name?: string | null): string {
  const n = (name ?? "").trim();
  if (n && n !== "Resident") return `Hey ${n} — what's up?`;
  return "Hey — what's up?";
}

/**
 * When they ask for help/options: short human guidance, not a command menu.
 */
export function residentHelpMenuText(): string {
  return [
    "Just text me whatever you need — rent, lease, application, move-in, parking, or something broken.",
    "I'll get it sorted or loop in your manager.",
  ].join("\n");
}

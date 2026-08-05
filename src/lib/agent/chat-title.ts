const UNTITLED_THREAD = "New conversation";
const GENERATED_TITLE_PREFIX = "ai:";
const VAGUE_THREAD_TITLES = new Set([
  "hi",
  "hello",
  "hey",
  "help",
  "i need help",
  "can you help",
  "can you help me",
  "question",
  "test",
  "thanks",
  "thank you",
  "what can you do",
]);

function visiblePromptText(text: string): string {
  return text.replace(/^\[Context:[^\]]+\]\s*\n+/i, "").trim();
}

/** A concise, safe archive label taken from one user prompt. */
export function agentChatThreadTitle(text: string): string {
  const line = visiblePromptText(text).split("\n")[0]?.trim() ?? "";
  if (!line) return UNTITLED_THREAD;
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/** Greetings and generic requests should not hide the first useful question. */
export function isVagueAgentChatThreadTitle(title: string): boolean {
  const normalized = title
    .toLocaleLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return VAGUE_THREAD_TITLES.has(normalized);
}

/**
 * Prefer the first prompt, except when it is only a greeting or generic help
 * request. In that case the next useful prompt becomes the conversation name.
 */
export function agentChatThreadTitleFromPrompts(prompts: string[]): string {
  const titles = prompts.map(agentChatThreadTitle).filter((title) => title !== UNTITLED_THREAD);
  const first = titles[0] ?? UNTITLED_THREAD;
  if (!isVagueAgentChatThreadTitle(first)) return first;
  return titles.slice(1).find((title) => !isVagueAgentChatThreadTitle(title)) ?? first;
}

/** A generated title carries a private marker so old prompt-echo titles can be refreshed safely. */
export function storeGeneratedAgentChatThreadTitle(title: string): string {
  return `${GENERATED_TITLE_PREFIX}${title}`;
}

export function readGeneratedAgentChatThreadTitle(value: unknown): string | null {
  const title = String(value ?? "").trim();
  if (!title.startsWith(GENERATED_TITLE_PREFIX)) return null;
  const visible = title.slice(GENERATED_TITLE_PREFIX.length).trim();
  return visible || null;
}

/** Reject model output that is not a compact, normal conversation title. */
export function normalizeGeneratedAgentChatThreadTitle(value: string): string | null {
  const candidate = value
    .split("\n")[0]
    ?.replace(/^\s*(?:title\s*:\s*)?/i, "")
    .replace(/^['\"`]+|['\"`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
  const words = candidate.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4 || candidate.length > 64) return null;
  return candidate;
}

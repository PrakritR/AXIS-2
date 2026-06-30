/**
 * Model routing for the interactive tool-calling agent.
 *
 * The agent runs on different Claude models depending on how complex the turn
 * is, so we spend the fewest tokens for a given answer quality: a "hi" greeting
 * runs on Haiku, an ordinary lookup on Sonnet, and a multi-part analytical
 * question on Opus. Routing is a pure, deterministic heuristic over the message
 * shape (length, intent keywords, conversation depth) — no extra LLM call, no
 * added latency, and it never lets message *content* trigger an action (the
 * messages are untrusted input; we only read their shape).
 *
 * Routing is conservative: the safe default is the mid tier. We only drop to
 * Haiku for clearly trivial turns and only escalate to Opus for clearly complex
 * ones, because misrouting a hard task to a weak model is the failure we most
 * want to avoid.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type ModelTier = "simple" | "standard" | "complex";

/**
 * Tier -> model id. Each tier is overridable via env for cost tuning without a
 * code change. `AXIS_AGENT_MODEL` (the original single-model env var) is kept as
 * a global hard override: when set, it forces that one model for every tier.
 */
const GLOBAL_OVERRIDE = process.env.AXIS_AGENT_MODEL?.trim() || "";

export const TIER_MODELS: Record<ModelTier, string> = {
  simple: GLOBAL_OVERRIDE || process.env.AXIS_AGENT_MODEL_SIMPLE?.trim() || "claude-haiku-4-5",
  standard: GLOBAL_OVERRIDE || process.env.AXIS_AGENT_MODEL_STANDARD?.trim() || "claude-sonnet-4-6",
  complex: GLOBAL_OVERRIDE || process.env.AXIS_AGENT_MODEL_COMPLEX?.trim() || "claude-opus-4-8",
};

/**
 * Back-compat: the previous single export. Equals the global override when set,
 * otherwise the standard-tier default. Existing imports keep working.
 */
export const AGENT_MODEL = TIER_MODELS.standard;

/** Per-model pricing in USD per million tokens (input, output). */
export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
};

const warnedUnpricedModels = new Set<string>();

/** Estimated USD cost of a turn from accumulated token usage. 0 if unpriced. */
export function estimateCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const price = MODEL_PRICING[model];
  if (!price) {
    if (!warnedUnpricedModels.has(model)) {
      warnedUnpricedModels.add(model);
      console.warn(
        `[agent/model] No pricing for model "${model}"; cost traces for this model will report $0. Add it to MODEL_PRICING.`,
      );
    }
    return 0;
  }
  return (
    (usage.inputTokens / 1_000_000) * price.inputPerMTok +
    (usage.outputTokens / 1_000_000) * price.outputPerMTok
  );
}

// Words that signal analysis/reasoning across data rather than a single lookup.
const COMPLEX_SIGNALS = [
  "compare",
  "analyze",
  "analyse",
  "analysis",
  "why",
  "trend",
  "forecast",
  "project",
  "projection",
  "reconcile",
  "break down",
  "breakdown",
  "across",
  "versus",
  " vs ",
  "correlat",
  "explain why",
  "root cause",
  "recommend",
  "strategy",
  "optimi", // optimize / optimise
];

// Short, self-contained pleasantries / acknowledgements.
const TRIVIAL_PHRASES = [
  "hi",
  "hii",
  "hey",
  "hello",
  "yo",
  "thanks",
  "thank you",
  "thx",
  "ok",
  "okay",
  "cool",
  "great",
  "got it",
  "sounds good",
  "yes",
  "no",
  "yep",
  "nope",
  "bye",
];

function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

/**
 * Classify a turn's complexity from message shape alone. Pure function: no IO,
 * no model call, content is read only for length/keyword/shape signals.
 */
export function classifyComplexity(messages: Anthropic.MessageParam[]): ModelTier {
  const text = lastUserText(messages).trim();
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  const turnCount = messages.length;

  // Clearly complex: analytical intent, multiple questions in one message, a
  // long prompt, or a deep conversation that has accumulated a lot of context.
  const hasComplexSignal = COMPLEX_SIGNALS.some((s) => lower.includes(s));
  if (
    hasComplexSignal ||
    questionMarks >= 2 ||
    wordCount > 60 ||
    text.length > 400 ||
    turnCount >= 10
  ) {
    return "complex";
  }

  // Clearly trivial: a greeting/acknowledgement with no real request, no
  // question, and early in the conversation. We match against a known set of
  // pleasantries rather than a raw length cutoff, so short but real commands
  // ("list my leases") stay on the standard tier where quality is safer.
  // Anything past the first couple of turns is more likely a real follow-up.
  const isTrivialPhrase = TRIVIAL_PHRASES.includes(lower.replace(/[.!?,]+$/g, ""));
  if (turnCount <= 2 && questionMarks === 0 && isTrivialPhrase) {
    return "simple";
  }

  // Everything else: the safe default.
  return "standard";
}

/** Pick the model and tier for a turn. */
export function selectModel(messages: Anthropic.MessageParam[]): { model: string; tier: ModelTier } {
  const tier = classifyComplexity(messages);
  return { model: TIER_MODELS[tier], tier };
}

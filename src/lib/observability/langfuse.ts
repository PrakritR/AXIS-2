/**
 * Langfuse agent tracing. One trace per agent turn, carrying the actor's
 * attribution metadata (landlordId / role / managerIds) and the user id so
 * sessions are replayable and attributable across all three portals. The loop
 * emits per-LLM-call, per-tool-call, and pending-action events through an
 * observer; we record them as nested generations/spans so the prompt, tools
 * available, tool args, tool results, per-call token counts, and cost are all
 * first-class. Degrades to a no-op when Langfuse env is unset or the SDK
 * misbehaves — tracing must never break a turn.
 */
import { Langfuse } from "langfuse";
import type { AgentObserver } from "@/lib/agent/loop";
import { estimateCostUsd } from "@/lib/agent/model";

let client: Langfuse | null = null;
let initialized = false;

function getClient(): Langfuse | null {
  if (initialized) return client;
  initialized = true;
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  if (!secretKey || !publicKey) return (client = null);
  try {
    client = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env.LANGFUSE_BASE_URL?.trim() || "https://us.cloud.langfuse.com",
    });
  } catch {
    client = null;
  }
  return client;
}

/**
 * Who a trace is attributed to. The manager route passes
 * `{ userId, metadata: { landlordId, role: "manager" } }`; resident/vendor
 * routes pass their own role + linked-manager ids. `sessionId` groups turns
 * of one conversation (falls back to userId).
 */
export type TraceActor = {
  userId: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

/** The subset of a Langfuse trace the observer uses; lets us unit-test the mapping. */
export type TraceLike = {
  update(args: Record<string, unknown>): void;
  generation(args: Record<string, unknown>): void;
  span(args: Record<string, unknown>): void;
};

/** Run a trace call, swallowing errors so tracing never breaks a turn. */
function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* ignore */
  }
}

/**
 * Map loop events onto a Langfuse trace: tools-available + system size up front,
 * one generation per LLM call (with that call's tokens and cost), one span per
 * tool call carrying the full arguments and result, and one span per write-tool
 * proposal (pending action). Pure over `trace` so it is testable with a fake.
 */
export function buildTraceObserver(trace: TraceLike, actor: TraceActor): AgentObserver {
  const actorMeta = actor.metadata ?? {};
  return {
    onStart: (info) =>
      safe(() =>
        trace.update({
          metadata: {
            ...actorMeta,
            toolsAvailable: info.toolsAvailable,
            systemPromptChars: info.system.length,
          },
        }),
      ),
    onLlmCall: (e) =>
      safe(() =>
        trace.generation({
          name: "axis-agent-llm",
          model: e.model,
          usage: { input: e.usage.inputTokens, output: e.usage.outputTokens, unit: "TOKENS" },
          input: e.input,
          output: e.assistantContent,
          metadata: {
            iteration: e.iteration,
            stopReason: e.stopReason,
            toolsChosen: e.toolsChosen,
            estimatedCostUsd: estimateCostUsd(e.model, e.usage),
            ...actorMeta,
          },
        }),
      ),
    onToolCall: (e) =>
      // ponytail: tool args + results are sent to Langfuse uncapped (debug source
      // of truth, per AGENTS.md). Add a size cap here if payloads get unwieldy.
      safe(() =>
        trace.span({
          name: `tool:${e.name}`,
          input: e.input,
          output: e.output,
          metadata: { ok: e.ok, iteration: e.iteration, ...actorMeta },
        }),
      ),
    onPendingAction: (e) =>
      safe(() =>
        trace.span({
          name: `pending:${e.toolName}`,
          input: { toolName: e.toolName },
          output: e.ok ? e.preview : e.error,
          metadata: { ok: e.ok, iteration: e.iteration, ...actorMeta },
        }),
      ),
  };
}

/**
 * Trace a single-shot LLM extraction + tool call from an ANONYMOUS public
 * surface (no authenticated user, so no landlordId/userId to carry — e.g. the
 * resident marketing housing-search chat). Carries a client-supplied sessionId
 * so one visitor's turns group together for replay. Degrades to a no-op the
 * same way `traceAgentTurn` does when Langfuse env is unset.
 */
export async function tracePublicToolTurn<T>(opts: {
  name: string;
  sessionId: string;
  input: string;
  run: (record: {
    llmCall: (e: {
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      input: unknown;
      output: unknown;
      metadata?: Record<string, unknown>;
    }) => void;
    toolCall: (e: { name: string; input: unknown; output: unknown }) => void;
  }) => Promise<T>;
}): Promise<T> {
  const lf = getClient();
  if (!lf) return opts.run({ llmCall: () => {}, toolCall: () => {} });

  let trace: ReturnType<Langfuse["trace"]> | null = null;
  try {
    trace = lf.trace({ name: opts.name, sessionId: opts.sessionId, input: opts.input, metadata: { public: true } });
  } catch {
    trace = null;
  }

  const record = {
    llmCall: (e: {
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      input: unknown;
      output: unknown;
      metadata?: Record<string, unknown>;
    }) =>
      safe(() =>
        trace?.generation({
          name: "housing-search-extract",
          model: e.model,
          usage: { input: e.usage.inputTokens, output: e.usage.outputTokens, unit: "TOKENS" },
          input: e.input,
          output: e.output,
          metadata: { ...e.metadata, estimatedCostUsd: estimateCostUsd(e.model, e.usage) },
        }),
      ),
    toolCall: (e: { name: string; input: unknown; output: unknown }) =>
      safe(() => trace?.span({ name: `tool:${e.name}`, input: e.input, output: e.output })),
  };

  try {
    const result = await opts.run(record);
    safe(() => trace?.update({ output: result as unknown as Record<string, unknown> }));
    return result;
  } catch (e) {
    safe(() => trace?.update({ output: e instanceof Error ? e.message : "error" }));
    throw e;
  } finally {
    try {
      await lf.flushAsync();
    } catch {
      /* ignore */
    }
  }
}

type TurnInput = { role: string; content: string }[];

type TurnUsage = { inputTokens: number; outputTokens: number };
type TracedResult = {
  reply: string;
  toolTrace: { tool: string; ok: boolean }[];
  model?: string;
  tier?: string;
  usage?: TurnUsage;
  pendingAction?: { toolName: string };
};

/**
 * Wrap an agent turn in a Langfuse trace. The trace records the input, the final
 * reply, the tools that ran, any pending write proposal, and — when the loop
 * reports them — the chosen model, complexity tier, token counts, and estimated
 * cost, all attributed to the actor. Failures in tracing are swallowed; the
 * wrapped function's result is always returned.
 */
export async function traceAgentTurn<T extends TracedResult>(
  actor: TraceActor,
  messages: TurnInput,
  run: (observer?: AgentObserver) => Promise<T>,
  /** Non-chat surfaces (the SMS agents, inbox draft replies) name their trace
   * and bind it to their own session id. */
  opts?: { name?: string; sessionId?: string },
): Promise<T> {
  const lf = getClient();
  if (!lf) return run();

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  let trace: ReturnType<Langfuse["trace"]> | null = null;
  try {
    trace = lf.trace({
      name: opts?.name ?? "axis-agent-turn",
      userId: actor.userId,
      sessionId: opts?.sessionId ?? actor.sessionId ?? actor.userId,
      metadata: actor.metadata ?? {},
      input: lastUser,
    });
  } catch {
    trace = null;
  }

  const observer = trace ? buildTraceObserver(trace, actor) : undefined;

  try {
    const result = await run(observer);
    try {
      // Per-call generations and per-tool spans are recorded live via the
      // observer; here we only stamp the turn-level summary for quick scanning.
      const costUsd =
        result.model && result.usage ? estimateCostUsd(result.model, result.usage) : undefined;
      trace?.update({
        output: result.reply,
        metadata: {
          ...(actor.metadata ?? {}),
          tools: result.toolTrace.map((t) => t.tool),
          model: result.model,
          tier: result.tier,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          estimatedCostUsd: costUsd,
          pendingAction: result.pendingAction?.toolName,
        },
      });
    } catch {
      /* ignore */
    }
    return result;
  } catch (e) {
    try {
      trace?.update({ output: e instanceof Error ? e.message : "error" });
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    try {
      await lf.flushAsync();
    } catch {
      /* ignore */
    }
  }
}

/**
 * The confirm gate's wrapped call — the same discriminated union
 * `executeWriteTool` returns. Typed exactly (not a loose `{ reply?: string }`,
 * which every object satisfies structurally) so a future shape change fails to
 * compile instead of silently tracing "done" for every confirmed action.
 */
export type TracedActionResult =
  | { ok: true; result: { reply: string } }
  | { ok: false; error: string };

/**
 * Wrap the confirm endpoint's execute/cancel of a pending action in its own
 * small trace, so every state change is attributable and replayable alongside
 * the turn that proposed it.
 */
export async function traceAgentAction<T extends TracedActionResult>(
  actor: TraceActor,
  info: { toolName: string; actionId: string; decision: "confirm" | "cancel" },
  run: () => Promise<T>,
): Promise<T> {
  const lf = getClient();
  if (!lf) return run();

  let trace: ReturnType<Langfuse["trace"]> | null = null;
  try {
    trace = lf.trace({
      name: "axis-agent-action",
      userId: actor.userId,
      sessionId: actor.sessionId ?? actor.userId,
      metadata: { ...(actor.metadata ?? {}), toolName: info.toolName, actionId: info.actionId, decision: info.decision },
      input: `${info.decision}:${info.toolName}`,
    });
  } catch {
    trace = null;
  }

  try {
    const result = await run();
    safe(() => trace?.update({ output: result.ok ? result.result.reply : result.error }));
    return result;
  } catch (e) {
    safe(() => trace?.update({ output: e instanceof Error ? e.message : "error" }));
    throw e;
  } finally {
    try {
      await lf.flushAsync();
    } catch {
      /* ignore */
    }
  }
}

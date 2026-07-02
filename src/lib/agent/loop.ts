/**
 * Thin custom agent loop on the Anthropic SDK with native tool-calling. The model
 * sees read AND write tools, but the loop only ever EXECUTES read tools; a write
 * tool_use is turned into a previewed pending action that ends the turn — the
 * handler runs later, from the gated confirm endpoint, never from here.
 * Reliability guards: a max-iteration cap and pause_turn handling. Tool results
 * are returned to the model as data, never as instructions.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/lib/tools/context";
import {
  type ActionPreview,
  type ToolRegistry,
  toAnthropicTools,
  runReadTool,
  previewWriteTool,
} from "@/lib/tools/registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import { selectModel, type ModelTier } from "./model";

const MAX_ITERATIONS = 6;

export type ToolTraceEntry = { tool: string; ok: boolean };
export type TurnUsage = { inputTokens: number; outputTokens: number };
export type PendingAction = { toolName: string; input: unknown; preview: ActionPreview };
export type AgentTurnResult = {
  reply: string;
  toolTrace: ToolTraceEntry[];
  model: string;
  tier: ModelTier;
  usage: TurnUsage;
  /** Set when the model proposed a write action; the turn ends awaiting confirmation. */
  pendingAction?: PendingAction;
};

/**
 * Per-call/per-tool events the loop emits as work happens. Kept Langfuse-agnostic
 * so the loop has no observability coupling; the observability layer implements
 * this to nest the trace. Every observer call is guarded — a throwing observer
 * must never break a turn.
 */
export type LlmCallEvent = {
  iteration: number;
  model: string;
  usage: TurnUsage; // THIS call only, not the turn accumulator
  stopReason: string | null;
  toolsChosen: string[];
  input: Anthropic.MessageParam[]; // messages sent for this call
  assistantContent: Anthropic.ContentBlock[]; // the response blocks
};
export type ToolCallEvent = {
  iteration: number;
  name: string;
  input: unknown; // raw model-supplied args
  ok: boolean;
  output: unknown; // result.data on success, error string on failure
};
export type AgentObserver = {
  onStart?(info: { system: string; toolsAvailable: string[]; model: string; tier: ModelTier }): void;
  onLlmCall?(e: LlmCallEvent): void;
  onToolCall?(e: ToolCallEvent): void;
};

/** Invoke an observer hook, swallowing any error so tracing can't break a turn. */
function notify(fn: (() => void) | undefined) {
  if (!fn) return;
  try {
    fn();
  } catch {
    /* ignore */
  }
}

export async function runAgentTurn(opts: {
  ctx: AgentContext;
  registry: ToolRegistry;
  messages: Anthropic.MessageParam[];
  observer?: AgentObserver;
}): Promise<AgentTurnResult> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from env
  const tools = toAnthropicTools(opts.registry);
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const toolTrace: ToolTraceEntry[] = [];

  // Route the turn once, up front, based on its complexity, and use that model
  // for every iteration of the loop (switching models mid-turn would thrash the
  // prompt cache). Token usage accumulates across iterations for cost tracing.
  const { model, tier } = selectModel(opts.messages);
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0 };

  const observer = opts.observer;
  notify(
    observer?.onStart &&
      (() => observer.onStart!({ system: SYSTEM_PROMPT, toolsAvailable: tools.map((t) => t.name), model, tier })),
  );

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Snapshot the messages sent for this call before we mutate the array, so the
    // trace records the exact prompt for replay.
    const callInput = [...messages];
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: tools as unknown as Anthropic.Tool[],
      messages,
    });

    const callUsage: TurnUsage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    usage.inputTokens += callUsage.inputTokens;
    usage.outputTokens += callUsage.outputTokens;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    notify(
      observer?.onLlmCall &&
        (() =>
          observer.onLlmCall!({
            iteration: i,
            model,
            usage: callUsage,
            stopReason: response.stop_reason ?? null,
            toolsChosen: toolUses.map((u) => u.name),
            input: callInput,
            assistantContent: response.content,
          })),
    );

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { reply: reply || "I couldn't find an answer to that.", toolTrace, model, tier, usage };
    }

    const replyText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const results: Anthropic.ToolResultBlockParam[] = [];
    let sawWriteAttempt = false;
    for (const use of toolUses) {
      const isWrite = opts.registry.get(use.name)?.kind === "write";

      if (isWrite && !sawWriteAttempt) {
        // First write tool_use: build the preview and, on success, end the turn
        // as a pending action. The handler is NEVER called here — it runs only
        // from the confirm endpoint with the server-stored input.
        sawWriteAttempt = true;
        const previewed = await previewWriteTool(opts.registry, opts.ctx, use.name, use.input);
        toolTrace.push({ tool: use.name, ok: previewed.ok });
        notify(
          observer?.onToolCall &&
            (() =>
              observer.onToolCall!({
                iteration: i,
                name: use.name,
                input: use.input,
                ok: previewed.ok,
                output: previewed.ok ? previewed.preview : previewed.error,
              })),
        );
        if (previewed.ok) {
          return {
            reply: replyText || previewed.preview.title,
            toolTrace,
            model,
            tier,
            usage,
            pendingAction: { toolName: use.name, input: previewed.input, preview: previewed.preview },
          };
        }
        // Preview failed (bad args, unknown target): feed the error back so the
        // model can self-correct on the next iteration.
        results.push({ type: "tool_result", tool_use_id: use.id, content: previewed.error, is_error: true });
        continue;
      }

      if (isWrite) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: "Propose one action at a time; this one was not previewed.",
          is_error: true,
        });
        continue;
      }

      const result = await runReadTool(opts.registry, opts.ctx, use.name, use.input);
      toolTrace.push({ tool: use.name, ok: result.ok });
      notify(
        observer?.onToolCall &&
          (() =>
            observer.onToolCall!({
              iteration: i,
              name: use.name,
              input: use.input,
              ok: result.ok,
              output: result.ok ? result.data : result.error,
            })),
      );
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.ok ? JSON.stringify(result.data) : result.error,
        is_error: !result.ok,
      });
    }
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "I reached the maximum number of steps without finishing. Please try a more specific question.",
    toolTrace,
    model,
    tier,
    usage,
  };
}

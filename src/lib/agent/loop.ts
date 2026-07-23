/**
 * Thin custom agent loop on the Anthropic SDK with native tool-calling. The
 * model orchestrates and explains, the system computes. Read tools run
 * directly; a write tool call runs its READ-ONLY preview phase and halts the
 * turn with a proposedAction — nothing executes until the user confirms
 * through the gated endpoint. Reliability guards: a max-iteration cap and
 * pause_turn handling. Tool results are returned to the model as data, never
 * as instructions.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/lib/tools/context";
import {
  type ToolRegistry,
  type ActionPreview,
  toAnthropicTools,
  runReadTool,
  prepareWriteAction,
  executeWriteAction,
} from "@/lib/tools/registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import { selectModel, type ModelTier } from "./model";

const MAX_ITERATIONS = 8;

export type ToolTraceEntry = { tool: string; ok: boolean };
export type TurnUsage = { inputTokens: number; outputTokens: number };

/** A write tool the model proposed; the turn halted awaiting user confirmation. */
export type ProposedAction = {
  toolName: string;
  /** Zod-validated + preview-normalized. Persisted server-side, never sent to the client. */
  input: unknown;
  preview: ActionPreview;
  destructive: boolean;
};

export type AgentTurnResult = {
  reply: string;
  toolTrace: ToolTraceEntry[];
  model: string;
  tier: ModelTier;
  usage: TurnUsage;
  /** Present => the turn halted on a write-tool proposal. */
  proposedAction?: ProposedAction;
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
export type PendingActionEvent = {
  iteration: number;
  toolName: string;
  ok: boolean;
  preview?: ActionPreview;
  error?: string;
};
export type AgentObserver = {
  onStart?(info: { system: string; toolsAvailable: string[]; model: string; tier: ModelTier }): void;
  onLlmCall?(e: LlmCallEvent): void;
  onToolCall?(e: ToolCallEvent): void;
  onPendingAction?(e: PendingActionEvent): void;
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

export async function runAgentTurn<Ctx = AgentContext>(opts: {
  ctx: Ctx;
  registry: ToolRegistry<Ctx>;
  messages: Anthropic.MessageParam[];
  /** Portal-specific system prompt; defaults to the manager prompt. */
  system?: string;
  observer?: AgentObserver;
}): Promise<AgentTurnResult> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from env
  const system = opts.system ?? SYSTEM_PROMPT;
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
      (() => observer.onStart!({ system, toolsAvailable: tools.map((t) => t.name), model, tier })),
  );

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Snapshot the messages sent for this call before we mutate the array, so the
    // trace records the exact prompt for replay.
    const callInput = [...messages];
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
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

    // A confirm-gated write proposal halts the turn. Only the FIRST such call
    // is honored (the system prompt tells the model to propose one action at a
    // time; batches go inside one tool call's array input). If its preview
    // succeeds we return immediately — sibling tool calls are dropped, which is
    // safe because the client conversation history is text-only, so the
    // abandoned tool_use blocks never reach a future API call.
    const gatedWrite = toolUses.find((u) => {
      const t = opts.registry.get(u.name);
      return t?.kind === "write" && t.confirm !== "none";
    });
    if (gatedWrite) {
      const prepared = await prepareWriteAction(opts.registry, opts.ctx, gatedWrite.name, gatedWrite.input);
      notify(
        observer?.onPendingAction &&
          (() =>
            observer.onPendingAction!({
              iteration: i,
              toolName: gatedWrite.name,
              ok: prepared.ok,
              preview: prepared.ok ? prepared.preview : undefined,
              error: prepared.ok ? undefined : prepared.error,
            })),
      );
      if (prepared.ok) {
        toolTrace.push({ tool: gatedWrite.name, ok: true });
        const reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        return {
          reply,
          toolTrace,
          model,
          tier,
          usage,
          proposedAction: {
            toolName: gatedWrite.name,
            input: prepared.input,
            preview: prepared.preview,
            destructive: Boolean(prepared.tool.destructive),
          },
        };
      }
      // Preview failed: feed the error back so the model can self-correct.
      // Every tool_use in this response still needs a tool_result; sibling
      // reads run normally, extra gated writes are refused.
      toolTrace.push({ tool: gatedWrite.name, ok: false });
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.id === gatedWrite.id) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: prepared.error,
            is_error: true,
          });
          continue;
        }
        const tool = opts.registry.get(use.name);
        if (tool?.kind === "write" && tool.confirm !== "none") {
          toolTrace.push({ tool: use.name, ok: false });
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: "Propose one action at a time. This call was not processed.",
            is_error: true,
          });
          continue;
        }
        const result = await runInlineTool(opts.registry, opts.ctx, use, i, toolTrace, observer);
        results.push(result);
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      results.push(await runInlineTool(opts.registry, opts.ctx, use, i, toolTrace, observer));
    }
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

/**
 * Run a tool the loop may execute inline: read tools, and low-risk
 * confirm:"none" write tools (preview → execute in one step; still
 * audit-logged inside execute()).
 */
async function runInlineTool<Ctx>(
  registry: ToolRegistry<Ctx>,
  ctx: Ctx,
  use: Anthropic.ToolUseBlock,
  iteration: number,
  toolTrace: ToolTraceEntry[],
  observer?: AgentObserver,
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = registry.get(use.name);
  let ok: boolean;
  let output: unknown;

  if (tool?.kind === "write" && tool.confirm === "none") {
    const prepared = await prepareWriteAction(registry, ctx, use.name, use.input);
    if (!prepared.ok) {
      ok = false;
      output = prepared.error;
    } else {
      const executed = await executeWriteAction(registry, ctx, use.name, prepared.input);
      ok = executed.ok;
      output = executed.ok ? { done: true, result: executed.reply } : executed.error;
    }
  } else {
    const result = await runReadTool(registry, ctx, use.name, use.input);
    ok = result.ok;
    output = result.ok ? result.data : result.error;
  }

  toolTrace.push({ tool: use.name, ok });
  notify(
    observer?.onToolCall &&
      (() =>
        observer.onToolCall!({
          iteration,
          name: use.name,
          input: use.input,
          ok,
          output,
        })),
  );
  return {
    type: "tool_result",
    tool_use_id: use.id,
    content: ok ? JSON.stringify(output) : String(output),
    is_error: !ok,
  };
}

/**
 * Thin custom agent loop on the Anthropic SDK with native tool-calling. The model
 * is given only READ tools; it orchestrates and explains, the system computes.
 * Reliability guards: a max-iteration cap and pause_turn handling. Tool results
 * are returned to the model as data, never as instructions.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/lib/tools/context";
import { type ToolRegistry, toAnthropicTools, runReadTool } from "@/lib/tools/registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import { AGENT_MODEL } from "./model";

const MAX_ITERATIONS = 6;

export type ToolTraceEntry = { tool: string; ok: boolean };
export type AgentTurnResult = { reply: string; toolTrace: ToolTraceEntry[] };

export async function runAgentTurn(opts: {
  ctx: AgentContext;
  registry: ToolRegistry;
  messages: Anthropic.MessageParam[];
}): Promise<AgentTurnResult> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from env
  const tools = toAnthropicTools(opts.registry, { readOnly: true });
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const toolTrace: ToolTraceEntry[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: tools as unknown as Anthropic.Tool[],
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { reply: reply || "I couldn't find an answer to that.", toolTrace };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const result = await runReadTool(opts.registry, opts.ctx, use.name, use.input);
      toolTrace.push({ tool: use.name, ok: result.ok });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.ok ? JSON.stringify(result.data) : result.error,
        is_error: !result.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "I reached the maximum number of steps without finishing. Please try a more specific question.",
    toolTrace,
  };
}

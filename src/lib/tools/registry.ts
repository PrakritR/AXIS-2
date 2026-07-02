/**
 * The tool layer contract. Every site capability the agent can use is a typed,
 * permission-scoped ToolDefinition. The same definitions can back the UI later;
 * for now the agent loop consumes them. Anthropic tool schemas are generated
 * from the Zod input schema so there is one source of truth, not two.
 */
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentContext } from "./context";

export type ToolKind = "read" | "write";

/**
 * The user-facing preview of a proposed write action. Fields must show EXACTLY
 * what will happen (recipient, full message body, amount, date) — this is the
 * prompt-injection catch point: the landlord can only veto what they can see.
 */
export type ActionPreview = {
  kind: string;
  title: string;
  confirmLabel: string;
  fields: { label: string; value: string }[];
  warnings?: string[];
};

export type ToolDefinition<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  kind: ToolKind;
  inputSchema: z.ZodType<Input>;
  handler: (ctx: AgentContext, input: Input) => Promise<Output>;
  /**
   * Write tools only: build the user-facing preview from server data. Must be
   * read-only — it runs from the model loop before any confirmation exists.
   */
  preview?: (ctx: AgentContext, input: Input) => Promise<ActionPreview>;
};

export function defineTool<Input, Output>(
  def: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  return def;
}

/** A write tool: preview is required, kind is pinned, handler is the gated execute. */
export function defineWriteTool<Input, Output>(
  def: Omit<ToolDefinition<Input, Output>, "kind" | "preview"> & {
    preview: NonNullable<ToolDefinition<Input, Output>["preview"]>;
  },
): ToolDefinition<Input, Output> {
  return { ...def, kind: "write" };
}

// Stored heterogeneously; per-tool generics are recovered at call time via Zod.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolRegistry = Map<string, ToolDefinition<any, any>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRegistry(tools: ToolDefinition<any, any>[]): ToolRegistry {
  const registry: ToolRegistry = new Map();
  for (const tool of tools) {
    if (registry.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    registry.set(tool.name, tool);
  }
  return registry;
}

export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Generate Anthropic tool definitions from the registry's Zod schemas. */
export function toAnthropicTools(
  registry: ToolRegistry,
  opts: { readOnly?: boolean } = {},
): AnthropicToolSchema[] {
  const out: AnthropicToolSchema[] = [];
  for (const tool of registry.values()) {
    if (opts.readOnly && tool.kind !== "read") continue;
    out.push({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema, { $refStrategy: "none" }) as Record<string, unknown>,
    });
  }
  return out;
}

export type RunToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Validate input and dispatch a READ tool. Write tools are never callable from
 * the model loop — they only execute through the gated confirm endpoint, which
 * re-resolves the action from authoritative server data.
 */
export async function runReadTool(
  registry: ToolRegistry,
  ctx: AgentContext,
  name: string,
  rawInput: unknown,
): Promise<RunToolResult> {
  const tool = registry.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (tool.kind !== "read") {
    return { ok: false, error: `Tool ${name} requires explicit user confirmation and cannot be called directly.` };
  }
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` };
  }
  try {
    const data = await tool.handler(ctx, parsed.data);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tool execution failed." };
  }
}

export type PreviewWriteToolResult =
  | { ok: true; input: unknown; preview: ActionPreview }
  | { ok: false; error: string };

/**
 * Validate input for a WRITE tool and build its user-facing preview. This is
 * the only write-tool entry point reachable from the model loop; the handler
 * itself only runs later, from the confirm endpoint, with the stored input.
 */
export async function previewWriteTool(
  registry: ToolRegistry,
  ctx: AgentContext,
  name: string,
  rawInput: unknown,
): Promise<PreviewWriteToolResult> {
  const tool = registry.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (tool.kind !== "write" || !tool.preview) {
    return { ok: false, error: `Tool ${name} is not a previewable write tool.` };
  }
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` };
  }
  try {
    const preview = await tool.preview(ctx, parsed.data);
    return { ok: true, input: parsed.data, preview };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not preview this action." };
  }
}

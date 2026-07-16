/**
 * The tool layer contract. Every site capability the agent can use is a typed,
 * permission-scoped ToolDefinition. Anthropic tool schemas are generated from
 * the Zod input schema so there is one source of truth, not two.
 *
 * Two tool kinds:
 *  - READ tools return data to the model directly.
 *  - WRITE tools are two-phase: `preview()` (read-only validation + a
 *    human-readable ActionPreview) runs when the model proposes the action;
 *    `execute()` (the actual state change) runs ONLY from the gated confirm
 *    endpoint after the user explicitly approves, and must re-resolve every
 *    target from authoritative, actor-scoped server data.
 *
 * The registry is generic over the context type so manager, resident, and
 * vendor tools each bind to their own scoped context and can never be
 * registered into the wrong portal's registry.
 */
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentContext } from "./context";

export type ToolKind = "read" | "write";

/**
 * The confirmation card payload shown to the user before a write executes.
 * Every value is server-derived from actor-scoped data — with the single
 * deliberate exception of model-extracted drafts (e.g. property fields read
 * from listing photos), where human verification of each field on this card
 * is exactly the point.
 */
export type ActionPreview = {
  title: string;
  summary: string;
  lines: { label: string; value: string }[];
  /** Button label; defaults to "Confirm" in the UI. */
  confirmLabel?: string;
  /** Present => destructive/high-risk styling and copy. */
  warning?: string;
  /** Number of targets when the input is a batch. */
  batchCount?: number;
};

export type PreviewResult<Input> =
  | { ok: true; preview: ActionPreview; input: Input }
  | { ok: false; error: string };

export type ExecuteResult =
  | { ok: true; reply: string; resultSummary?: Record<string, unknown>; checkoutUrl?: string }
  | { ok: false; error: string };

export type ReadToolDefinition<Input = unknown, Output = unknown, Ctx = AgentContext> = {
  name: string;
  description: string;
  kind: "read";
  inputSchema: z.ZodType<Input>;
  handler: (ctx: Ctx, input: Input) => Promise<Output>;
};

export type WriteToolDefinition<Input = unknown, Ctx = AgentContext> = {
  name: string;
  /**
   * Shown to the model. A shared "requires user confirmation" suffix is
   * appended automatically in toAnthropicTools — don't repeat it per tool.
   */
  description: string;
  kind: "write";
  /** Deletes / irreversible / money-moving ops get warning styling + copy. */
  destructive?: boolean;
  /**
   * "required" (default): the loop halts and the user must confirm.
   * "none": low-risk write (e.g. mark a thread read) executed inline by the
   * loop like a read tool — still audit-logged by its execute().
   */
  confirm?: "required" | "none";
  inputSchema: z.ZodType<Input>;
  /** READ-ONLY: validate against live actor-scoped data, build the preview. */
  preview: (ctx: Ctx, input: Input) => Promise<PreviewResult<Input>>;
  /**
   * The state change. Callable ONLY from the gated confirm endpoint (or inline
   * for confirm:"none" tools). Must re-resolve targets from live actor-scoped
   * data and write an audit_log row via writeAuditLog().
   */
  execute: (ctx: Ctx, input: Input) => Promise<ExecuteResult>;
};

export type ToolDefinition<Input = unknown, Output = unknown, Ctx = AgentContext> =
  | ReadToolDefinition<Input, Output, Ctx>
  | WriteToolDefinition<Input, Ctx>;

export function defineTool<Input, Output, Ctx = AgentContext>(
  def: ReadToolDefinition<Input, Output, Ctx>,
): ReadToolDefinition<Input, Output, Ctx> {
  return def;
}

export function defineWriteTool<Input, Ctx = AgentContext>(
  def: WriteToolDefinition<Input, Ctx>,
): WriteToolDefinition<Input, Ctx> {
  return def;
}

// Stored heterogeneously; per-tool generics are recovered at call time via Zod.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolRegistry<Ctx = AgentContext> = Map<string, ToolDefinition<any, any, Ctx>>;

/**
 * Scope identity can never come from the model. No write tool may accept a
 * field that names the acting/owning identity — those always come from the
 * authenticated context. (Target identities like a recipient email are fine;
 * they are re-verified against actor-scoped data in preview/execute.)
 */
const BANNED_IDENTITY_FIELDS = new Set(
  [
    "landlordId",
    "landlord_id",
    "managerUserId",
    "manager_user_id",
    "managerId",
    "manager_id",
    "userId",
    "user_id",
    "actorUserId",
    "actor_user_id",
    "ownerUserId",
    "owner_user_id",
    "vendorUserId",
    "vendor_user_id",
    "residentUserId",
    "resident_user_id",
  ].map((s) => s.toLowerCase()),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRegistry<Ctx = AgentContext>(tools: ToolDefinition<any, any, Ctx>[]): ToolRegistry<Ctx> {
  const registry: ToolRegistry<Ctx> = new Map();
  for (const tool of tools) {
    if (registry.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    if (tool.kind === "write") {
      const schema = zodToJsonSchema(tool.inputSchema, { $refStrategy: "none" }) as {
        properties?: Record<string, unknown>;
      };
      for (const prop of Object.keys(schema.properties ?? {})) {
        if (BANNED_IDENTITY_FIELDS.has(prop.toLowerCase())) {
          throw new Error(
            `Write tool ${tool.name} declares identity input field "${prop}" — scope always comes from the authenticated context, never from the model.`,
          );
        }
      }
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

const WRITE_DESCRIPTION_SUFFIX =
  " This does not execute immediately: the user is shown a preview of the exact action and must explicitly confirm before anything happens.";

/** Generate Anthropic tool definitions from the registry's Zod schemas. */
export function toAnthropicTools<Ctx>(
  registry: ToolRegistry<Ctx>,
  opts: { readOnly?: boolean } = {},
): AnthropicToolSchema[] {
  const out: AnthropicToolSchema[] = [];
  for (const tool of registry.values()) {
    if (opts.readOnly && tool.kind !== "read") continue;
    const description =
      tool.kind === "write" && tool.confirm !== "none"
        ? tool.description + WRITE_DESCRIPTION_SUFFIX
        : tool.description;
    out.push({
      name: tool.name,
      description,
      input_schema: zodToJsonSchema(tool.inputSchema, { $refStrategy: "none" }) as Record<string, unknown>,
    });
  }
  return out;
}

export type RunToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Validate input and dispatch a READ tool. Write tools are never executed from
 * this path — a write reaching it is refused (defense in depth; the loop
 * routes writes through prepareWriteAction instead).
 */
export async function runReadTool<Ctx>(
  registry: ToolRegistry<Ctx>,
  ctx: Ctx,
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

export type PrepareWriteResult<Ctx> =
  | {
      ok: true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool: WriteToolDefinition<any, Ctx>;
      input: unknown;
      preview: ActionPreview;
    }
  | { ok: false; error: string };

/**
 * Zod-validate model-supplied input and run the read-only preview phase of a
 * write tool. Never mutates anything. A failed preview is fed back to the
 * model as a tool_result error so it can self-correct.
 */
export async function prepareWriteAction<Ctx>(
  registry: ToolRegistry<Ctx>,
  ctx: Ctx,
  name: string,
  rawInput: unknown,
): Promise<PrepareWriteResult<Ctx>> {
  const tool = registry.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (tool.kind !== "write") return { ok: false, error: `Tool ${name} is not an action tool.` };
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` };
  }
  try {
    const result = await tool.preview(ctx, parsed.data);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, tool, input: result.input, preview: result.preview };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the action." };
  }
}

/**
 * Re-validate stored input against the tool's CURRENT schema (schema drift
 * across deploys fails safely) and run the state change. Called only by the
 * gated confirm endpoint and by the loop for confirm:"none" tools.
 */
export async function executeWriteAction<Ctx>(
  registry: ToolRegistry<Ctx>,
  ctx: Ctx,
  name: string,
  storedInput: unknown,
): Promise<ExecuteResult> {
  const tool = registry.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (tool.kind !== "write") return { ok: false, error: `Tool ${name} is not an action tool.` };
  const parsed = tool.inputSchema.safeParse(storedInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: "This action is no longer valid. Please ask again." };
  }
  try {
    return await tool.execute(ctx, parsed.data);
  } catch (e) {
    console.error(`[tools] execute ${name} failed:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "The action failed to execute." };
  }
}

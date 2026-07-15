import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import type { AgentContext } from "@/lib/tools/context";

// Mock the Anthropic SDK so the loop never makes a network call.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { runAgentTurn } from "@/lib/agent/loop";
import { buildRegistry, defineTool, defineWriteTool } from "@/lib/tools/registry";

/**
 * These tests pin the core write-gating guarantee of the loop: a write
 * tool_use NEVER executes the handler — it only builds a preview and ends the
 * turn as a pending action awaiting explicit user confirmation.
 */

const ctx = {
  landlordId: "manager_a",
  userId: "manager_a",
  email: "m@axis.test",
  roles: ["manager"],
  isAdmin: false,
  db: {},
} as unknown as AgentContext;

const writeHandler = vi.fn(async () => ({ reply: "done" }));
const writePreview = vi.fn(async (_ctx: AgentContext, input: { target: string }) => ({
  kind: "test",
  title: `Do the thing to ${input.target}`,
  confirmLabel: "Do it",
  fields: [{ label: "Target", value: input.target }],
}));
const readHandler = vi.fn(async () => ({ items: [1, 2] }));

const registry = buildRegistry([
  defineTool({
    name: "list_things",
    description: "List things for testing.",
    kind: "read",
    inputSchema: z.object({}).strict(),
    handler: readHandler,
  }),
  defineWriteTool({
    name: "do_thing",
    description: "A gated write for testing.",
    inputSchema: z.object({ target: z.string() }).strict(),
    preview: writePreview,
    handler: writeHandler,
  }),
]);

const usage = { input_tokens: 10, output_tokens: 5 };

describe("runAgentTurn write proposals", () => {
  beforeEach(() => {
    create.mockReset();
    writeHandler.mockClear();
    writePreview.mockClear();
    readHandler.mockClear();
  });

  it("exposes write tools to the model alongside read tools", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }], usage });
    await runAgentTurn({ ctx, registry, messages: [{ role: "user", content: "hi" }] });
    const toolNames = create.mock.calls[0]![0].tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("list_things");
    expect(toolNames).toContain("do_thing");
  });

  it("turns a write tool_use into a pending action and never calls the handler", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "I'll do the thing." },
        { type: "tool_use", id: "tu_1", name: "do_thing", input: { target: "abc" } },
      ],
      usage,
    });

    const result = await runAgentTurn({ ctx, registry, messages: [{ role: "user", content: "do it" }] });

    expect(writeHandler).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("I'll do the thing.");
    expect(result.pendingAction).toMatchObject({
      toolName: "do_thing",
      input: { target: "abc" },
      preview: { title: "Do the thing to abc", confirmLabel: "Do it" },
    });
  });

  it("feeds an invalid write input back as an error tool_result and continues", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "do_thing", input: { wrong: true } }],
        usage,
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "sorry" }], usage });

    const result = await runAgentTurn({ ctx, registry, messages: [{ role: "user", content: "do it" }] });

    expect(writeHandler).not.toHaveBeenCalled();
    expect(result.pendingAction).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    // The second call carries an is_error tool_result for the bad proposal.
    const secondMessages = create.mock.calls[1]![0].messages;
    const toolResults = secondMessages.at(-1).content;
    expect(toolResults[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
  });

  it("feeds a failed preview (unknown target) back so the model can self-correct", async () => {
    writePreview.mockRejectedValueOnce(new Error("No resident with that email."));
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "do_thing", input: { target: "ghost" } }],
        usage,
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "not found" }], usage });

    const result = await runAgentTurn({ ctx, registry, messages: [{ role: "user", content: "do it" }] });

    expect(writeHandler).not.toHaveBeenCalled();
    expect(result.pendingAction).toBeUndefined();
    expect(result.toolTrace).toEqual([{ tool: "do_thing", ok: false }]);
  });

  it("collapses a mixed read+write response to a single pending action", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tu_r", name: "list_things", input: {} },
        { type: "tool_use", id: "tu_w1", name: "do_thing", input: { target: "abc" } },
        { type: "tool_use", id: "tu_w2", name: "do_thing", input: { target: "xyz" } },
      ],
      usage,
    });

    const result = await runAgentTurn({ ctx, registry, messages: [{ role: "user", content: "do it" }] });

    // The read before the write still executed; the first write became the
    // proposal; the second write was never previewed or executed.
    expect(readHandler).toHaveBeenCalledTimes(1);
    expect(writeHandler).not.toHaveBeenCalled();
    expect(writePreview).toHaveBeenCalledTimes(1);
    expect(result.pendingAction?.input).toEqual({ target: "abc" });
  });
});

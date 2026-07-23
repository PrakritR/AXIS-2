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

const ctx = {
  landlordId: "manager_a",
  userId: "manager_a",
  email: "m@axis.test",
  roles: ["manager"],
  isAdmin: false,
  db: {},
} as unknown as AgentContext;

const executeSpy = vi.fn();

function makeRegistry(opts: { previewOk?: boolean } = {}) {
  const previewOk = opts.previewOk ?? true;
  const readTool = defineTool({
    name: "read_things",
    description: "Read some things for the test.",
    kind: "read",
    inputSchema: z.object({}).strict(),
    handler: async () => ({ things: [1, 2, 3] }),
  });
  const writeTool = defineWriteTool({
    name: "do_thing",
    description: "Do a thing.",
    destructive: false,
    inputSchema: z.object({ targetId: z.string() }).strict(),
    preview: async (_ctx, input) => {
      if (!previewOk) throw new Error("target not found");
      return {
        kind: "do_thing",
        title: "Do thing",
        confirmLabel: "Do it",
        summary: `Will do ${input.targetId}.`,
        fields: [],
      };
    },
    handler: async (_ctx, input) => {
      executeSpy(input);
      return { reply: "did it" };
    },
  });
  // A write the SURFACE allow-lists runs inline like a read; nothing about the
  // tool itself opts out of the gate.
  const inlineWrite = defineWriteTool({
    name: "quick_flag",
    description: "Low-risk inline write.",
    inputSchema: z.object({ targetId: z.string() }).strict(),
    preview: async () => ({ kind: "quick_flag", title: "Flag", confirmLabel: "Flag", fields: [] }),
    handler: async (_ctx, input) => {
      executeSpy(input);
      return { reply: "flagged" };
    },
  });
  return buildRegistry([readTool, writeTool, inlineWrite]);
}

const usage = { input_tokens: 10, output_tokens: 5 };

describe("runAgentTurn write-proposal halting", () => {
  beforeEach(() => {
    create.mockReset();
    executeSpy.mockReset();
  });

  it("halts the turn with a pendingAction when a gated write's preview succeeds — and never executes", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "I'll do the thing." },
        { type: "tool_use", id: "tu_1", name: "do_thing", input: { targetId: "t1" } },
      ],
      usage,
    });

    const result = await runAgentTurn({
      ctx,
      registry: makeRegistry(),
      messages: [{ role: "user", content: "do the thing to t1" }],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.pendingAction).toMatchObject({
      toolName: "do_thing",
      input: { targetId: "t1" },
      destructive: false,
    });
    expect(result.pendingAction!.preview.title).toBe("Do thing");
    expect(result.reply).toBe("I'll do the thing.");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("feeds a failed preview back as a tool_result error so the model can self-correct", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "do_thing", input: { targetId: "bad" } }],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "That target doesn't exist." }],
        usage,
      });

    const result = await runAgentTurn({
      ctx,
      registry: makeRegistry({ previewOk: false }),
      messages: [{ role: "user", content: "do the thing" }],
    });

    expect(create).toHaveBeenCalledTimes(2);
    // The second call's transcript must contain an is_error tool_result for the write.
    const secondCallMessages = create.mock.calls[1]![0].messages;
    const lastUser = secondCallMessages[secondCallMessages.length - 1];
    expect(lastUser.role).toBe("user");
    expect(lastUser.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tu_1",
      is_error: true,
      content: "target not found",
    });
    expect(result.pendingAction).toBeUndefined();
    expect(result.reply).toBe("That target doesn't exist.");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("still runs sibling read tools on the failed-preview path", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_r", name: "read_things", input: {} },
          { type: "tool_use", id: "tu_w", name: "do_thing", input: { targetId: "bad" } },
        ],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "ok" }],
        usage,
      });

    const result = await runAgentTurn({
      ctx,
      registry: makeRegistry({ previewOk: false }),
      messages: [{ role: "user", content: "read then do" }],
    });

    const secondCallMessages = create.mock.calls[1]![0].messages;
    const lastUser = secondCallMessages[secondCallMessages.length - 1];
    const results = lastUser.content as { tool_use_id: string; is_error?: boolean }[];
    const readResult = results.find((r) => r.tool_use_id === "tu_r")!;
    const writeResult = results.find((r) => r.tool_use_id === "tu_w")!;
    expect(readResult.is_error).toBe(false);
    expect(writeResult.is_error).toBe(true);
    expect(result.toolTrace).toContainEqual({ tool: "read_things", ok: true });
  });

  it("honors only the FIRST gated write when the model proposes several at once", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tu_1", name: "do_thing", input: { targetId: "t1" } },
        { type: "tool_use", id: "tu_2", name: "do_thing", input: { targetId: "t2" } },
      ],
      usage,
    });

    const result = await runAgentTurn({
      ctx,
      registry: makeRegistry(),
      messages: [{ role: "user", content: "do both" }],
    });

    expect(result.pendingAction).toMatchObject({ input: { targetId: "t1" } });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("executes an allow-listed write inline like a read and continues the loop", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "quick_flag", input: { targetId: "t9" } }],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "flagged it" }],
        usage,
      });

    const result = await runAgentTurn({
      ctx,
      registry: makeRegistry(),
      messages: [{ role: "user", content: "flag t9" }],
      allowWriteTools: ["quick_flag"],
    });

    expect(executeSpy).toHaveBeenCalledWith({ targetId: "t9" });
    expect(result.pendingAction).toBeUndefined();
    expect(result.reply).toBe("flagged it");
    expect(result.toolTrace).toContainEqual({ tool: "quick_flag", ok: true });
  });

  it("reports the proposal through the observer", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_1", name: "do_thing", input: { targetId: "t1" } }],
      usage,
    });
    const events: unknown[] = [];

    await runAgentTurn({
      ctx,
      registry: makeRegistry(),
      messages: [{ role: "user", content: "do it" }],
      observer: { onPendingAction: (e) => events.push(e) },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ toolName: "do_thing", ok: true });
  });
});

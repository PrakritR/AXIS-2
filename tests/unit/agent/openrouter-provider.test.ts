import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { completeAgentModel } from "@/lib/agent/provider";

const selection = {
  model: "google/gemini-3.5-flash-lite",
  tier: "simple" as const,
  provider: "openrouter" as const,
  route: "fast_lookup" as const,
  fallbackModel: "claude-sonnet-4-6",
};

describe("OpenRouter agent provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses no-collection provider routing and normalizes function calls", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call_1", function: { name: "list_charges", arguments: '{"limit":5}' } }] } }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await completeAgentModel({
      selection,
      system: "system",
      tools: [{ name: "list_charges", description: "List charges", input_schema: { type: "object" } }],
      messages: [{ role: "user", content: "list charges" }] as Anthropic.MessageParam[],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.provider).toEqual({ data_collection: "deny", require_parameters: true });
    expect(body.tools[0].function.name).toBe("list_charges");
    expect(result.provider).toBe("openrouter");
    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toMatchObject([{ type: "tool_use", name: "list_charges", input: { limit: 5 } }]);
  });
});

import { describe, it, expect } from "vitest";
import { buildTraceObserver, type TraceLike, type TraceActor } from "@/lib/observability/langfuse";

const ctx: TraceActor = {
  userId: "manager_a",
  metadata: { landlordId: "manager_a", role: "manager" },
};

function fakeTrace() {
  const calls = { update: [] as unknown[], generation: [] as unknown[], span: [] as unknown[] };
  const trace: TraceLike = {
    update: (a) => void calls.update.push(a),
    generation: (a) => void calls.generation.push(a),
    span: (a) => void calls.span.push(a),
  };
  return { trace, calls };
}

describe("buildTraceObserver", () => {
  it("records tools-available, a costed per-call generation, and a tool span", () => {
    const { trace, calls } = fakeTrace();
    const obs = buildTraceObserver(trace, ctx);

    obs.onStart!({ system: "SYS", toolsAvailable: ["list_things"], model: "claude-haiku-4-5", tier: "simple" });
    obs.onLlmCall!({
      iteration: 0,
      model: "claude-haiku-4-5",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }, // $1 in + $5 out = $6
      stopReason: "tool_use",
      toolsChosen: ["list_things"],
      input: [{ role: "user", content: "hi" }],
      assistantContent: [],
    });
    obs.onToolCall!({ iteration: 0, name: "list_things", input: { limit: 2 }, ok: true, output: { things: ["a"] } });

    const start = calls.update[0] as { metadata: { toolsAvailable: string[]; systemPromptChars: number } };
    expect(start.metadata.toolsAvailable).toEqual(["list_things"]);
    expect(start.metadata.systemPromptChars).toBe(3);

    const gen = calls.generation[0] as {
      usage: { input: number; output: number };
      metadata: { estimatedCostUsd: number; landlordId: string };
    };
    expect(gen.usage).toEqual({ input: 1_000_000, output: 1_000_000, unit: "TOKENS" });
    expect(gen.metadata.estimatedCostUsd).toBeCloseTo(6, 5);
    expect(gen.metadata.landlordId).toBe("manager_a");

    const span = calls.span[0] as { name: string; input: unknown; output: unknown; metadata: { ok: boolean } };
    expect(span.name).toBe("tool:list_things");
    expect(span.input).toEqual({ limit: 2 });
    expect(span.output).toEqual({ things: ["a"] });
    expect(span.metadata.ok).toBe(true);
  });

  it("swallows errors thrown by the trace so tracing never breaks a turn", () => {
    const trace: TraceLike = {
      update: () => {
        throw new Error("boom");
      },
      generation: () => {
        throw new Error("boom");
      },
      span: () => {
        throw new Error("boom");
      },
    };
    const obs = buildTraceObserver(trace, ctx);
    expect(() => {
      obs.onStart!({ system: "x", toolsAvailable: [], model: "m", tier: "standard" });
      obs.onLlmCall!({
        iteration: 0,
        model: "m",
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: null,
        toolsChosen: [],
        input: [],
        assistantContent: [],
      });
      obs.onToolCall!({ iteration: 0, name: "t", input: {}, ok: false, output: "err" });
    }).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { buildTraceObserver, type TraceLike, type TraceActor } from "@/lib/observability/langfuse";

const ctx: TraceActor = {
  userId: "manager_a",
  metadata: { landlordId: "manager_a", role: "manager" },
};

function fakeTrace() {
  const calls = {
    update: [] as unknown[],
    generation: [] as unknown[],
    span: [] as unknown[],
    generationEnd: 0,
    spanEnd: 0,
  };
  const trace: TraceLike = {
    update: (a) => void calls.update.push(a),
    generation: (a) => {
      calls.generation.push(a);
      return { end: () => void (calls.generationEnd += 1) };
    },
    span: (a) => {
      calls.span.push(a);
      return { end: () => void (calls.spanEnd += 1) };
    },
  };
  return { trace, calls };
}

describe("buildTraceObserver", () => {
  it("records tools-available, a costed per-call generation, and a tool span", () => {
    const { trace, calls } = fakeTrace();
    const { observer: obs, getEvidence } = buildTraceObserver(trace, ctx);

    obs.onStart!({
      system: "SYS",
      toolsAvailable: ["list_things"],
      model: "claude-haiku-4-5",
      tier: "simple",
      provider: "anthropic",
      route: "anthropic",
    });
    obs.onLlmCall!({
      iteration: 0,
      model: "claude-haiku-4-5",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }, // $1 in + $5 out = $6
      stopReason: "tool_use",
      toolsChosen: ["list_things"],
      provider: "anthropic",
      route: "anthropic",
      latencyMs: 12,
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
    expect(calls.generationEnd).toBe(1);
    expect(calls.spanEnd).toBe(1);
    expect(getEvidence()).toEqual([{ name: "list_things", ok: true, output: { things: ["a"] } }]);
  });

  it("stamps prompt metadata when provided", () => {
    const { trace, calls } = fakeTrace();
    const { observer: obs } = buildTraceObserver(trace, ctx, {
      promptId: "manager-assistant",
      promptHash: "abc",
      release: "deadbeef",
    });
    obs.onStart!({
      system: "SYS",
      toolsAvailable: [],
      model: "m",
      tier: "simple",
      provider: "anthropic",
      route: "anthropic",
    });
    const start = calls.update[0] as {
      metadata: { promptId: string; promptHash: string; release: string };
    };
    expect(start.metadata.promptId).toBe("manager-assistant");
    expect(start.metadata.promptHash).toBe("abc");
    expect(start.metadata.release).toBe("deadbeef");
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
    const { observer: obs } = buildTraceObserver(trace, ctx);
    expect(() => {
      obs.onStart!({
        system: "x",
        toolsAvailable: [],
        model: "m",
        tier: "standard",
        provider: "anthropic",
        route: "anthropic",
      });
      obs.onLlmCall!({
        iteration: 0,
        model: "m",
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: null,
        toolsChosen: [],
        provider: "anthropic",
        route: "anthropic",
        latencyMs: 1,
        input: [],
        assistantContent: [],
      });
      obs.onToolCall!({ iteration: 0, name: "t", input: {}, ok: false, output: "err" });
    }).not.toThrow();
  });
});

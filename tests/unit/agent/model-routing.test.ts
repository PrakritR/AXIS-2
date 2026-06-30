import { describe, it, expect, afterEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  classifyComplexity,
  selectModel,
  estimateCostUsd,
  TIER_MODELS,
} from "@/lib/agent/model";

const userTurn = (content: string): Anthropic.MessageParam => ({ role: "user", content });

/** Build a conversation ending in a user message of the given text. */
function convo(lastUser: string, priorTurns = 0): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (let i = 0; i < priorTurns; i++) {
    msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i}` });
  }
  msgs.push(userTurn(lastUser));
  return msgs;
}

describe("classifyComplexity", () => {
  it("routes trivial greetings and acknowledgements to simple", () => {
    for (const t of ["hi", "Hello", "thanks!", "ok", "got it", "yes"]) {
      expect(classifyComplexity(convo(t))).toBe("simple");
    }
  });

  it("routes ordinary single-fact lookups to standard", () => {
    expect(classifyComplexity(convo("What is my current rent roll?"))).toBe("standard");
    expect(classifyComplexity(convo("Show me overdue charges for 12 Oak St"))).toBe("standard");
    expect(classifyComplexity(convo("List my open work orders"))).toBe("standard");
  });

  it("routes analytical intent to complex", () => {
    expect(classifyComplexity(convo("Compare delinquency across all my properties"))).toBe("complex");
    expect(classifyComplexity(convo("Why is my income down this quarter?"))).toBe("complex");
    expect(classifyComplexity(convo("Forecast next month's cash flow"))).toBe("complex");
    expect(classifyComplexity(convo("Break down vendor spend by category"))).toBe("complex");
  });

  it("routes multi-question turns to complex", () => {
    expect(
      classifyComplexity(convo("How many units are vacant? And which leases expire soon?")),
    ).toBe("complex");
  });

  it("routes long prompts to complex", () => {
    const long = `I need a full summary of ${"property and lease and payment ".repeat(20)} please`;
    expect(classifyComplexity(convo(long))).toBe("complex");
  });

  it("escalates deep conversations to complex even on a short final message", () => {
    expect(classifyComplexity(convo("and that one?", 12))).toBe("complex");
  });

  it("does not drop a short follow-up question to simple", () => {
    // Short, but a real question past the opening turns: stays standard, not simple.
    expect(classifyComplexity(convo("the Oak St one?", 4))).toBe("standard");
  });
});

describe("selectModel", () => {
  it("maps each tier to its configured model (defaults)", () => {
    expect(selectModel(convo("hi"))).toEqual({ model: TIER_MODELS.simple, tier: "simple" });
    expect(selectModel(convo("list my leases"))).toEqual({
      model: TIER_MODELS.standard,
      tier: "standard",
    });
    expect(selectModel(convo("analyze my delinquency trend"))).toEqual({
      model: TIER_MODELS.complex,
      tier: "complex",
    });
  });

  it("uses the documented default model ids", () => {
    expect(TIER_MODELS.simple).toBe("claude-haiku-4-5");
    expect(TIER_MODELS.standard).toBe("claude-sonnet-4-6");
    expect(TIER_MODELS.complex).toBe("claude-opus-4-8");
  });
});

describe("estimateCostUsd", () => {
  it("prices a turn from accumulated token usage", () => {
    // 1M input + 1M output on Opus = $5 + $25.
    expect(estimateCostUsd("claude-opus-4-8", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(30);
    // Haiku is cheapest.
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1);
  });

  it("returns 0 for an unknown model rather than throwing", () => {
    expect(estimateCostUsd("some-future-model", { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
  });
});

describe("env overrides", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("honors per-tier env overrides", async () => {
    vi.stubEnv("AXIS_AGENT_MODEL", "");
    vi.stubEnv("AXIS_AGENT_MODEL_SIMPLE", "model-simple-x");
    vi.stubEnv("AXIS_AGENT_MODEL_COMPLEX", "model-complex-x");
    vi.resetModules();
    const mod = await import("@/lib/agent/model");
    expect(mod.TIER_MODELS.simple).toBe("model-simple-x");
    expect(mod.TIER_MODELS.complex).toBe("model-complex-x");
    expect(mod.TIER_MODELS.standard).toBe("claude-sonnet-4-6");
  });

  it("AXIS_AGENT_MODEL forces one model for every tier", async () => {
    vi.stubEnv("AXIS_AGENT_MODEL", "forced-model");
    vi.resetModules();
    const mod = await import("@/lib/agent/model");
    expect(mod.TIER_MODELS.simple).toBe("forced-model");
    expect(mod.TIER_MODELS.standard).toBe("forced-model");
    expect(mod.TIER_MODELS.complex).toBe("forced-model");
    expect(mod.AGENT_MODEL).toBe("forced-model");
  });
});

/**
 * PostHog AI Observability. Captures $ai_generation events for each agent turn
 * using the existing posthog-node client. No-ops when the PostHog key is unset.
 *
 * One event is emitted per turn, aggregating token counts across all iterations
 * of the agent loop (each loop iteration is a separate Anthropic call). This
 * matches the Langfuse tracing model already in place.
 *
 * Properties follow the PostHog $ai_generation schema. Input/output message
 * content is intentionally omitted to avoid sending user-generated content as
 * event properties (per platform PII policy).
 */
import { randomUUID } from "crypto";
import { capture } from "@/lib/analytics/posthog";
import { estimateCostUsd, MODEL_PRICING } from "@/lib/agent/model";
import type { AgentContext } from "@/lib/tools/context";

type TurnUsage = { inputTokens: number; outputTokens: number };
type TracedResult = {
  reply: string;
  toolTrace: { tool: string; ok: boolean }[];
  model?: string;
  tier?: string;
  usage?: TurnUsage;
};

/**
 * Wrap an agent turn to emit a PostHog $ai_generation event. The event carries
 * model, token counts, latency, cost, and the list of tools used — all safe,
 * non-PII metadata. The wrapped function's result is always returned unchanged.
 */
export async function captureAiTurn<T extends TracedResult>(
  ctx: AgentContext,
  run: () => Promise<T>,
): Promise<T> {
  const traceId = randomUUID();
  const startMs = Date.now();

  try {
    const result = await run();
    const latencySeconds = (Date.now() - startMs) / 1000;

    if (result.model && result.usage) {
      const pricing = MODEL_PRICING[result.model];
      const totalCostUsd = estimateCostUsd(result.model, result.usage);

      capture("$ai_generation", ctx.userId, {
        $ai_trace_id: traceId,
        $ai_model: result.model,
        $ai_provider: "anthropic",
        $ai_input_tokens: result.usage.inputTokens,
        $ai_output_tokens: result.usage.outputTokens,
        $ai_latency: latencySeconds,
        $ai_total_cost_usd: totalCostUsd,
        ...(pricing && {
          $ai_input_token_price: pricing.inputPerMTok / 1_000_000,
          $ai_output_token_price: pricing.outputPerMTok / 1_000_000,
        }),
        $ai_tools: result.toolTrace.map((t) => t.tool),
        landlord_id: ctx.landlordId,
        model_tier: result.tier ?? "",
      });
    }

    return result;
  } catch (e) {
    const latencySeconds = (Date.now() - startMs) / 1000;
    capture("$ai_generation", ctx.userId, {
      $ai_trace_id: traceId,
      $ai_provider: "anthropic",
      $ai_is_error: true,
      $ai_error: e instanceof Error ? e.message : "Unknown error",
      $ai_latency: latencySeconds,
      landlord_id: ctx.landlordId,
    });
    throw e;
  }
}

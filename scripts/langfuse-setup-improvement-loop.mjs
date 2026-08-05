#!/usr/bin/env node
/**
 * One-shot setup for the Langfuse project:
 *   1. Ensure dataset `agent-rejected-actions` exists
 *   2. Create (or version) the `numeric-grounding` LLM-as-judge evaluator
 *   3. Create an evaluation rule targeting `axis-agent-turn-summary` at 100%
 *
 * Observation evaluators cannot read sibling tool spans — the app already emits
 * `axis-agent-turn-summary` with `{ userRequest, toolEvidence }` as input and
 * the final reply as output.
 *
 * Usage:
 *   vercel env run -e production -- npm run langfuse:setup
 */
import { createLangfuseClient, langfuseFetch } from "./lib/langfuse-ops.mjs";

const DATASET = process.env.LANGFUSE_REJECTED_ACTIONS_DATASET?.trim() || "agent-rejected-actions";
const EVALUATOR_NAME = "numeric-grounding";
const SCORE_NAME = "numeric-grounding";
const OBSERVATION_NAME = "axis-agent-turn-summary";
const RULE_NAME = SCORE_NAME;

export const NUMERIC_GROUNDING_JUDGE_PROMPT = `You are grading whether an AI property-management assistant's reply is numerically grounded in the tool evidence from the SAME turn.

INPUT:
{{input}}

OUTPUT (assistant reply):
{{output}}

Task:
1. Extract every factual numeric claim in the reply (money amounts, counts, percentages, dates with numbers, numeric ids). Ignore pure greetings, UI navigation, and soft hedges.
2. For each claim, decide if the same-turn toolEvidence supports it (exact or clearly equivalent value present in a tool output).
3. If the reply has NO applicable numeric claims, pass (score true).
4. Fail (score false) if ANY applicable claim is unsupported or contradicted by the evidence.

Return a boolean score with short reasoning listing ungrounded claims (numbers only — no names/emails).`;

async function ensureDataset(lf) {
  try {
    await lf.createDataset({
      name: DATASET,
      description:
        "Write proposals users denied. Replay to check candidate prompts avoid the same tool/args. Anti-regression only.",
    });
    console.log(`Created dataset ${DATASET}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already|409|conflict/i.test(msg)) console.log(`Dataset ${DATASET} already exists`);
    else {
      try {
        await langfuseFetch(`/api/public/v2/datasets/${encodeURIComponent(DATASET)}`);
        console.log(`Dataset ${DATASET} reachable`);
      } catch {
        throw e;
      }
    }
  }
}

async function ensureAnthropicConnection() {
  const secretKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!secretKey) {
    console.warn("ANTHROPIC_API_KEY unset — cannot auto-configure Langfuse LLM connection.");
    return null;
  }
  const existing = await langfuseFetch("/api/public/llm-connections", {
    query: { page: 1, limit: 50 },
  });
  const data = Array.isArray(existing?.data) ? existing.data : [];
  const already = data.find((c) => c?.adapter === "anthropic" || c?.provider === "anthropic");
  if (already) {
    console.log(`LLM connection already present provider=${already.provider} id=${already.id}`);
    return already;
  }
  const created = await langfuseFetch("/api/public/llm-connections", {
    method: "PUT",
    body: {
      provider: "anthropic",
      adapter: "anthropic",
      secretKey,
      withDefaultModels: true,
    },
  });
  console.log(`Created Anthropic LLM connection id=${created?.id ?? "?"}`);
  return created;
}

async function ensureEvaluator() {
  const body = {
    type: "llm_as_judge",
    name: EVALUATOR_NAME,
    prompt: NUMERIC_GROUNDING_JUDGE_PROMPT,
    outputDefinition: {
      dataType: "BOOLEAN",
      reasoning: {
        description: "Short reason listing any ungrounded numeric claims (numbers only).",
      },
      score: {
        description: "true if every applicable numeric claim is grounded in toolEvidence; false otherwise.",
      },
    },
    modelConfig: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
    },
  };
  const listed = await langfuseFetch("/api/public/unstable/evaluators", {
    query: { page: 1, limit: 100 },
  }).catch(() => ({ data: [] }));
  const evaluators = Array.isArray(listed?.data) ? listed.data : [];
  const existing = evaluators.find(
    (e) =>
      e?.name === EVALUATOR_NAME &&
      e?.scope === "project" &&
      e?.type === body.type,
  );
  if (
    existing &&
    existing.prompt === body.prompt &&
    existing.outputDefinition?.dataType === body.outputDefinition.dataType &&
    existing.modelConfig?.provider === body.modelConfig.provider &&
    existing.modelConfig?.model === body.modelConfig.model
  ) {
    console.log(
      `Evaluator already current name=${EVALUATOR_NAME} version=${existing.version ?? "?"} id=${existing.id ?? "?"}`,
    );
    return existing;
  }
  try {
    const created = await langfuseFetch("/api/public/unstable/evaluators", {
      method: "POST",
      body,
    });
    console.log(
      `Evaluator ${EVALUATOR_NAME} version=${created?.version ?? "?"} id=${created?.id ?? "?"} scope=${created?.scope ?? "?"}`,
    );
    return created;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Preflight often fails when no default eval model is configured — surface that clearly.
    if (/preflight|422|model/i.test(msg)) {
      console.warn(`Evaluator create needs a project default eval model (or modelConfig): ${msg}`);
      console.warn("Create the evaluator from the Langfuse UI once a judge model is configured, then re-run.");
      return null;
    }
    throw e;
  }
}

async function ensureEvaluationRule(evaluator) {
  if (!evaluator) return;
  const existing = await langfuseFetch("/api/public/unstable/evaluation-rules", {
    query: { page: 1, limit: 50 },
  }).catch(() => ({ data: [] }));
  const rules = Array.isArray(existing?.data) ? existing.data : [];
  const already = rules.find(
    (r) =>
      r?.name === RULE_NAME ||
      r?.name === "numeric-grounding-on-turn-summary" ||
      (r?.evaluator?.name === EVALUATOR_NAME && /turn-summary|axis-agent-turn-summary/i.test(JSON.stringify(r))),
  );
  if (already) {
    if (already.name !== RULE_NAME) {
      const updated = await langfuseFetch(
        `/api/public/unstable/evaluation-rules/${encodeURIComponent(already.id)}`,
        {
          method: "PATCH",
          body: { name: RULE_NAME },
        },
      );
      console.log(`Renamed evaluation rule ${already.name} → ${RULE_NAME}`);
      return updated;
    }
    console.log(`Evaluation rule already present id=${already.id} status=${already.status ?? "?"}`);
    return already;
  }

  const ruleBody = {
    name: RULE_NAME,
    target: "observation",
    enabled: true,
    sampling: 1,
    evaluator: {
      name: EVALUATOR_NAME,
      scope: evaluator.scope || "project",
      type: "llm_as_judge",
    },
    filter: [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: [OBSERVATION_NAME],
      },
    ],
    mapping: [
      { variable: "input", source: "input" },
      { variable: "output", source: "output" },
    ],
  };

  try {
    const created = await langfuseFetch("/api/public/unstable/evaluation-rules", {
      method: "POST",
      body: ruleBody,
    });
    console.log(`Created evaluation rule id=${created?.id ?? "?"} status=${created?.status ?? "?"}`);
    return created;
  } catch (e) {
    console.warn(`Evaluation rule API rejected payload: ${e instanceof Error ? e.message : e}`);
    console.warn("Apply this rule in the Langfuse UI:");
    console.warn(JSON.stringify(ruleBody, null, 2));
    return null;
  }
}

async function ensureDashboard() {
  const existing = await langfuseFetch("/api/public/unstable/dashboards", {
    query: { page: 1, limit: 50 },
  }).catch(() => ({ data: [] }));
  const data = Array.isArray(existing?.data) ? existing.data : [];
  const already = data.find((d) => d?.name === "Agent improvement loop");
  if (already) {
    console.log(`Dashboard already present id=${already.id}`);
    return already;
  }
  try {
    const created = await langfuseFetch("/api/public/unstable/dashboards", {
      method: "POST",
      body: {
        name: "Agent improvement loop",
        description:
          "Approval rate, numeric grounding, and loop-health signals for the PropLane assistant. Use npm run langfuse:agent-health-report for the portable fallback.",
      },
    });
    console.log(`Created dashboard id=${created?.id ?? "?"}`);
    return created;
  } catch (e) {
    console.warn(`Dashboard create skipped: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function main() {
  const lf = createLangfuseClient();
  await ensureDataset(lf);
  try {
    await lf.flushAsync();
  } catch {
    /* ignore */
  }

  await ensureAnthropicConnection();
  const evaluator = await ensureEvaluator();
  await ensureEvaluationRule(evaluator);
  const dashboard = await ensureDashboard();

  console.log(`
# Langfuse improvement-loop status

- Dataset: ${DATASET}
- Evaluator: ${EVALUATOR_NAME} (score ${SCORE_NAME})
- Observation filter: name = ${OBSERVATION_NAME}
- Sampling: 100%
- Dashboard: ${dashboard?.id ? `Agent improvement loop (${dashboard.id})` : "(create in UI if needed)"}
- Populate denials: npm run langfuse:sync-eval-dataset
- Health: npm run langfuse:agent-health-report
`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

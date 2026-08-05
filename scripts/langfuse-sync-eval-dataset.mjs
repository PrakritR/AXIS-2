#!/usr/bin/env node
/**
 * Sync denied write proposals (`action-approved = 0`) into the Langfuse
 * dataset `agent-rejected-actions`. Idempotent: dataset item id is
 * `eval-{traceId}`, so re-runs upsert.
 *
 * Usage:
 *   node --env-file=.env.local scripts/langfuse-sync-eval-dataset.mjs
 *   # or with env already exported from `vercel env pull`
 *
 * This is an anti-regression feed: each item carries the generation input that
 * led to the rejected tool proposal, plus a rubric describing which tool/args
 * must NOT be proposed again unchanged. It does not prove an alternative is
 * correct — only that the previously-wrong proposal was avoided.
 */
import { createLangfuseClient, langfuseFetch } from "./lib/langfuse-ops.mjs";

const DATASET = process.env.LANGFUSE_REJECTED_ACTIONS_DATASET?.trim() || "agent-rejected-actions";
const SCORE_NAME = "action-approved";
const PAGE_SIZE = 50;

function parseArgs(argv) {
  const out = { limit: 200, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--limit" && argv[i + 1]) out.limit = Number(argv[++i]);
  }
  return out;
}

function extractPending(trace) {
  const meta = trace?.metadata && typeof trace.metadata === "object" ? trace.metadata : {};
  const observations = Array.isArray(trace?.observations) ? trace.observations : [];
  const pendingSpan = observations.find((o) => typeof o?.name === "string" && o.name.startsWith("pending:"));
  const toolName =
    (typeof meta.pendingAction === "string" && meta.pendingAction) ||
    (pendingSpan?.name ? String(pendingSpan.name).replace(/^pending:/, "") : null);
  const preview = pendingSpan?.output ?? null;
  const generation = observations.find((o) => o?.type === "GENERATION" || o?.name === "axis-agent-llm");
  return {
    toolName,
    preview,
    generationInput: generation?.input ?? trace?.input ?? null,
    promptId: meta.promptId ?? null,
    promptHash: meta.promptHash ?? null,
    release: meta.release ?? null,
  };
}

async function ensureDataset(lf) {
  try {
    await lf.createDataset({
      name: DATASET,
      description:
        "Write proposals users denied. Replay to check candidate prompts avoid the same tool/args. Anti-regression only.",
    });
  } catch (e) {
    // Already exists is fine — createDataset is not always idempotent by name.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists|409|conflict/i.test(msg)) {
      // Try fetch — if the dataset is listable we can continue.
      try {
        await langfuseFetch(`/api/public/v2/datasets/${encodeURIComponent(DATASET)}`);
      } catch {
        throw e;
      }
    }
  }
}

async function listDeniedScores(limit) {
  const items = [];
  let page = 1;
  while (items.length < limit) {
    const batch = await langfuseFetch("/api/public/v2/scores", {
      query: {
        name: SCORE_NAME,
        page,
        limit: Math.min(PAGE_SIZE, limit - items.length),
      },
    });
    const data = Array.isArray(batch?.data) ? batch.data : [];
    if (data.length === 0) break;
    for (const score of data) {
      const value = typeof score.value === "number" ? score.value : Number(score.value);
      if (value === 0 && score.traceId) items.push(score);
    }
    if (data.length < PAGE_SIZE) break;
    page += 1;
  }
  return items.slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lf = createLangfuseClient();
  await ensureDataset(lf);

  const scores = await listDeniedScores(args.limit);
  console.log(`Found ${scores.length} action-approved=0 score(s).`);

  let upserted = 0;
  let skipped = 0;
  for (const score of scores) {
    const traceId = String(score.traceId);
    let trace;
    try {
      trace = await langfuseFetch(`/api/public/traces/${encodeURIComponent(traceId)}`);
    } catch (e) {
      console.warn(`skip ${traceId}: ${e instanceof Error ? e.message : e}`);
      skipped += 1;
      continue;
    }
    const extracted = extractPending(trace);
    if (!extracted.toolName) {
      console.warn(`skip ${traceId}: no pendingAction / pending:* span`);
      skipped += 1;
      continue;
    }
    const item = {
      id: `eval-${traceId}`,
      datasetName: DATASET,
      input: {
        generationInput: extracted.generationInput,
        userInput: trace.input ?? null,
      },
      expectedOutput: {
        avoidTool: extracted.toolName,
        avoidUnchangedProposal: true,
        rejectedPreview: extracted.preview,
      },
      sourceTraceId: traceId,
      metadata: {
        reason: "denied",
        toolName: extracted.toolName,
        promptId: extracted.promptId,
        promptHash: extracted.promptHash,
        release: extracted.release,
        scoreId: score.id ?? null,
      },
    };
    if (args.dryRun) {
      console.log(`[dry-run] would upsert ${item.id} tool=${extracted.toolName}`);
      upserted += 1;
      continue;
    }
    await lf.createDatasetItem(item);
    upserted += 1;
  }

  try {
    await lf.flushAsync();
  } catch {
    /* ignore */
  }
  console.log(`Done. upserted=${upserted} skipped=${skipped} dataset=${DATASET}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

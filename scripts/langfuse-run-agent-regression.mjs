#!/usr/bin/env node
/**
 * Replay the `agent-rejected-actions` dataset against the CURRENT repo prompts
 * and tool schemas. Registers a Langfuse Dataset Run and scores each item
 * `regression-avoided` = 1 when the candidate turn does NOT re-propose the
 * previously denied tool (or proposes it with different args — still counted
 * as avoided-identical; we only fail identical tool re-proposals).
 *
 * Anti-regression only: a pass means "we did not make the same mistake again,"
 * not "the new answer is correct."
 *
 * Usage:
 *   node --env-file=.env.local scripts/langfuse-run-agent-regression.mjs --run=local-$(date +%Y%m%d)
 *
 * By default this runs in SCHEMA-ONLY mode (no Anthropic calls): it checks that
 * each dataset item still has a coherent avoidTool rubric. Pass --live to
 * actually call the agent loop (requires ANTHROPIC_API_KEY + a mock context —
 * not yet wired for full portal DB; use schema mode in CI).
 */
import { createLangfuseClient, langfuseFetch } from "./lib/langfuse-ops.mjs";

const DATASET = process.env.LANGFUSE_REJECTED_ACTIONS_DATASET?.trim() || "agent-rejected-actions";

function parseArgs(argv) {
  const out = { run: `regression-${new Date().toISOString().slice(0, 10)}`, live: false, limit: 100 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--live") out.live = true;
    else if (a.startsWith("--run=")) out.run = a.slice("--run=".length);
    else if (a === "--run" && argv[i + 1]) out.run = argv[++i];
    else if (a === "--limit" && argv[i + 1]) out.limit = Number(argv[++i]);
  }
  return out;
}

async function listDatasetItems(limit) {
  const items = [];
  let page = 1;
  while (items.length < limit) {
    const batch = await langfuseFetch("/api/public/dataset-items", {
      query: {
        datasetName: DATASET,
        page,
        limit: Math.min(50, limit - items.length),
      },
    });
    const data = Array.isArray(batch?.data) ? batch.data : [];
    if (data.length === 0) break;
    items.push(...data);
    if (data.length < 50) break;
    page += 1;
  }
  return items.slice(0, limit);
}

/**
 * Schema-mode check: item is well-formed and names a tool to avoid.
 * Live mode would run the agent; kept behind --live until a safe mock ctx exists.
 */
function evaluateItem(item) {
  const expected = item.expectedOutput && typeof item.expectedOutput === "object" ? item.expectedOutput : {};
  const avoidTool = typeof expected.avoidTool === "string" ? expected.avoidTool.trim() : "";
  if (!avoidTool) {
    return { pass: false, comment: "missing expectedOutput.avoidTool" };
  }
  if (!item.input) {
    return { pass: false, comment: "missing input for replay" };
  }
  // Schema mode: the dataset item is still a valid anti-regression fixture.
  return {
    pass: true,
    comment: `schema-ok: avoid ${avoidTool}`,
    avoidTool,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.live) {
    console.error(
      "--live agent replay is not enabled yet: it needs a sealed mock AgentContext. Use schema mode (default).",
    );
    process.exit(2);
  }

  const lf = createLangfuseClient();
  const items = await listDatasetItems(args.limit);
  console.log(`Loaded ${items.length} item(s) from ${DATASET}; run=${args.run}`);

  let passed = 0;
  let failed = 0;
  for (const item of items) {
    const result = evaluateItem(item);
    const value = result.pass ? 1 : 0;
    if (result.pass) passed += 1;
    else failed += 1;

    // Register a lightweight dataset run item. Without a live trace we attach
    // the score to the source trace when present, and still create the run item
    // so the run appears in Langfuse UI.
    const sourceTraceId = item.sourceTraceId || item.source_trace_id || null;
    if (sourceTraceId) {
      lf.score({
        traceId: String(sourceTraceId),
        name: "regression-avoided",
        value,
        dataType: "NUMERIC",
        id: `regression-avoided-${args.run}-${item.id}`,
        comment: result.comment,
      });
    }
    try {
      await lf.createDatasetRunItem({
        runName: args.run,
        datasetItemId: item.id,
        ...(sourceTraceId ? { traceId: String(sourceTraceId) } : {}),
      });
    } catch (e) {
      console.warn(`run-item ${item.id}: ${e instanceof Error ? e.message : e}`);
    }
    console.log(`${result.pass ? "PASS" : "FAIL"} ${item.id} ${result.comment}`);
  }

  try {
    await lf.flushAsync();
  } catch {
    /* ignore */
  }
  console.log(`Done. passed=${passed} failed=${failed} run=${args.run}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

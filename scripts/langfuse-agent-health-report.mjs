#!/usr/bin/env node
/**
 * Agent loop-health report from Langfuse Metrics / Observations / Scores APIs.
 *
 * Reports:
 *   - action-approved average (proposal trust)
 *   - numeric-grounding average (factual grounding)
 *   - user-rating average (sparse thumbs)
 *   - tool failure counts by tool name
 *   - max-iteration / terminationReason signals from turn-summary observations
 *
 * Usage:
 *   node --env-file=.env.local scripts/langfuse-agent-health-report.mjs
 *   node --env-file=.env.local scripts/langfuse-agent-health-report.mjs --days=7 --json
 */
import { langfuseFetch } from "./lib/langfuse-ops.mjs";

function parseArgs(argv) {
  const out = { days: 7, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a.startsWith("--days=")) out.days = Number(a.slice("--days=".length));
    else if (a === "--days" && argv[i + 1]) out.days = Number(argv[++i]);
  }
  return out;
}

function window(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60_000);
  return { fromTimestamp: from.toISOString(), toTimestamp: to.toISOString() };
}

async function scoreAvg(name, fromTimestamp, toTimestamp) {
  try {
    const res = await langfuseFetch("/api/public/v2/scores", {
      query: { name, limit: 100, fromTimestamp, toTimestamp },
    });
    const data = Array.isArray(res?.data) ? res.data : [];
    if (data.length === 0) return { name, count: 0, average: null, zeros: 0 };
    let sum = 0;
    let zeros = 0;
    for (const s of data) {
      const v = typeof s.value === "number" ? s.value : Number(s.value);
      if (!Number.isFinite(v)) continue;
      sum += v;
      if (v === 0) zeros += 1;
    }
    return { name, count: data.length, average: sum / data.length, zeros };
  } catch (e) {
    return { name, count: 0, average: null, zeros: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function toolFailureBreakdown(fromTimestamp, toTimestamp) {
  // Pull recent tool spans and aggregate ok=false client-side. Metrics API
  // metadata filters vary by plan; this is the portable fallback.
  const failures = new Map();
  let page = 1;
  let scanned = 0;
  while (page <= 10) {
    const batch = await langfuseFetch("/api/public/observations", {
      query: {
        type: "SPAN",
        fromStartTime: fromTimestamp,
        toStartTime: toTimestamp,
        limit: 100,
        page,
      },
    });
    const data = Array.isArray(batch?.data) ? batch.data : [];
    if (data.length === 0) break;
    for (const obs of data) {
      scanned += 1;
      const name = typeof obs?.name === "string" ? obs.name : "";
      if (!name.startsWith("tool:")) continue;
      const ok = obs?.metadata?.ok;
      if (ok === false || ok === "false") {
        const tool = name.slice("tool:".length);
        failures.set(tool, (failures.get(tool) || 0) + 1);
      }
    }
    if (data.length < 100) break;
    page += 1;
  }
  const ranked = [...failures.entries()].sort((a, b) => b[1] - a[1]);
  return { scanned, ranked };
}

async function turnSummaryStats(fromTimestamp, toTimestamp) {
  let page = 1;
  let summaries = 0;
  let maxIterations = 0;
  const terminations = new Map();
  while (page <= 10) {
    const batch = await langfuseFetch("/api/public/observations", {
      query: {
        name: "axis-agent-turn-summary",
        fromStartTime: fromTimestamp,
        toStartTime: toTimestamp,
        limit: 100,
        page,
      },
    });
    const data = Array.isArray(batch?.data) ? batch.data : [];
    if (data.length === 0) break;
    for (const obs of data) {
      summaries += 1;
      const reason = obs?.metadata?.terminationReason;
      if (typeof reason === "string") {
        terminations.set(reason, (terminations.get(reason) || 0) + 1);
        if (reason === "max_iterations") maxIterations += 1;
      }
    }
    if (data.length < 100) break;
    page += 1;
  }
  return {
    summaries,
    maxIterations,
    maxIterationRate: summaries ? maxIterations / summaries : null,
    terminations: Object.fromEntries(terminations),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { fromTimestamp, toTimestamp } = window(args.days);

  const [approved, grounding, rating, tools, turns] = await Promise.all([
    scoreAvg("action-approved", fromTimestamp, toTimestamp),
    scoreAvg("numeric-grounding", fromTimestamp, toTimestamp),
    scoreAvg("user-rating", fromTimestamp, toTimestamp),
    toolFailureBreakdown(fromTimestamp, toTimestamp),
    turnSummaryStats(fromTimestamp, toTimestamp),
  ]);

  const report = {
    window: { days: args.days, fromTimestamp, toTimestamp },
    scores: { approved, grounding, rating },
    tools,
    turns,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`# Agent health (${args.days}d)`);
  console.log(`Window: ${fromTimestamp} → ${toTimestamp}`);
  console.log("");
  console.log("## Scores");
  for (const s of [approved, grounding, rating]) {
    const avg = s.average == null ? "n/a" : s.average.toFixed(3);
    console.log(`- ${s.name}: avg=${avg} n=${s.count} zeros=${s.zeros}${s.error ? ` (error: ${s.error})` : ""}`);
  }
  console.log("");
  console.log("## Loop");
  console.log(
    `- turn summaries: ${turns.summaries}; max-iteration rate: ${
      turns.maxIterationRate == null ? "n/a" : (turns.maxIterationRate * 100).toFixed(1) + "%"
    }`,
  );
  console.log(`- terminations: ${JSON.stringify(turns.terminations)}`);
  console.log("");
  console.log("## Tool failures (ok=false)");
  if (tools.ranked.length === 0) console.log("- none in scanned window");
  else for (const [tool, n] of tools.ranked.slice(0, 20)) console.log(`- ${tool}: ${n}`);
  console.log(`(scanned ${tools.scanned} spans)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

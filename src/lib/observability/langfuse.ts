/**
 * Langfuse agent tracing. One trace per agent turn, carrying landlordId and the
 * user id so sessions are replayable and attributable. Degrades to a no-op when
 * Langfuse env is unset or the SDK misbehaves — tracing must never break a turn.
 */
import { Langfuse } from "langfuse";
import type { AgentContext } from "@/lib/tools/context";

let client: Langfuse | null = null;
let initialized = false;

function getClient(): Langfuse | null {
  if (initialized) return client;
  initialized = true;
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  if (!secretKey || !publicKey) return (client = null);
  try {
    client = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env.LANGFUSE_BASE_URL?.trim() || "https://us.cloud.langfuse.com",
    });
  } catch {
    client = null;
  }
  return client;
}

type TurnInput = { role: string; content: string }[];

/**
 * Wrap an agent turn in a Langfuse trace. The trace records the input, the final
 * reply, and the tools that ran, attributed to landlordId + userId. Failures in
 * tracing are swallowed; the wrapped function's result is always returned.
 */
export async function traceAgentTurn<T extends { reply: string; toolTrace: { tool: string; ok: boolean }[] }>(
  ctx: AgentContext,
  messages: TurnInput,
  run: () => Promise<T>,
): Promise<T> {
  const lf = getClient();
  if (!lf) return run();

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  let trace: ReturnType<Langfuse["trace"]> | null = null;
  try {
    trace = lf.trace({
      name: "axis-agent-turn",
      userId: ctx.userId,
      metadata: { landlordId: ctx.landlordId },
      input: lastUser,
    });
  } catch {
    trace = null;
  }

  try {
    const result = await run();
    try {
      trace?.update({
        output: result.reply,
        metadata: { landlordId: ctx.landlordId, tools: result.toolTrace.map((t) => t.tool) },
      });
    } catch {
      /* ignore */
    }
    return result;
  } catch (e) {
    try {
      trace?.update({ output: e instanceof Error ? e.message : "error" });
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    try {
      await lf.flushAsync();
    } catch {
      /* ignore */
    }
  }
}

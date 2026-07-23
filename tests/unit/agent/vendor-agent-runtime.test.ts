import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAlternatingHistory } from "@/lib/agent/vendor-agent.server";
import { buildRegistry, defineTool, defineWriteTool, runReadTool, toAnthropicTools } from "@/lib/tools/registry";
import { buildVendorAgentContext } from "@/lib/tools/context";

describe("buildAlternatingHistory", () => {
  it("merges consecutive same-role rows and drops a leading assistant run", () => {
    const history = buildAlternatingHistory([
      { role: "assistant", content: "opening" },
      { role: "user", content: "hola" },
      { role: "user", content: "cual es el codigo?" },
      { role: "assistant", content: "un momento" },
      { role: "user", content: "gracias" },
    ]);
    expect(history).toEqual([
      { role: "user", content: "hola\ncual es el codigo?" },
      { role: "assistant", content: "un momento" },
      { role: "user", content: "gracias" },
    ]);
  });

  it("drops empty rows", () => {
    expect(buildAlternatingHistory([{ role: "user", content: "  " }])).toEqual([]);
  });
});

describe("write-tool allowlist", () => {
  const readTool = defineTool({
    name: "read_thing",
    description: "read",
    kind: "read",
    inputSchema: z.object({}).strict(),
    handler: async () => ({ ok: true }),
  });
  const writeTool = defineWriteTool({
    name: "write_thing",
    description: "write",
    inputSchema: z.object({}).strict(),
    preview: async () => ({ kind: "write_thing", title: "Write", confirmLabel: "Do it", fields: [] }),
    handler: async () => ({ wrote: true }),
  });
  const registry = buildRegistry([readTool, writeTool]);
  const ctx = buildVendorAgentContext({} as never, {
    landlordId: "mgr-a",
    scope: { sessionId: "s", vendorDirectoryId: "v", vendorUserId: null, workOrderId: "w" },
  });

  it("write tools stay hidden and refused by default", async () => {
    expect(toAnthropicTools(registry, { readOnly: true }).map((t) => t.name)).toEqual(["read_thing"]);
    const refused = await runReadTool(registry, ctx, "write_thing", {});
    expect(refused.ok).toBe(false);
  });

  it("only an explicitly allowlisted write tool becomes callable", async () => {
    expect(toAnthropicTools(registry, { readOnly: true, allowWrite: ["write_thing"] }).map((t) => t.name)).toEqual([
      "read_thing",
      "write_thing",
    ]);
    const allowed = await runReadTool(registry, ctx, "write_thing", {}, { allowWrite: ["write_thing"] });
    expect(allowed).toEqual({ ok: true, data: { wrote: true } });

    // Allowlisting one write never opens another.
    const other = await runReadTool(registry, ctx, "write_thing", {}, { allowWrite: ["different_tool"] });
    expect(other.ok).toBe(false);
  });
});

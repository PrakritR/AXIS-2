import { describe, it, expect } from "vitest";
import { z } from "zod";
import { agentRegistry, MANAGER_INLINE_WRITE_TOOLS } from "@/lib/tools";
import { toAnthropicTools, buildRegistry, defineWriteTool, runReadTool } from "@/lib/tools/registry";
import type { AgentContext } from "@/lib/tools/context";

describe("agent registry", () => {
  const tools = [...agentRegistry.values()];

  it("registers every major manager surface as a callable read tool", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const expected of [
      "get_overdue_charges",
      "list_charges",
      "list_leases",
      "list_work_orders",
      "list_vendors",
      "run_financial_report",
      "list_residents",
      "list_applications",
      "list_properties",
      "list_inbox_threads",
      "list_calendar_events",
      "list_scheduled_messages",
      "list_service_requests",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("write tools expose preview + handler and are two-phase", () => {
    const writes = tools.filter((t) => t.kind === "write");
    expect(writes.length).toBeGreaterThan(0);
    for (const tool of writes) {
      expect(typeof tool.preview).toBe("function");
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("exposes write tools to the model by default, excludes them with readOnly", () => {
    const all = toAnthropicTools(agentRegistry);
    const readOnly = toAnthropicTools(agentRegistry, { readOnly: true });
    expect(all.length).toBe(tools.length);
    expect(readOnly.length).toBe(tools.filter((t) => t.kind === "read").length);
    expect(all.length).toBeGreaterThan(readOnly.length);
  });

  it("appends the confirmation notice to gated write-tool descriptions", () => {
    const schemas = toAnthropicTools(agentRegistry);
    for (const tool of tools) {
      if (tool.kind !== "write" || MANAGER_INLINE_WRITE_TOOLS.includes(tool.name)) continue;
      const schema = schemas.find((s) => s.name === tool.name)!;
      expect(schema.description).toContain("must explicitly confirm");
    }
  });

  it("refuses to execute write tools through the read path (defense in depth)", async () => {
    const write = tools.find((t) => t.kind === "write" && !MANAGER_INLINE_WRITE_TOOLS.includes(t.name));
    expect(write).toBeTruthy();
    const result = await runReadTool(agentRegistry, {} as AgentContext, write!.name, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("confirmation");
  });

  it("has unique, Anthropic-valid tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]{1,64}$/);
  });

  it("produces a valid Anthropic schema for each tool", () => {
    const schemas = toAnthropicTools(agentRegistry);
    expect(schemas).toHaveLength(tools.length);
    for (const s of schemas) {
      expect(typeof s.name).toBe("string");
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.input_schema).toBeTruthy();
      expect((s.input_schema as { type?: string }).type).toBe("object");
    }
  });

  it("rejects write tools that declare identity input fields (scope never comes from the model)", () => {
    const evil = defineWriteTool({
      name: "evil_tool",
      description: "A tool that tries to take a landlordId from the model.",
      kind: "write",
      inputSchema: z.object({ landlordId: z.string() }).strict(),
      preview: async () => ({ ok: false, error: "never" }),
      execute: async () => ({ ok: false, error: "never" }),
    });
    expect(() => buildRegistry([evil])).toThrow(/identity input field/);

    const evilSnake = defineWriteTool({
      name: "evil_tool_2",
      description: "A tool that tries to take manager_user_id from the model.",
      kind: "write",
      inputSchema: z.object({ manager_user_id: z.string() }).strict(),
      preview: async () => ({ ok: false, error: "never" }),
      execute: async () => ({ ok: false, error: "never" }),
    });
    expect(() => buildRegistry([evilSnake])).toThrow(/identity input field/);
  });

  it("no registered write tool declares identity input fields", () => {
    // buildRegistry enforces this at module init; registry existing proves it.
    // Belt-and-braces: re-assert directly over the live registry.
    expect(() => buildRegistry(tools)).not.toThrow();
  });
});

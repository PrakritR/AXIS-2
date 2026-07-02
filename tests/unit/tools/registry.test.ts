import { describe, it, expect } from "vitest";
import { agentRegistry } from "@/lib/tools";
import { toAnthropicTools } from "@/lib/tools/registry";

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

  it("registers the gated write tools", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const expected of [
      "send_rent_reminders",
      "send_resident_message",
      "create_charge",
      "create_lease_draft",
      "update_lease_draft",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("gives every write tool a preview so nothing executes unseen", () => {
    for (const tool of tools) {
      if (tool.kind === "write") expect(typeof tool.preview).toBe("function");
    }
  });

  it("excludes write tools when the readOnly filter is requested", () => {
    const readOnly = toAnthropicTools(agentRegistry, { readOnly: true });
    const writes = tools.filter((t) => t.kind === "write");
    expect(writes.length).toBeGreaterThan(0);
    expect(readOnly).toHaveLength(tools.length - writes.length);
    const readOnlyNames = new Set(readOnly.map((s) => s.name));
    for (const w of writes) expect(readOnlyNames.has(w.name)).toBe(false);
  });

  it("has unique, Anthropic-valid tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]{1,64}$/);
  });

  it("produces a valid Anthropic schema for each tool (reads and writes)", () => {
    const schemas = toAnthropicTools(agentRegistry);
    expect(schemas).toHaveLength(tools.length);
    for (const s of schemas) {
      expect(typeof s.name).toBe("string");
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.input_schema).toBeTruthy();
      expect((s.input_schema as { type?: string }).type).toBe("object");
    }
  });
});

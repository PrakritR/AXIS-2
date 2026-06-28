/**
 * The agent's tool registry: the single contract the agent loop calls through.
 * Add new site capabilities here as typed, permission-scoped ToolDefinitions.
 */
import { buildRegistry } from "./registry";
import { getOverdueChargesTool } from "./domains/payments";
import { listLeasesTool } from "./domains/leases";

export const agentRegistry = buildRegistry([getOverdueChargesTool, listLeasesTool]);

export { resolveAgentContext, type AgentContext } from "./context";

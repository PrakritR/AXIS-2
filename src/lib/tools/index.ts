/**
 * The agent's tool registry: the single contract the agent loop calls through.
 * Add new site capabilities here as typed, permission-scoped ToolDefinitions.
 */
import { buildRegistry } from "./registry";
import { getOverdueChargesTool, listChargesTool, sendRentReminderTool } from "./domains/payments";
import { listLeasesTool } from "./domains/leases";
import { listWorkOrdersTool, suggestVendorsForWorkOrderTool } from "./domains/work-orders";
import { listVendorsTool } from "./domains/vendors";
import { runFinancialReportTool } from "./domains/financials";
import { listResidentsTool } from "./domains/residents";
import { listApplicationsTool } from "./domains/applications";
import { listPropertiesTool } from "./domains/properties";
import { listInboxThreadsTool } from "./domains/inbox";
import { listCalendarEventsTool, listScheduledMessagesTool } from "./domains/calendar";
import { listServiceRequestsTool } from "./domains/services";

export const agentRegistry = buildRegistry([
  getOverdueChargesTool,
  listChargesTool,
  listLeasesTool,
  listWorkOrdersTool,
  suggestVendorsForWorkOrderTool,
  listVendorsTool,
  runFinancialReportTool,
  listResidentsTool,
  listApplicationsTool,
  listPropertiesTool,
  listInboxThreadsTool,
  listCalendarEventsTool,
  listScheduledMessagesTool,
  listServiceRequestsTool,
  // Write tools (confirm-gated; the loop halts on these and the user approves)
  sendRentReminderTool,
]);

export { resolveAgentContext, type AgentContext } from "./context";

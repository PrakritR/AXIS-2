/**
 * The agent's tool registry: the single contract the agent loop calls through.
 * Add new site capabilities here as typed, permission-scoped ToolDefinitions.
 */
import { buildRegistry } from "./registry";
import { getOverdueChargesTool, listChargesTool } from "./domains/payments";
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
import {
  listVendorInvoicesTool,
  listVendorPayoutsTool,
  submitVendorInvoiceTool,
} from "./domains/vendor-financials";
import { managerFinancialsWriteTools } from "./domains/financials-write";

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
]);

/**
 * Vendor-scoped registry, kept separate from the manager `agentRegistry` so the
 * manager agent never inherits vendor-scoped tools (and vice-versa). It is
 * consumed by the vendor agent surface; every tool here scopes to
 * `vendor_user_id = ctx.userId`. No W-9 / TIN-bearing tool appears in either map.
 */
export const vendorAgentRegistry = buildRegistry([
  listVendorInvoicesTool,
  submitVendorInvoiceTool,
  listVendorPayoutsTool,
]);

/**
 * Gated manager-financials WRITE tools (plan §7). Kept OUT of `agentRegistry` so
 * the model loop (read-only) never receives them — they run only behind the
 * explicit preview/confirm step, per the AGENTS.md write-gating contract. This
 * registry exists so the write layer has a single typed source of truth.
 */
export const managerWriteRegistry = buildRegistry([...managerFinancialsWriteTools]);

export { resolveAgentContext, type AgentContext } from "./context";

/**
 * The agent's tool registry: the single contract the agent loop calls through.
 * Add new site capabilities here as typed, permission-scoped ToolDefinitions.
 */
import { buildRegistry } from "./registry";
import {
  getOverdueChargesTool,
  listChargesTool,
  sendRentRemindersTool,
  createChargeTool,
} from "./domains/payments";
import { createLeaseDraftTool, listLeasesTool, updateLeaseDraftTool } from "./domains/leases";
import { sendResidentMessageTool } from "./domains/messaging";
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
import {
  escalateToManagerTool,
  getJobAccessInfoTool,
  getJobDetailsTool,
  listMyJobsWithThisManagerTool,
} from "./domains/vendor-work-order";
import {
  buildProspectLinksTool,
  escalateLeasingToManagerTool,
  getListingDetailsTool,
  getSiteLinksTool,
  listLiveListingsTool,
} from "./domains/leasing-sms";
import { managerFinancialsWriteTools } from "./domains/financials-write";
import { listDocumentsTool, listPromotionsTool } from "./domains/documents";
import { managerServicesWriteTools } from "./domains/services-write";
import { confirmTourInquiryTool } from "./domains/tours-write";
import { residentPortalTools } from "./domains/resident-portal";
import { vendorPortalTools } from "./domains/vendor-portal";

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
  listDocumentsTool,
  listPromotionsTool,
  // Write tools: previewed from the model loop, executed only via the gated
  // confirm endpoint after explicit user confirmation.
  sendRentRemindersTool,
  sendResidentMessageTool,
  createChargeTool,
  createLeaseDraftTool,
  updateLeaseDraftTool,
  // Confirm a proposed tour into a booked event + notify the guest. Backs the
  // approval-first auto-tour flow, executed only through the confirm gate.
  confirmTourInquiryTool,
  ...managerServicesWriteTools,
  // The accounting writes (bills, budgets, deposit dispositions, owner
  // distributions, bank reconciliation). They were previously registry-only and
  // unreachable from chat; each now carries a preview, which is what makes it
  // safe to expose — the model can propose, only the landlord can execute.
  ...managerFinancialsWriteTools,
]);

/**
 * Vendor-scoped registry, kept separate from the manager `agentRegistry` so the
 * manager agent never inherits vendor-scoped tools (and vice-versa). It is
 * consumed by the vendor agent surface; every tool here scopes to
 * `vendor_user_id = ctx.userId`. No W-9 / TIN-bearing tool appears in either map.
 */
export const vendorAgentRegistry = buildRegistry([
  ...vendorPortalTools,
  listVendorInvoicesTool,
  submitVendorInvoiceTool,
  listVendorPayoutsTool,
]);

/**
 * Resident-portal assistant registry. Kept separate from every other map so the
 * resident agent can never see a manager, vendor, or leasing tool. Each tool
 * pins itself to `ctx.residentScope` (built from the authenticated session), so
 * one resident can never reach another resident's charges, jobs, or documents.
 */
export const residentAgentRegistry = buildRegistry([...residentPortalTools]);

/**
 * The 24/7 vendor work-order agent's registry: three reads pinned to ONE work
 * order via ctx.vendorScope plus escalate_to_manager (the only write, allow-
 * listed for autonomous calls). Deliberately tiny and separate from every other
 * registry — the SMS/inbox agent must never see invoices, financials, or any
 * manager tool.
 */
export const vendorWorkOrderAgentRegistry = buildRegistry([
  getJobDetailsTool,
  getJobAccessInfoTool,
  listMyJobsWithThisManagerTool,
  escalateToManagerTool,
]);

/**
 * Prospect-facing leasing SMS agent on each manager's Twilio work number.
 * Separate registry so it never sees financials, residents, or vendor tools.
 */
export const leasingSmsAgentRegistry = buildRegistry([
  listLiveListingsTool,
  getListingDetailsTool,
  buildProspectLinksTool,
  getSiteLinksTool,
  escalateLeasingToManagerTool,
]);

/**
 * The manager-financials WRITE tools on their own, for tests and for any caller
 * that needs just the accounting writes. These are ALSO part of `agentRegistry`
 * now: every one carries a preview, so the model can propose them and only the
 * landlord's explicit confirmation executes them — the same gate every other
 * write tool goes through.
 */
export const managerWriteRegistry = buildRegistry([...managerFinancialsWriteTools]);

export {
  resolveAgentContext,
  resolveResidentAgentContext,
  resolveVendorAgentContext,
  type AgentContext,
} from "./context";

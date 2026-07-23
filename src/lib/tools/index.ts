/**
 * The agent's tool registries: the single contract every agent loop calls
 * through. Add new site capabilities here as typed, permission-scoped
 * ToolDefinitions. Write tools are confirm-gated by the framework
 * (preview → user confirmation → handler); see docs/ai-assistant.md.
 *
 * One registry + one context resolver per role — see AGENTS.md. They must never
 * be crossed: the manager registry binds to `AgentContext`, the resident and
 * vendor registries to their own scoped context types, so a manager tool cannot
 * even typecheck into a resident registry.
 */
import { buildRegistry } from "./registry";
import { getOverdueChargesTool, listChargesTool, sendRentReminderTool } from "./domains/payments";
import {
  createChargeTool,
  updateChargeTool,
  deleteChargeTool,
  markChargePaidTool,
} from "./domains/charges";
import {
  getAutomationSettingsTool,
  updateAutomationSettingsTool,
  cancelScheduledReminderTool,
  rescheduleReminderTool,
} from "./domains/automation";
import {
  listLeasesTool,
  amendLeaseTool,
  voidLeaseTool,
  sendLeaseForSignatureTool,
  createLeaseDraftTool,
  updateLeaseDraftTool,
} from "./domains/leases";
import {
  listWorkOrdersTool,
  suggestVendorsForWorkOrderTool,
  listWorkOrderBidsTool,
  createWorkOrderTool,
  assignVendorTool,
  offerToVendorsTool,
  scheduleVendorVisitTool,
  acceptBidTool,
  completeWorkOrderTool,
  approveAndPayWorkOrderTool,
  sendWorkOrderReminderTool,
} from "./domains/work-orders";
import { listVendorsTool, addVendorTool, updateVendorTool, inviteVendorTool } from "./domains/vendors";
import { runFinancialReportTool, recordExpenseTool, recordIncomeTool } from "./domains/financials";
import {
  listResidentsTool,
  setResidentApprovalTool,
  sendResidentWelcomeTool,
  revokeResidentAccessTool,
  recordMoveOutTool,
} from "./domains/residents";
import {
  listApplicationsTool,
  getApplicationDetailsTool,
  updateApplicationBucketTool,
  orderBackgroundCheckTool,
} from "./domains/applications";
import {
  listPropertiesTool,
  getPropertyDetailsTool,
  createPropertyTool,
  updatePropertyTool,
  sharePropertyLinkTool,
} from "./domains/properties";
import { listInboxThreadsTool, getThreadMessagesTool, updateThreadTool } from "./domains/inbox";
import {
  sendMessageTool,
  replyToThreadTool,
  scheduleMessageTool,
  cancelScheduledMessageTool,
} from "./domains/messaging";
import {
  listCalendarEventsTool,
  listScheduledMessagesTool,
  listTourInquiriesTool,
  updateManagerAvailabilityTool,
  createCalendarEventTool,
  cancelCalendarEventTool,
  acceptTourInquiryTool,
} from "./domains/calendar";
import { listServiceRequestsTool } from "./domains/services";
import { findRecordsTool } from "./domains/search";
import { getManagerProfileTool, getDashboardSummaryTool } from "./domains/profile";
import {
  listPromotionsTool,
  createPromotionTool,
  updatePromotionTool,
  deletePromotionTool,
} from "./domains/promotions";
import { listCoManagersTool } from "./domains/team";
import { listDocumentsTool } from "./domains/documents";
import { managerFinancialsWriteTools } from "./domains/financials-write";
import { managerServicesWriteTools } from "./domains/services-write";
import { confirmTourInquiryTool } from "./domains/tours-write";
import {
  escalateToManagerTool,
  getJobAccessInfoTool,
  getJobDetailsTool as getSmsJobDetailsTool,
  listMyJobsWithThisManagerTool,
} from "./domains/vendor-work-order";
import {
  buildProspectLinksTool,
  escalateLeasingToManagerTool,
  getListingDetailsTool,
  getSiteLinksTool,
  listLiveListingsTool,
} from "./domains/leasing-sms";

export const agentRegistry = buildRegistry([
  // Cross-domain entity search — the model's first stop for loose names
  findRecordsTool,
  // Reads
  getOverdueChargesTool,
  listChargesTool,
  listLeasesTool,
  listWorkOrdersTool,
  suggestVendorsForWorkOrderTool,
  listWorkOrderBidsTool,
  listVendorsTool,
  runFinancialReportTool,
  listResidentsTool,
  listApplicationsTool,
  getApplicationDetailsTool,
  listPropertiesTool,
  getPropertyDetailsTool,
  listInboxThreadsTool,
  getThreadMessagesTool,
  listCalendarEventsTool,
  listScheduledMessagesTool,
  listTourInquiriesTool,
  listServiceRequestsTool,
  listDocumentsTool,
  getManagerProfileTool,
  getDashboardSummaryTool,
  getAutomationSettingsTool,
  listPromotionsTool,
  listCoManagersTool,
  // Write tools: previewed from the model loop, executed only via the gated
  // confirm endpoint after explicit user confirmation.
  sendRentReminderTool,
  createChargeTool,
  updateChargeTool,
  deleteChargeTool,
  markChargePaidTool,
  updateAutomationSettingsTool,
  cancelScheduledReminderTool,
  rescheduleReminderTool,
  sendMessageTool,
  replyToThreadTool,
  scheduleMessageTool,
  cancelScheduledMessageTool,
  // Low-risk inbox housekeeping; see MANAGER_INLINE_WRITE_TOOLS below.
  updateThreadTool,
  updateManagerAvailabilityTool,
  createCalendarEventTool,
  cancelCalendarEventTool,
  acceptTourInquiryTool,
  // Confirm a proposed tour into a booked event + notify the guest. Backs the
  // approval-first auto-tour flow, executed only through the confirm gate.
  confirmTourInquiryTool,
  createWorkOrderTool,
  assignVendorTool,
  offerToVendorsTool,
  scheduleVendorVisitTool,
  acceptBidTool,
  completeWorkOrderTool,
  approveAndPayWorkOrderTool,
  sendWorkOrderReminderTool,
  addVendorTool,
  updateVendorTool,
  inviteVendorTool,
  createPropertyTool,
  updatePropertyTool,
  sharePropertyLinkTool,
  setResidentApprovalTool,
  sendResidentWelcomeTool,
  revokeResidentAccessTool,
  recordMoveOutTool,
  updateApplicationBucketTool,
  orderBackgroundCheckTool,
  createLeaseDraftTool,
  updateLeaseDraftTool,
  amendLeaseTool,
  voidLeaseTool,
  sendLeaseForSignatureTool,
  recordExpenseTool,
  recordIncomeTool,
  createPromotionTool,
  updatePromotionTool,
  deletePromotionTool,
  ...managerServicesWriteTools,
  // The accounting writes (bills, budgets, deposit dispositions, owner
  // distributions, bank reconciliation). Each carries a preview, which is what
  // makes it safe to expose — the model can propose, only the landlord can
  // execute.
  ...managerFinancialsWriteTools,
]);

/**
 * Write tools the MANAGER chat surfaces let the model run inline, without a
 * confirmation card. Deliberately tiny and explicit: `update_thread` is inbox
 * housekeeping (mark read/unread, trash, restore) that a manager would find
 * absurd to confirm one card at a time, and it audit-logs itself. Adding a
 * tool here removes its confirmation gate — nothing that moves money, sends
 * mail, or changes a lease may ever be listed.
 */
export const MANAGER_INLINE_WRITE_TOOLS: readonly string[] = [updateThreadTool.name];

/**
 * The 24/7 vendor work-order agent's registry: three reads pinned to ONE work
 * order via ctx.vendorScope plus escalate_to_manager (the only write, allow-
 * listed for autonomous calls). Deliberately tiny and separate from every other
 * registry — the SMS/inbox agent must never see invoices, financials, or any
 * manager tool.
 */
export const vendorWorkOrderAgentRegistry = buildRegistry([
  getSmsJobDetailsTool,
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
 * that needs just the accounting writes. These are ALSO part of `agentRegistry`:
 * every one carries a preview, so the model can propose them and only the
 * landlord's explicit confirmation executes them — the same gate every other
 * write tool goes through.
 */
export const managerWriteRegistry = buildRegistry([...managerFinancialsWriteTools]);

export { resolveAgentContext, type AgentContext } from "./context";
export { resolveResidentAgentContext, type ResidentAgentContext } from "./resident-context";
export { resolveVendorAgentContext, type VendorAgentContext } from "./vendor-context";

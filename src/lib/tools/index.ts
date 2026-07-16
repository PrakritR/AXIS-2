/**
 * The manager agent's tool registry: the single contract the agent loop calls
 * through. Add new site capabilities here as typed, permission-scoped
 * ToolDefinitions. Write tools are confirm-gated by the framework (preview →
 * user confirmation → execute); see docs/ai-assistant.md.
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
import { listLeasesTool, amendLeaseTool, voidLeaseTool, sendLeaseForSignatureTool } from "./domains/leases";
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
import { sendMessageTool, scheduleMessageTool, cancelScheduledMessageTool } from "./domains/messaging";
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
  getManagerProfileTool,
  getDashboardSummaryTool,
  getAutomationSettingsTool,
  listPromotionsTool,
  listCoManagersTool,
  // Write tools (confirm-gated; the loop halts on these and the user approves)
  sendRentReminderTool,
  createChargeTool,
  updateChargeTool,
  deleteChargeTool,
  markChargePaidTool,
  updateAutomationSettingsTool,
  cancelScheduledReminderTool,
  rescheduleReminderTool,
  sendMessageTool,
  scheduleMessageTool,
  cancelScheduledMessageTool,
  updateThreadTool, // confirm:"none" — low-risk inbox housekeeping
  updateManagerAvailabilityTool,
  createCalendarEventTool,
  cancelCalendarEventTool,
  acceptTourInquiryTool,
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
  amendLeaseTool,
  voidLeaseTool,
  sendLeaseForSignatureTool,
  recordExpenseTool,
  recordIncomeTool,
  createPromotionTool,
  updatePromotionTool,
  deletePromotionTool,
]);

export { resolveAgentContext, type AgentContext } from "./context";

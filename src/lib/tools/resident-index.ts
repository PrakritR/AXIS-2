/**
 * The resident portal's tool registry. Tools bind to ResidentAgentContext and
 * scope every query by the resident's own identity. The registry is filtered
 * per-request by phase/tier so the assistant's capabilities always equal the
 * resident portal's.
 */
import { buildRegistry, type ToolDefinition, type ToolRegistry } from "./registry";
import type { ResidentAgentContext } from "./resident-context";
import { residentSectionAllowedForManagerTier } from "@/lib/manager-access";
import { getMyBalanceTool, listMyChargesTool, getMyPaymentMethodsTool } from "./domains/resident/balance";
import {
  getMyLeaseTool,
  getMyApplicationStatusTool,
  getMoveInInfoTool,
  requestLeaseExtensionTool,
} from "./domains/resident/lease";
import {
  listMyInboxThreadsTool,
  getMyScheduledMessagesTool,
  sendMessageToManagerTool,
  scheduleMessageTool,
  cancelScheduledMessageTool,
} from "./domains/resident/messaging";
import { reportManualPaymentTool, startRentPaymentTool } from "./domains/resident/payments";
import {
  listMyServiceRequestsTool,
  listMyWorkOrdersTool,
  createServiceRequestTool,
  addServiceRequestNoteTool,
} from "./domains/resident/services";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResidentTool = ToolDefinition<any, any, ResidentAgentContext>;

const ALL_RESIDENT_TOOLS: ResidentTool[] = [
  // Balance / charges / payment methods
  getMyBalanceTool,
  listMyChargesTool,
  getMyPaymentMethodsTool,
  // Lease / application / move-in
  getMyLeaseTool,
  getMyApplicationStatusTool,
  getMoveInInfoTool,
  requestLeaseExtensionTool,
  // Services / work orders
  listMyServiceRequestsTool,
  listMyWorkOrdersTool,
  createServiceRequestTool,
  addServiceRequestNoteTool,
  // Inbox / messaging
  listMyInboxThreadsTool,
  getMyScheduledMessagesTool,
  sendMessageToManagerTool,
  scheduleMessageTool,
  cancelScheduledMessageTool,
  // Payments
  reportManualPaymentTool,
  startRentPaymentTool,
];

/**
 * Which portal section a tool belongs to, for tier gating (a free-tier manager
 * hides services + inbox, mirroring residentSectionAllowedForManagerTier).
 * Tools without an entry are available on every tier.
 */
const TOOL_SECTION: Record<string, string> = {
  [listMyServiceRequestsTool.name]: "services",
  [listMyWorkOrdersTool.name]: "services",
  [createServiceRequestTool.name]: "services",
  [addServiceRequestNoteTool.name]: "services",
  [listMyInboxThreadsTool.name]: "inbox",
  [getMyScheduledMessagesTool.name]: "inbox",
  [sendMessageToManagerTool.name]: "inbox",
  [scheduleMessageTool.name]: "inbox",
  [cancelScheduledMessageTool.name]: "inbox",
};

/** Tools available while the resident is still in the application phase. */
const APPLICATION_PHASE_TOOLS = new Set(["get_my_application_status", "send_message_to_manager"]);

/** Full registry (every resident tool) — used by the gated confirm endpoint. */
export const residentAgentRegistry: ToolRegistry<ResidentAgentContext> = buildRegistry(ALL_RESIDENT_TOOLS);

/**
 * The per-request registry: application-phase residents get application status
 * + messaging only; a free-tier manager hides services/inbox tools.
 */
export function buildResidentRegistry(ctx: ResidentAgentContext): ToolRegistry<ResidentAgentContext> {
  const tools = ALL_RESIDENT_TOOLS.filter((tool) => {
    if (ctx.phase === "application" && !APPLICATION_PHASE_TOOLS.has(tool.name)) return false;
    const section = TOOL_SECTION[tool.name];
    if (section && !residentSectionAllowedForManagerTier(section, ctx.managerTier)) return false;
    return true;
  });
  return buildRegistry(tools);
}

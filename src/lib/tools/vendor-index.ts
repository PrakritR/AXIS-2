/**
 * The vendor portal's tool registry. Tools bind to VendorAgentContext and
 * scope every query by `vendor_user_id = ctx.userId` (or the owning-manager
 * check for directory rows).
 */
import { buildRegistry, type ToolDefinition, type ToolRegistry } from "./registry";
import type { VendorAgentContext } from "./vendor-context";
import { getMyAvailabilityTool, updateMyAvailabilityTool } from "./domains/vendor/availability";
import { markJobDoneTool, setMyPriceTool, submitBidTool } from "./domains/vendor/job-actions";
import { getJobDetailsTool, listMyBidsTool, listMyJobsTool, listMyOffersTool } from "./domains/vendor/jobs";
import { listMyInboxThreadsTool, sendMessageToManagerTool } from "./domains/vendor/messaging";
import { getMyProfileTool, listMyPayoutsTool } from "./domains/vendor/profile";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VendorTool = ToolDefinition<any, any, VendorAgentContext>;

const ALL_VENDOR_TOOLS: VendorTool[] = [
  // Jobs / bids / offers
  listMyJobsTool,
  getJobDetailsTool,
  listMyBidsTool,
  listMyOffersTool,
  submitBidTool,
  setMyPriceTool,
  markJobDoneTool,
  // Payouts / profile
  listMyPayoutsTool,
  getMyProfileTool,
  // Availability
  getMyAvailabilityTool,
  updateMyAvailabilityTool,
  // Inbox / messaging
  listMyInboxThreadsTool,
  sendMessageToManagerTool,
];

export const vendorAgentRegistry: ToolRegistry<VendorAgentContext> = buildRegistry(ALL_VENDOR_TOOLS);

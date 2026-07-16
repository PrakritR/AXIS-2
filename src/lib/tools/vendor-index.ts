/**
 * The vendor portal's tool registry. Tools bind to VendorAgentContext and
 * scope every query by `vendor_user_id = ctx.userId` (or the owning-manager
 * check for directory rows).
 */
import { buildRegistry, type ToolDefinition, type ToolRegistry } from "./registry";
import type { VendorAgentContext } from "./vendor-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VendorTool = ToolDefinition<any, any, VendorAgentContext>;

const ALL_VENDOR_TOOLS: VendorTool[] = [];

export const vendorAgentRegistry: ToolRegistry<VendorAgentContext> = buildRegistry(ALL_VENDOR_TOOLS);

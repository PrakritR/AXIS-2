import { vendorAgentRegistry } from "@/lib/tools";
import { resolveVendorAgentContext } from "@/lib/tools/context";
import { handlePortalAgentChat } from "@/lib/agent/portal-chat.server";
import { VENDOR_PORTAL_SYSTEM_PROMPT } from "@/lib/agent/vendor-portal-system-prompt";

export const runtime = "nodejs";

/**
 * The vendor portal's "Ask PropLane" endpoint. `vendorAgentRegistry` existed
 * with no consumer until this route: the vendor portal mounted the assistant
 * against the manager endpoint, which rejects vendors, so every vendor question
 * returned 401.
 */
export async function POST(req: Request) {
  return handlePortalAgentChat({
    req,
    resolveContext: resolveVendorAgentContext,
    registry: vendorAgentRegistry,
    system: VENDOR_PORTAL_SYSTEM_PROMPT,
    surface: "vendor",
  });
}

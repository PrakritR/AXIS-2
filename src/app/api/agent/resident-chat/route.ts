import { residentAgentRegistry } from "@/lib/tools";
import { resolveResidentAgentContext } from "@/lib/tools/context";
import { handlePortalAgentChat } from "@/lib/agent/portal-chat.server";
import { RESIDENT_SYSTEM_PROMPT } from "@/lib/agent/resident-system-prompt";

export const runtime = "nodejs";

/**
 * The resident portal's "Ask PropLane" endpoint. Separate from
 * `/api/agent/chat` because the manager context resolver deliberately rejects
 * residents: mounting the assistant in /resident against the manager endpoint
 * is what made it answer 401 for every resident before this route existed.
 */
export async function POST(req: Request) {
  return handlePortalAgentChat({
    req,
    resolveContext: resolveResidentAgentContext,
    registry: residentAgentRegistry,
    system: RESIDENT_SYSTEM_PROMPT,
    surface: "resident",
  });
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  loadAgentCustomInstructions,
  parseAgentCustomInstructions,
  saveAgentCustomInstructions,
} from "@/lib/agent/user-preferences";

export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: PRIVATE_HEADERS });
  const customInstructions = await loadAgentCustomInstructions(createSupabaseServiceRoleClient(), userId);
  return NextResponse.json({ customInstructions: customInstructions ?? "" }, { headers: PRIVATE_HEADERS });
}

export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: PRIVATE_HEADERS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const parsed = parseAgentCustomInstructions(body.customInstructions);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: PRIVATE_HEADERS });

  const saved = await saveAgentCustomInstructions(createSupabaseServiceRoleClient(), userId, parsed.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500, headers: PRIVATE_HEADERS });
  return NextResponse.json({ customInstructions: parsed.value ?? "" }, { headers: PRIVATE_HEADERS });
}

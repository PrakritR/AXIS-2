import { NextResponse } from "next/server";
import { normalizeCoManagerPermissions } from "@/lib/co-manager-permissions";
import { transferPropertyOwnership } from "@/lib/property-ownership-transfer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = await ctx.params;
    const id = propertyId?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "propertyId is required." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      newManagerUserId?: string;
      formerOwnerPermissions?: unknown;
    } | null;

    const newManagerUserId = body?.newManagerUserId?.trim() ?? "";
    if (!newManagerUserId) {
      return NextResponse.json({ error: "newManagerUserId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const svc = createSupabaseServiceRoleClient();
    const result = await transferPropertyOwnership(svc, {
      propertyId: id,
      currentOwnerUserId: user.id,
      newManagerUserId,
      formerOwnerPermissions: normalizeCoManagerPermissions(body?.formerOwnerPermissions),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, propertyLabel: result.propertyLabel });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

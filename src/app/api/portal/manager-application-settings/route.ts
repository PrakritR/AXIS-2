import { NextResponse } from "next/server";

import {
  listApplicationFeeWaiverCodes,
  pickPrimaryApplicationFeeWaiverCode,
  setPrimaryApplicationFeeWaiverCode,
} from "@/lib/application-fee-waiver";
import {
  loadManagerApplicationSettings,
  saveManagerApplicationSettings,
  validateManagerApplicationFeeCents,
} from "@/lib/manager-application-settings";
import { suggestedManagerApplicationFeeCents } from "@/lib/manager-application-settings.server";
import { requireManagerRouteUser } from "@/lib/manager-route-guard.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireManagerRouteUser();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const settings = await loadManagerApplicationSettings(ctx.db, ctx.userId);
    // Non-persisted suggestion the modal pre-fills so the manager confirms an
    // explicit value the first time (never a silent bulk change to what their
    // existing listings charge).
    const suggestedFeeCents = await suggestedManagerApplicationFeeCents(ctx.db, ctx.userId);
    const codes = await listApplicationFeeWaiverCodes(ctx.db, ctx.userId);
    const primary = pickPrimaryApplicationFeeWaiverCode(codes);
    return NextResponse.json({
      settings,
      suggestedFeeCents,
      waiverCode: primary?.code ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireManagerRouteUser();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Only `applicationFeeCents` is writable for the fee. A `null` clears it
    // back to the legacy/listing fallback; a number sets the whole-account fee.
    // Invalid input is rejected rather than coerced.
    const validated = validateManagerApplicationFeeCents(
      "applicationFeeCents" in body ? body.applicationFeeCents : null,
    );
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const saved = await saveManagerApplicationSettings(ctx.db, ctx.userId, {
      applicationFeeCents: validated.applicationFeeCents,
    });

    if (!("waiverCode" in body)) {
      return NextResponse.json({ settings: saved });
    }

    const raw = body.waiverCode == null ? "" : String(body.waiverCode);
    const result = await setPrimaryApplicationFeeWaiverCode(ctx.db, ctx.userId, raw);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ settings: saved, waiverCode: result.code?.code ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

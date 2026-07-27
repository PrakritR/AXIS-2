import { NextResponse } from "next/server";

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
    return NextResponse.json({ settings, suggestedFeeCents });
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
    // Only `applicationFeeCents` is writable. A `null` clears it back to the
    // legacy/listing fallback; a number sets the whole-account fee. Invalid
    // input (negative, non-zero under $1, over-cap, non-numeric) is rejected
    // rather than coerced.
    const validated = validateManagerApplicationFeeCents(
      "applicationFeeCents" in body ? body.applicationFeeCents : null,
    );
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const saved = await saveManagerApplicationSettings(ctx.db, ctx.userId, {
      applicationFeeCents: validated.applicationFeeCents,
    });
    return NextResponse.json({ settings: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

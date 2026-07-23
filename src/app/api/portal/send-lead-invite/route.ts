import { NextResponse } from "next/server";
import { leadInviteAppOrigin, sendLeadInvite } from "@/lib/lead-invite.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Domain is matched as dot-separated labels (no char class overlaps the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking on
// attacker-controlled input.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function appOrigin(req: Request): string {
  try {
    return leadInviteAppOrigin(new URL(req.url).origin);
  } catch {
    return leadInviteAppOrigin();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let body: {
      kind?: unknown;
      to?: unknown;
      prospectName?: unknown;
      propertyId?: unknown;
      listingRoomId?: unknown;
      roomName?: unknown;
      note?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const kind =
      body.kind === "tour" ? "tour" : body.kind === "listing" ? "listing" : body.kind === "apply" ? "apply" : null;
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const prospectName = typeof body.prospectName === "string" ? body.prospectName.trim() : "";
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const listingRoomId = typeof body.listingRoomId === "string" ? body.listingRoomId.trim() : "";
    const roomName = typeof body.roomName === "string" ? body.roomName.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!kind) return NextResponse.json({ error: "kind must be apply, tour, or listing." }, { status: 400 });
    if (!to || !EMAIL_RE.test(to)) return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
    if (!propertyId) return NextResponse.json({ error: "propertyId is required." }, { status: 400 });

    const svc = createSupabaseServiceRoleClient();
    const result = await sendLeadInvite(svc, { userId: user.id }, {
      kind,
      to,
      prospectName: prospectName || undefined,
      propertyId,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
      note: note || undefined,
      origin: appOrigin(req),
    });

    if (result.ok) {
      return NextResponse.json({ ok: true, id: result.emailId, linkUrl: result.linkUrl });
    }
    if (result.status === 403) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: result.error, mailtoHref: result.mailtoHref }, { status: result.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send invite." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import {
  buildLeadInviteEmailBody,
  buildLeadInviteEmailHtml,
  buildLeadInviteMailtoHref,
  leadInviteSubject,
} from "@/lib/lead-invite-email";
import {
  buildManagerApplyUrl,
  buildManagerListingUrl,
  buildManagerTourUrl,
} from "@/lib/manager-property-links";
import { buildListingShareSummary } from "@/lib/listing-share-summary";
import { getShareablePropertyForUser } from "@/lib/manager-property-share-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { resolveEmailLinkBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

// Domain is matched as dot-separated labels (no char class overlaps the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking on
// attacker-controlled input.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function canSendLeadInvite(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

// Emails link to the canonical domain only — never a *.vercel.app deploy URL.
function appOrigin(): string {
  return resolveEmailLinkBaseUrl();
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
    const { data: requestor, error: requestorError } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (requestorError || !requestor) {
      return NextResponse.json({ error: requestorError?.message ?? "Profile not found." }, { status: 403 });
    }
    if (!canSendLeadInvite(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    // Server-side authorization: the manager may only share a property they own
    // (or are assigned as co-manager), verified against the Supabase source of
    // truth — never trust the client-supplied propertyId. Also yields the live
    // listing used to build the invite below.
    const listing = await getShareablePropertyForUser(user.id, propertyId);
    if (!listing) {
      return NextResponse.json({ error: "You cannot share links for this property." }, { status: 403 });
    }
    const propertyTitle = (listing?.title || listing?.buildingName || listing?.address || propertyId).trim();
    const origin = appOrigin();
    const applyUrl = buildManagerApplyUrl(origin, {
      propertyId,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
    });
    const tourUrl = buildManagerTourUrl(origin, propertyId);
    const listingPageUrl = buildManagerListingUrl(origin, propertyId);
    const linkUrl = kind === "tour" ? tourUrl : applyUrl;
    const listingSummary =
      kind === "listing" && listing
        ? buildListingShareSummary(listing, { roomChoice: roomName || undefined, roomId: listingRoomId || undefined })
        : undefined;

    const subject = leadInviteSubject(kind, propertyTitle);
    const text = buildLeadInviteEmailBody({
      kind,
      prospectName: prospectName || undefined,
      propertyTitle,
      linkUrl,
      listingPageUrl: kind === "listing" ? listingPageUrl : undefined,
      tourUrl: kind === "listing" ? tourUrl : undefined,
      listingSummary,
      managerNote: note || undefined,
    });
    const html = buildLeadInviteEmailHtml({
      kind,
      prospectName: prospectName || undefined,
      propertyTitle,
      linkUrl,
      listingPageUrl: kind === "listing" ? listingPageUrl : undefined,
      tourUrl: kind === "listing" ? tourUrl : undefined,
      listingSummary,
      managerNote: note || undefined,
    });
    const mailtoHref = buildLeadInviteMailtoHref({
      to,
      kind,
      prospectName: prospectName || undefined,
      propertyTitle,
      linkUrl,
      listingPageUrl: kind === "listing" ? listingPageUrl : undefined,
      tourUrl: kind === "listing" ? tourUrl : undefined,
      listingSummary,
      managerNote: note || undefined,
    });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email delivery is not configured (set RESEND_API_KEY).", mailtoHref }, { status: 503 });
    }

    const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? res.statusText, mailtoHref }, { status: 502 });
    }
    track("lead_invite_sent", user.id, { kind, property_id: propertyId });
    return NextResponse.json({ ok: true, id: payload.id ?? null, linkUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send invite." }, { status: 500 });
  }
}

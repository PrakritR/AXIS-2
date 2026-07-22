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
  buildManagerBrowseUrl,
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

// Each requested id costs one Supabase authorization lookup, so bound the
// fan-out to keep a single request from triggering unbounded parallel queries.
const MAX_PROPERTY_IDS = 100;

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
      propertyIds?: unknown;
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
    const singlePropertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const listingRoomId = typeof body.listingRoomId === "string" ? body.listingRoomId.trim() : "";
    const roomName = typeof body.roomName === "string" ? body.roomName.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!kind) return NextResponse.json({ error: "kind must be apply, tour, or listing." }, { status: 400 });
    if (!to || !EMAIL_RE.test(to)) return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });

    // Multi-select is a "listing" affordance only — apply/tour target a single
    // property/room flow. Normalize both shapes (array or legacy scalar) into a
    // deduped id list; the room selector only applies to a single-property send.
    const rawIds = Array.isArray(body.propertyIds)
      ? body.propertyIds.filter((v): v is string => typeof v === "string")
      : [];
    const requestedIds: string[] = [];
    const seenIds = new Set<string>();
    for (const raw of [...rawIds, singlePropertyId]) {
      const id = raw.trim();
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        requestedIds.push(id);
      }
    }
    if (requestedIds.length === 0) {
      return NextResponse.json({ error: "propertyId is required." }, { status: 400 });
    }
    if (requestedIds.length > MAX_PROPERTY_IDS) {
      return NextResponse.json(
        { error: `You can share at most ${MAX_PROPERTY_IDS} properties in one send.` },
        { status: 400 },
      );
    }
    // Only a listing send fans out to several properties; apply/tour collapse to
    // the first requested id so their single-property semantics are preserved.
    const effectiveIds = kind === "listing" ? requestedIds : requestedIds.slice(0, 1);

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
    // Server-side authorization: the manager may only share properties they own
    // (or are assigned as co-manager), verified against the Supabase source of
    // truth — never trust the client-supplied ids. Also yields the live listings
    // used to build the invite below. Every requested id must be authorized.
    const listings = await Promise.all(
      effectiveIds.map(async (id) => ({ id, listing: await getShareablePropertyForUser(user.id, id) })),
    );
    const authorized = listings.filter((entry): entry is { id: string; listing: NonNullable<typeof entry.listing> } =>
      Boolean(entry.listing),
    );
    if (authorized.length !== effectiveIds.length || authorized.length === 0) {
      return NextResponse.json({ error: "You cannot share links for one or more of these properties." }, { status: 403 });
    }

    const isMultiListing = kind === "listing" && authorized.length > 1;
    const primary = authorized[0];
    const propertyId = primary.id;
    const listing = primary.listing;
    const origin = appOrigin();

    const propertyTitle = isMultiListing
      ? `${authorized.length} homes`
      : (listing?.title || listing?.buildingName || listing?.address || propertyId).trim();
    const applyUrl = buildManagerApplyUrl(origin, {
      propertyId,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
    });
    const tourUrl = buildManagerTourUrl(origin, propertyId);
    const listingPageUrl = buildManagerListingUrl(origin, propertyId);
    const listingCount = isMultiListing ? authorized.length : undefined;
    // Multi-listing sends land the prospect on the browse grid pre-filtered to
    // exactly these homes; a single send keeps the direct listing/apply link.
    const linkUrl = isMultiListing
      ? buildManagerBrowseUrl(origin, authorized.map((entry) => entry.id))
      : kind === "tour"
        ? tourUrl
        : applyUrl;
    const listingSummary =
      kind === "listing" && !isMultiListing && listing
        ? buildListingShareSummary(listing, { roomChoice: roomName || undefined, roomId: listingRoomId || undefined })
        : undefined;

    const subject = leadInviteSubject(kind, propertyTitle, listingCount);
    const emailParams = {
      kind,
      prospectName: prospectName || undefined,
      propertyTitle,
      linkUrl,
      listingPageUrl: kind === "listing" && !isMultiListing ? listingPageUrl : undefined,
      tourUrl: kind === "listing" && !isMultiListing ? tourUrl : undefined,
      listingSummary,
      managerNote: note || undefined,
      listingCount,
    } satisfies Parameters<typeof buildLeadInviteEmailBody>[0];
    const text = buildLeadInviteEmailBody(emailParams);
    const html = buildLeadInviteEmailHtml(emailParams);
    const mailtoHref = buildLeadInviteMailtoHref({ to, ...emailParams });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email delivery is not configured (set RESEND_API_KEY).", mailtoHref }, { status: 503 });
    }

    const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? res.statusText, mailtoHref }, { status: 502 });
    }
    track("lead_invite_sent", user.id, { kind, property_id: propertyId, property_count: authorized.length });
    return NextResponse.json({ ok: true, id: payload.id ?? null, linkUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send invite." }, { status: 500 });
  }
}

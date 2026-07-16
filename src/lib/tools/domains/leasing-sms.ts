/**
 * Leasing SMS agent's capability surface: read live listings for THIS manager,
 * fetch room-level details, and mint apply/tour/listing URLs with prospect
 * prefills. escalate_to_manager is the only write (allowlisted) — it notifies
 * the owning manager; the model never sends SMS itself (delivery is code).
 */
import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import { notifyManagerFromAgent } from "@/lib/agent-notify.server";
import { track } from "@/lib/analytics/posthog";
import {
  buildManagerApplyUrl,
  buildManagerListingUrl,
  buildManagerTourUrl,
} from "@/lib/manager-property-links";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export const LEASING_ESCALATE_TOOL_NAME = "escalate_to_manager";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(obj: Record<string, unknown> | null, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function publicOrigin(): string {
  const explicit =
    process.env.PROPLANE_SMS_LINK_ORIGIN?.trim() ||
    process.env.CLAW_MESSENGER_LINK_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app && !/localhost|127\.0\.0\.1/i.test(app)) return app.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`.replace(/\/$/, "");
  return "https://www.axis-seattle-housing.com";
}

type RawPropertyRecord = {
  id: string;
  status: string | null;
  property_data: unknown;
  row_data: unknown;
};

function propertySource(rec: RawPropertyRecord): Record<string, unknown> | null {
  return asObject(rec.property_data) ?? asObject(rec.row_data);
}

function propertyLabel(src: Record<string, unknown> | null): string | null {
  return str(src, "buildingName") ?? str(src, "title") ?? str(src, "address") ?? str(src, "name");
}

function summarizeRooms(src: Record<string, unknown> | null) {
  const subRaw = asObject(src?.listingSubmission as unknown);
  if (!subRaw) {
    return [] as Array<{
      id: string;
      name: string;
      floor: string | null;
      monthlyRent: number | null;
      availability: string | null;
      moveInAvailableDate: string | null;
    }>;
  }
  try {
    const sub = normalizeManagerListingSubmissionV1(subRaw as never);
    return sub.rooms
      .filter((r) => r.name.trim() || r.monthlyRent > 0)
      .map((r, index) => ({
        id: r.id,
        name: r.name.trim() || `Room ${index + 1}`,
        floor: r.floor?.trim() || null,
        monthlyRent: r.monthlyRent > 0 ? r.monthlyRent : null,
        availability: r.availability?.trim() || null,
        moveInAvailableDate: r.moveInAvailableDate?.trim() || null,
      }));
  } catch {
    return [];
  }
}

function summarizeBundles(src: Record<string, unknown> | null) {
  const subRaw = asObject(src?.listingSubmission as unknown);
  if (!subRaw) return [] as Array<{ id: string; label: string; price: string | null }>;
  try {
    const sub = normalizeManagerListingSubmissionV1(subRaw as never);
    return (sub.bundles ?? [])
      .filter((b) => (b.id ?? "").trim() && (b.label ?? "").trim())
      .map((b) => ({
        id: String(b.id).trim(),
        label: String(b.label).trim(),
        price: b.price?.trim() || null,
      }));
  } catch {
    return [];
  }
}

async function loadLiveListings(ctx: AgentContext): Promise<RawPropertyRecord[]> {
  const { data, error } = await ctx.db
    .from("manager_property_records")
    .select("id, status, property_data, row_data")
    .eq("manager_user_id", ctx.landlordId)
    .in("status", ["live", "listed"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as RawPropertyRecord[];
}

async function loadOwnedListing(
  ctx: AgentContext,
  propertyId: string,
): Promise<RawPropertyRecord | null> {
  const id = propertyId.trim();
  if (!id) return null;
  const { data, error } = await ctx.db
    .from("manager_property_records")
    .select("id, status, property_data, row_data")
    .eq("id", id)
    .eq("manager_user_id", ctx.landlordId)
    .in("status", ["live", "listed"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RawPropertyRecord | null) ?? null;
}

export const listLiveListingsTool = defineTool({
  name: "list_live_listings",
  description:
    "List this manager's live public listings with title, address, neighborhood, rent label, and room names/prices. Use first when matching a prospect's house or room question.",
  kind: "read",
  inputSchema: z
    .object({
      query: z
        .string()
        .optional()
        .describe("Optional free-text filter (address fragment, house name, room name)."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const needle = (input.query ?? "").trim().toLowerCase();
    const rows = await loadLiveListings(ctx);
    const listings = rows
      .map((rec) => {
        const src = propertySource(rec);
        const rooms = summarizeRooms(src);
        const label = propertyLabel(src);
        const address = str(src, "address");
        const hay = [label, address, str(src, "neighborhood"), ...rooms.map((r) => r.name)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (
          needle &&
          !hay.includes(needle) &&
          !needle.split(/\s+/).some((w) => w.length > 2 && hay.includes(w))
        ) {
          return null;
        }
        return {
          propertyId: rec.id,
          status: rec.status,
          title: label,
          address,
          neighborhood: str(src, "neighborhood"),
          rentLabel: str(src, "rentLabel"),
          available: str(src, "available"),
          beds: typeof src?.beds === "number" ? src.beds : null,
          baths: typeof src?.baths === "number" ? src.baths : null,
          rooms: rooms.map((r) => ({
            id: r.id,
            name: r.name,
            monthlyRent: r.monthlyRent,
            availability: r.availability,
          })),
          bundles: summarizeBundles(src),
        };
      })
      .filter(Boolean);
    return { count: listings.length, listings };
  },
});

export const getListingDetailsTool = defineTool({
  name: "get_listing_details",
  description:
    "Full details for one live listing owned by this manager: address, rent, rooms (ids/names/prices/availability), bundles, and amenities. Call before answering specifics about a house or room.",
  kind: "read",
  inputSchema: z
    .object({
      propertyId: z.string().min(1).describe("Listing / property id from list_live_listings."),
      roomQuery: z
        .string()
        .optional()
        .describe("Optional room name fragment to highlight matching rooms."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rec = await loadOwnedListing(ctx, input.propertyId);
    if (!rec) return { found: false };
    const src = propertySource(rec);
    const rooms = summarizeRooms(src);
    const roomNeedle = (input.roomQuery ?? "").trim().toLowerCase();
    const matchedRooms = roomNeedle
      ? rooms.filter(
          (r) =>
            r.name.toLowerCase().includes(roomNeedle) ||
            roomNeedle.includes(r.name.toLowerCase()) ||
            (r.floor ?? "").toLowerCase().includes(roomNeedle),
        )
      : rooms;
    return {
      found: true,
      listing: {
        propertyId: rec.id,
        title: propertyLabel(src),
        address: str(src, "address"),
        neighborhood: str(src, "neighborhood"),
        rentLabel: str(src, "rentLabel"),
        available: str(src, "available"),
        beds: typeof src?.beds === "number" ? src.beds : null,
        baths: typeof src?.baths === "number" ? src.baths : null,
        tagline: str(src, "tagline"),
        description: str(src, "description")?.slice(0, 800) ?? null,
        rooms: matchedRooms,
        allRoomCount: rooms.length,
        bundles: summarizeBundles(src),
      },
    };
  },
});

export const buildProspectLinksTool = defineTool({
  name: "build_prospect_links",
  description:
    "Build listing, tour, and apply URLs for a matched property. Apply links prefill the prospect's phone and optional room/bundle so the application form is already filled. Always use this before telling someone to apply or tour.",
  kind: "read",
  inputSchema: z
    .object({
      propertyId: z.string().min(1),
      listingRoomId: z.string().optional(),
      roomName: z.string().optional(),
      bundleId: z.string().optional(),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rec = await loadOwnedListing(ctx, input.propertyId);
    if (!rec) return { ok: false, error: "listing_not_found" };
    const src = propertySource(rec);
    const rooms = summarizeRooms(src);
    let listingRoomId = input.listingRoomId?.trim() || "";
    let roomName = input.roomName?.trim() || "";
    if (!listingRoomId && roomName) {
      const hit = rooms.find(
        (r) =>
          r.name.toLowerCase() === roomName.toLowerCase() ||
          r.name.toLowerCase().includes(roomName.toLowerCase()),
      );
      if (hit) {
        listingRoomId = hit.id;
        roomName = hit.name;
      }
    }
    if (listingRoomId && !roomName) {
      roomName = rooms.find((r) => r.id === listingRoomId)?.name ?? roomName;
    }
    const origin = publicOrigin();
    const prospectPhone = ctx.leasingScope?.prospectPhoneE164 ?? null;
    const applyUrl = buildManagerApplyUrl(origin, {
      propertyId: rec.id,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
      bundleId: input.bundleId?.trim() || undefined,
      phone: prospectPhone || undefined,
    });
    return {
      ok: true,
      propertyId: rec.id,
      title: propertyLabel(src),
      listingUrl: buildManagerListingUrl(origin, rec.id),
      tourUrl: buildManagerTourUrl(origin, rec.id),
      applyUrl,
      prefilled: {
        phone: prospectPhone,
        listingRoomId: listingRoomId || null,
        roomName: roomName || null,
        bundleId: input.bundleId?.trim() || null,
      },
    };
  },
});

export const escalateLeasingToManagerTool = defineTool({
  name: LEASING_ESCALATE_TOOL_NAME,
  description:
    "Notify the property manager when you cannot answer from listing tools or the prospect needs a human decision. Call at most once per issue, then tell the prospect the manager will follow up.",
  kind: "write",
  inputSchema: z
    .object({
      summary: z
        .string()
        .min(1)
        .max(500)
        .describe("One or two factual sentences describing what the prospect needs."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const scope = ctx.leasingScope;
    if (!scope) return { ok: false, error: "No leasing conversation bound." };

    const hourBucket = new Date().toISOString().slice(0, 13);
    const dedupeKey = `leasing_sms_escalate:${scope.sessionId}:${hourBucket}`;
    const { error: auditError } = await ctx.db.from("audit_log").insert({
      actor_user_id: ctx.landlordId,
      landlord_id: ctx.landlordId,
      action: "leasing_sms_escalate",
      tool_name: LEASING_ESCALATE_TOOL_NAME,
      input_summary: {
        prospectPhone: scope.prospectPhoneE164,
        summary: input.summary.slice(0, 200),
      },
      dedupe_key: dedupeKey,
      created_at: new Date().toISOString(),
    });
    if (auditError) {
      if (auditError.code === "23505") {
        return {
          ok: true,
          alreadyEscalated: true,
          message: "The manager was already notified about this a moment ago.",
        };
      }
      return { ok: false, error: "Could not record the escalation." };
    }

    await notifyManagerFromAgent(ctx.db, {
      landlordId: ctx.landlordId,
      subject: "Leasing text needs you",
      text: [
        `A prospect texted your work number (${scope.prospectPhoneE164}):`,
        "",
        input.summary,
        "",
        "Open Communication → SMS to reply from your work number.",
      ].join("\n"),
      threadType: "leasing_sms_escalation",
      url: "/portal/communication/sms",
      notify: { push: true, sms: false },
    });
    await ctx.db
      .from("agent_sessions")
      .update({ status: "escalated", updated_at: new Date().toISOString() })
      .eq("id", scope.sessionId);
    track("leasing_sms_escalated", ctx.landlordId, { channel: "sms" });
    return { ok: true, message: "The manager has been notified and will follow up." };
  },
});

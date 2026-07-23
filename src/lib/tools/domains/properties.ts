import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";
import {
  buildLeadInviteLinkUrl,
  leadInviteAppOrigin,
  leadInviteEmailConfigured,
  sendLeadInvite,
  type LeadInviteKind,
} from "@/lib/lead-invite.server";
import { getShareablePropertyForUser } from "@/lib/manager-property-share-access";
import { acceptedPaymentMethodsForListing } from "@/lib/payment-policy";

/**
 * Property records vary in shape by lifecycle status: `property_data` holds the
 * published listing for live/review rows, `row_data` holds the submission for
 * everything else. We read both and project a small, safe set of display fields
 * defensively, so the tool works regardless of which stage a property is in.
 */
type RawPropertyRecord = {
  id: string;
  status: string | null;
  row_data: unknown;
  property_data: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(obj: Record<string, unknown> | null, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(obj: Record<string, unknown> | null, key: string): number | null {
  const v = obj?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function summarizeProperty(rec: RawPropertyRecord) {
  // Prefer the published listing payload, fall back to the raw submission.
  const src = asObject(rec.property_data) ?? asObject(rec.row_data);
  return {
    id: rec.id,
    status: rec.status || null,
    title: str(src, "title") ?? str(src, "buildingName") ?? str(src, "name"),
    address: str(src, "address"),
    neighborhood: str(src, "neighborhood"),
    unit: str(src, "unitLabel"),
    beds: num(src, "beds"),
    baths: num(src, "baths"),
    rent: str(src, "rentLabel"),
    available: str(src, "available"),
  };
}

export const listPropertiesTool = defineTool({
  name: "list_properties",
  description:
    "List the current landlord's own properties/listings with title, address, unit, beds/baths, rent, and lifecycle status (pending, live, review, request_change, unlisted, rejected). Use to answer 'what properties do I manage', 'which listings are live', etc.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on property status, e.g. 'live' or 'pending'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const { data, error } = await ctx.db
      .from("manager_property_records")
      .select("id, status, row_data, property_data")
      .eq("manager_user_id", ctx.landlordId)
      .limit(1000);
    if (error) throw new Error(error.message);
    const wantStatus = input.status?.trim().toLowerCase();
    const properties = ((data ?? []) as RawPropertyRecord[])
      .filter((r) => !wantStatus || String(r.status ?? "").toLowerCase() === wantStatus)
      .map(summarizeProperty);
    return { count: properties.length, properties };
  },
});

/** Server-side single-record read, always scoped by manager_user_id. */
async function loadOwnedPropertyRecord(ctx: AgentContext, propertyId: string): Promise<RawPropertyRecord | null> {
  const id = propertyId.trim();
  if (!id) return null;
  const { data, error } = await ctx.db
    .from("manager_property_records")
    .select("id, status, row_data, property_data")
    .eq("id", id)
    .eq("manager_user_id", ctx.landlordId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (((data ?? []) as RawPropertyRecord[])[0] as RawPropertyRecord | undefined) ?? null;
}

/** The full listing submission for a record (published payload first, then draft). */
function listingSubmissionOf(rec: RawPropertyRecord): Record<string, unknown> | null {
  return (
    asObject(asObject(rec.property_data)?.listingSubmission) ?? asObject(asObject(rec.row_data)?.submission)
  );
}

/**
 * Safe room projection for the listing detail read. Photo/video data URLs,
 * move-in instructions with access codes, and per-room free text are
 * deliberately dropped.
 */
function summarizeRooms(sub: Record<string, unknown> | null) {
  const rooms = Array.isArray(sub?.rooms) ? (sub!.rooms as unknown[]) : [];
  return rooms
    .map((r) => asObject(r))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => ({
      name: str(r, "name"),
      rent: num(r, "monthlyRent"),
      availability: str(r, "availability"),
      moveInAvailableDate: str(r, "moveInAvailableDate"),
    }));
}

export const getPropertyDetailsTool = defineTool({
  name: "get_property_details",
  description:
    "Get one of the current landlord's properties in detail: title, address, zip, neighborhood, beds/baths, rent, lifecycle status, per-room name/rent/availability/move-in date, and which resident payment methods the listing accepts. Pass a property id from list_properties. Photos and payment contact details (Zelle/Venmo handles) are never returned.",
  kind: "read",
  inputSchema: z
    .object({
      propertyId: z.string().min(1).describe("The property id, from list_properties."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rec = await loadOwnedPropertyRecord(ctx, input.propertyId);
    if (!rec) return { found: false, message: "No property with that id belongs to this landlord." };
    const src = asObject(rec.property_data) ?? asObject(rec.row_data);
    const sub = listingSubmissionOf(rec);
    return {
      found: true,
      property: {
        id: rec.id,
        status: rec.status || null,
        title: str(src, "title") ?? str(src, "buildingName") ?? str(src, "name"),
        address: str(src, "address"),
        zip: str(src, "zip"),
        neighborhood: str(src, "neighborhood"),
        unit: str(src, "unitLabel"),
        beds: num(src, "beds"),
        baths: num(src, "baths"),
        rentLabel: str(src, "rentLabel") ?? (num(src, "monthlyRent") != null ? `$${num(src, "monthlyRent")}/mo` : null),
        petFriendly: src?.petFriendly === true,
        rooms: summarizeRooms(sub),
        acceptedPaymentMethods: sub
          ? acceptedPaymentMethodsForListing(sub as { acceptedPaymentMethods?: ("zelle" | "venmo" | "ach" | "card")[] })
          : null,
      },
    };
  },
});

export type DraftPropertyFields = {
  title: string;
  address: string;
  zip?: string;
  neighborhood?: string;
  beds: number;
  baths: number;
  rentUsd: number;
  description?: string;
  unitLabel?: string;
  petFriendly?: boolean;
};

/**
 * Build the `row_data` payload for a new draft (status "pending") property
 * record, matching the ManagerPendingPropertyRow shape the manager UI submits
 * (see submitManagerPendingProperty in src/lib/demo-property-pipeline.ts).
 * Exported so the create-listing-from-photos flow reuses the exact same draft
 * shape rather than inventing a second one.
 */
export function buildDraftPropertyRowData(fields: DraftPropertyFields, submittedByUserId: string) {
  return {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
    submittedByUserId,
    buildingName: fields.title.trim(),
    address: fields.address.trim(),
    zip: fields.zip?.trim() ?? "",
    neighborhood: fields.neighborhood?.trim() ?? "",
    unitLabel: fields.unitLabel?.trim() || "New listing",
    beds: Math.max(0, Math.round(fields.beds)),
    baths: Math.max(0, fields.baths),
    monthlyRent: Math.max(0, Math.round(fields.rentUsd)),
    petFriendly: fields.petFriendly === true,
    tagline: fields.description?.trim() || "Manager-submitted listing",
  };
}

export const createPropertyTool = defineWriteTool({
  name: "create_property",
  description:
    "Create a new draft property listing for the current landlord from basic facts (title, address, beds/baths, rent). The draft is saved with status 'pending' — an Axis admin must review and approve it before it goes live; it does not publish anything immediately.",
  kind: "write",
  inputSchema: z
    .object({
      title: z.string().min(1).describe("Listing title / building name."),
      address: z.string().min(1).describe("Street address of the property."),
      zip: z.string().optional().describe("ZIP code."),
      neighborhood: z.string().optional().describe("Neighborhood label shown on the listing."),
      beds: z.number().int().min(0).describe("Number of bedrooms."),
      baths: z.number().min(0).describe("Number of bathrooms."),
      rentUsd: z.number().positive().describe("Monthly rent in US dollars."),
      description: z.string().optional().describe("Short listing description / tagline."),
      unitLabel: z.string().optional().describe("Unit label, e.g. 'Unit B' or '3 rooms'."),
      petFriendly: z.boolean().optional().describe("Whether pets are allowed."),
    })
    .strict(),
  preview: async (_ctx, input) => {
    const lines = [
      { label: "Title", value: input.title.trim() },
      { label: "Address", value: input.address.trim() },
      ...(input.zip?.trim() ? [{ label: "ZIP", value: input.zip.trim() }] : []),
      ...(input.neighborhood?.trim() ? [{ label: "Neighborhood", value: input.neighborhood.trim() }] : []),
      { label: "Beds / Baths", value: `${input.beds} bd / ${input.baths} ba` },
      { label: "Monthly rent", value: `$${Math.round(input.rentUsd)}/mo` },
      ...(input.unitLabel?.trim() ? [{ label: "Unit", value: input.unitLabel.trim() }] : []),
      ...(input.petFriendly !== undefined ? [{ label: "Pet friendly", value: input.petFriendly ? "Yes" : "No" }] : []),
      { label: "After creation", value: "Draft (pending) — an Axis admin reviews it before it can go live" },
    ];
    return {
      ok: true,
      input,
      preview: {
        title: "Create draft listing",
        summary: `Create a draft listing "${input.title.trim()}" at ${input.address.trim()} ($${Math.round(input.rentUsd)}/mo). It goes to admin review before publishing.`,
        lines,
        confirmLabel: "Create draft",
      },
    };
  },
  execute: async (ctx, input) => {
    const rowData = buildDraftPropertyRowData(input, ctx.landlordId);
    const normalizedAddress = input.address.trim().toLowerCase().replace(/\s+/g, " ");

    // Record intent first, idempotent per address per day: asking twice in one
    // day must not create two draft records for the same property.
    const dedupeKey = `create_property:${ctx.landlordId}:${normalizedAddress}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "create_property",
      toolName: "create_property",
      inputSummary: { propertyId: rowData.id, beds: rowData.beds, baths: rowData.baths, rentUsd: rowData.monthlyRent },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: "A draft listing for this address was already created today — nothing new was added." };
      }
      return { ok: false, error: "Could not record the action; no listing was created." };
    }

    const { error } = await ctx.db.from("manager_property_records").insert({
      id: rowData.id,
      manager_user_id: ctx.landlordId,
      status: "pending",
      row_data: rowData,
      property_data: null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { error: "insert_failed" }, { clearDedupeKey: true });
      return { ok: false, error: error.message };
    }

    await updateAuditResult(ctx, dedupeKey, { propertyId: rowData.id, status: "pending" });
    return {
      ok: true,
      reply: `Created draft listing "${rowData.buildingName}" at ${rowData.address} ($${rowData.monthlyRent}/mo). It's pending admin review before it can go live.`,
      resultSummary: { propertyId: rowData.id, status: "pending" },
    };
  },
});

type UpdatePropertyInput = {
  propertyId: string;
  rentUsd?: number;
  beds?: number;
  baths?: number;
  description?: string;
  status?: "live" | "unlisted";
};

/**
 * Status transitions the manager may make directly: live ↔ unlisted only.
 * Everything else (pending/review/request_change/rejected → live) goes through
 * Axis admin review. Returns an error string, or null when the change is valid.
 */
function validatePropertyStatusChange(rec: RawPropertyRecord, target: "live" | "unlisted"): string | null {
  const current = String(rec.status ?? "").toLowerCase();
  if (target === current) return `This property is already ${target}.`;
  if (target === "live") {
    if (current !== "unlisted") {
      return "Only an unlisted listing can be set back to live here. New or edited listings must go through Axis admin review before publishing — their status stays pending/review until an admin approves them.";
    }
    if (!asObject(rec.property_data)) {
      return "This unlisted listing has no published payload on record, so it can't be relisted from here — relist it from the Properties page (it may need admin review).";
    }
  }
  if (target === "unlisted" && current !== "live") {
    return "Only a live listing can be unlisted.";
  }
  return null;
}

/** Tiny stable hash of the update patch for the idempotency key. */
function patchHash(input: UpdatePropertyInput): string {
  const stable = JSON.stringify([
    input.rentUsd ?? null,
    input.beds ?? null,
    input.baths ?? null,
    input.description ?? null,
    input.status ?? null,
  ]);
  let h = 5381;
  for (let i = 0; i < stable.length; i++) h = ((h << 5) + h + stable.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function hasFieldPatch(input: UpdatePropertyInput): boolean {
  return (
    input.rentUsd !== undefined ||
    input.beds !== undefined ||
    input.baths !== undefined ||
    input.description !== undefined
  );
}

function formatRentLabel(rentUsd: number): string {
  return `$${Math.round(rentUsd).toLocaleString("en-US")}/mo`;
}

/**
 * Minimal AdminPropertyRow payload synthesized from the live listing so an
 * unlisted record still renders on the manager's Unlisted tab (mirrors
 * mockToAdminRow in src/lib/demo-admin-property-inventory.ts). Keeps the
 * submission so the listing can be relisted with its content intact.
 */
function adminRowFromLiveProperty(recordId: string, prop: Record<string, unknown>, managerUserId: string) {
  const rentLabel = str(prop, "rentLabel") ?? "";
  const rentMatch = rentLabel.match(/[\d,]+(?:\.\d+)?/);
  return {
    adminRefId: recordId,
    buildingName: str(prop, "buildingName") ?? str(prop, "title") ?? "",
    unitLabel: str(prop, "unitLabel") ?? "",
    address: str(prop, "address") ?? "",
    zip: str(prop, "zip") ?? "",
    neighborhood: str(prop, "neighborhood") ?? "",
    beds: num(prop, "beds") ?? 0,
    baths: num(prop, "baths") ?? 0,
    monthlyRent: rentMatch ? Number(rentMatch[0].replace(/,/g, "")) : 0,
    petFriendly: prop.petFriendly === true,
    tagline: str(prop, "tagline") ?? "",
    listingId: str(prop, "id") ?? recordId,
    managerUserId,
    submission: asObject(prop.listingSubmission) ?? undefined,
  };
}

export const updatePropertyTool = defineWriteTool({
  name: "update_property",
  description:
    "Update one of the current landlord's properties: monthly rent, beds, baths, description, or toggle a listing between live and unlisted. Pass a property id from list_properties. Cannot publish a pending/in-review listing — that requires Axis admin review.",
  kind: "write",
  inputSchema: z
    .object({
      propertyId: z.string().min(1).describe("The property id, from list_properties."),
      rentUsd: z.number().positive().optional().describe("New monthly rent in US dollars."),
      beds: z.number().int().min(0).optional().describe("New bedroom count."),
      baths: z.number().min(0).optional().describe("New bathroom count."),
      description: z.string().optional().describe("New listing description / tagline."),
      status: z
        .enum(["live", "unlisted"])
        .optional()
        .describe("Toggle a live listing to unlisted or an unlisted one back to live."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const rec = await loadOwnedPropertyRecord(ctx, input.propertyId);
    if (!rec) {
      return { ok: false, error: "No property with that id belongs to this landlord. Use list_properties to get valid ids." };
    }
    if (!hasFieldPatch(input) && !input.status) {
      return { ok: false, error: "Nothing to update — pass at least one of rentUsd, beds, baths, description, or status." };
    }
    if (input.status) {
      const statusError = validatePropertyStatusChange(rec, input.status);
      if (statusError) return { ok: false, error: statusError };
    }

    const src = asObject(rec.property_data) ?? asObject(rec.row_data);
    const title = str(src, "title") ?? str(src, "buildingName") ?? rec.id;
    const oldRent = str(src, "rentLabel") ?? (num(src, "monthlyRent") != null ? `$${num(src, "monthlyRent")}/mo` : "—");
    const lines: { label: string; value: string }[] = [{ label: "Property", value: title }];
    if (input.rentUsd !== undefined) lines.push({ label: "Monthly rent", value: `${oldRent} → ${formatRentLabel(input.rentUsd)}` });
    if (input.beds !== undefined) lines.push({ label: "Beds", value: `${num(src, "beds") ?? "—"} → ${input.beds}` });
    if (input.baths !== undefined) lines.push({ label: "Baths", value: `${num(src, "baths") ?? "—"} → ${input.baths}` });
    if (input.description !== undefined) {
      lines.push({ label: "Description", value: `${str(src, "tagline") ?? "—"} → ${input.description.trim() || "—"}` });
    }
    if (input.status) lines.push({ label: "Status", value: `${String(rec.status ?? "—")} → ${input.status}` });

    return {
      ok: true,
      input,
      preview: {
        title: "Update property",
        summary: `Update ${title}${input.status ? ` (set ${input.status})` : ""}.`,
        lines,
        confirmLabel: "Apply update",
        ...(input.status === "unlisted"
          ? { warning: "Unlisting removes this property from the public rental site until you relist it." }
          : {}),
      },
    };
  },
  execute: async (ctx, input) => {
    // Re-resolve at execute time: the record and its status may have changed
    // since preview, and ownership is never trusted from stored input.
    const rec = await loadOwnedPropertyRecord(ctx, input.propertyId);
    if (!rec) return { ok: false, error: "No property with that id belongs to this landlord." };
    if (!hasFieldPatch(input) && !input.status) return { ok: false, error: "Nothing to update." };
    if (input.status) {
      const statusError = validatePropertyStatusChange(rec, input.status);
      if (statusError) return { ok: false, error: statusError };
    }

    const changedFields = (["rentUsd", "beds", "baths", "description", "status"] as const).filter(
      (k) => input[k] !== undefined,
    );
    const dedupeKey = `update_property:${ctx.landlordId}:${rec.id}:${patchHash(input)}`;
    const audit = await writeAuditLog(ctx, {
      action: "update_property",
      toolName: "update_property",
      inputSummary: { propertyId: rec.id, fields: changedFields, status: input.status ?? null },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: "That exact update was already applied to this property." };
      return { ok: false, error: "Could not record the action; nothing was updated." };
    }

    // Read-merge-write BOTH payloads: `property_data` drives the published
    // listing, `row_data` drives the draft/unlisted views — patch whichever is
    // present, never construct either from scratch.
    const rowData = asObject(rec.row_data);
    const propertyData = asObject(rec.property_data);
    let nextRow = rowData ? { ...rowData } : null;
    const nextProp = propertyData ? { ...propertyData } : null;

    if (nextRow) {
      if (input.rentUsd !== undefined) {
        nextRow.monthlyRent = Math.max(0, Math.round(input.rentUsd));
        // The formatted range label (derived from room rents) would go stale;
        // dropping it makes the UI fall back to the plain monthlyRent price.
        delete nextRow.rentRangeLabel;
      }
      if (input.beds !== undefined) nextRow.beds = input.beds;
      if (input.baths !== undefined) nextRow.baths = input.baths;
      if (input.description !== undefined) nextRow.tagline = input.description.trim();
    }
    if (nextProp) {
      if (input.rentUsd !== undefined) nextProp.rentLabel = formatRentLabel(input.rentUsd);
      if (input.beds !== undefined) nextProp.beds = input.beds;
      if (input.baths !== undefined) nextProp.baths = input.baths;
      if (input.description !== undefined) nextProp.tagline = input.description.trim();
    }

    let nextStatus = rec.status;
    if (input.status === "unlisted" && nextProp) {
      nextStatus = "unlisted";
      // The Unlisted tab renders row_data in the AdminPropertyRow shape — the
      // same conversion the client-side unlist flow does via mockToAdminRow.
      nextRow = adminRowFromLiveProperty(rec.id, nextProp, ctx.landlordId);
    } else if (input.status === "live" && nextProp) {
      nextStatus = "live";
      nextProp.adminPublishLive = true;
    }

    const { error } = await ctx.db
      .from("manager_property_records")
      .update({
        status: nextStatus,
        row_data: nextRow,
        property_data: nextProp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rec.id)
      .eq("manager_user_id", ctx.landlordId);
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { error: "update_failed" }, { clearDedupeKey: true });
      return { ok: false, error: error.message };
    }

    await updateAuditResult(ctx, dedupeKey, { propertyId: rec.id, fields: changedFields, status: nextStatus });
    const src = nextProp ?? nextRow;
    const title = str(src, "title") ?? str(src, "buildingName") ?? rec.id;
    const parts: string[] = [];
    if (input.rentUsd !== undefined) parts.push(`rent to ${formatRentLabel(input.rentUsd)}`);
    if (input.beds !== undefined) parts.push(`beds to ${input.beds}`);
    if (input.baths !== undefined) parts.push(`baths to ${input.baths}`);
    if (input.description !== undefined) parts.push("the description");
    if (input.status) parts.push(`status to ${input.status}`);
    return {
      ok: true,
      reply: `Updated ${title}: ${parts.join(", ")}.`,
      resultSummary: { propertyId: rec.id, fields: changedFields, status: nextStatus },
    };
  },
});

// Domain is matched as dot-separated labels (no char class overlaps the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking on
// attacker-controlled input.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const SHARE_KIND_LABELS: Record<LeadInviteKind, string> = {
  apply: "Application invite",
  tour: "Tour-scheduling invite",
  listing: "Listing details (with apply + tour links)",
};

export const sharePropertyLinkTool = defineWriteTool({
  name: "share_property_link",
  description:
    "Email a prospect an apply link, tour-scheduling link, or full listing details for one of the landlord's LIVE listings. Pass a property id from list_properties (status 'live') and the prospect's email. Only live listings the landlord owns (or co-manages) can be shared.",
  kind: "write",
  inputSchema: z
    .object({
      kind: z
        .enum(["apply", "tour", "listing"])
        .describe("What to send: an application link, a tour-scheduling link, or the listing details."),
      propertyId: z.string().min(1).describe("The live property id, from list_properties."),
      toEmail: z.string().min(3).describe("The prospect's email address."),
      prospectName: z.string().optional().describe("Optional prospect name used in the email greeting."),
      note: z.string().optional().describe("Optional short note from the manager included in the email."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const toEmail = input.toEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(toEmail)) {
      return { ok: false, error: "A valid recipient email is required." };
    }
    // Server-side share authorization against the live Supabase record — the
    // model-supplied propertyId proves nothing.
    const property = await getShareablePropertyForUser(ctx.landlordId, input.propertyId);
    if (!property) {
      return {
        ok: false,
        error:
          "This property can't be shared by you — only live listings you own (or co-manage) are shareable. Use list_properties with status 'live' to find one.",
      };
    }
    const title = (property.title || property.buildingName || property.address || input.propertyId).trim();
    const linkUrl = buildLeadInviteLinkUrl(leadInviteAppOrigin(), input.kind, input.propertyId);
    const emailConfigured = leadInviteEmailConfigured();
    return {
      ok: true,
      input: { ...input, toEmail },
      preview: {
        title: "Share property link",
        summary: `Email ${toEmail} ${input.kind === "listing" ? "the listing details" : `a ${input.kind} link`} for ${title}.`,
        lines: [
          { label: "Property", value: title },
          { label: "Send to", value: input.prospectName?.trim() ? `${input.prospectName.trim()} <${toEmail}>` : toEmail },
          { label: "Invite", value: SHARE_KIND_LABELS[input.kind] },
          { label: "Link", value: linkUrl },
          {
            label: "Email delivery",
            value: emailConfigured
              ? "Configured — the invite will be emailed"
              : "NOT configured on this deployment — you'll get the link to send yourself",
          },
        ],
        confirmLabel: "Send invite",
      },
    };
  },
  execute: async (ctx, input) => {
    const toEmail = input.toEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(toEmail)) return { ok: false, error: "A valid recipient email is required." };
    // Re-verify sharability at execute time (listing may have been unlisted
    // since preview; ownership is never trusted from stored input).
    const property = await getShareablePropertyForUser(ctx.landlordId, input.propertyId);
    if (!property) return { ok: false, error: "This property is no longer shareable by you." };
    const title = (property.title || property.buildingName || property.address || input.propertyId).trim();

    // Record intent first, idempotent per prospect/property/kind per day.
    const dedupeKey = `share_property_link:${ctx.landlordId}:${input.propertyId}:${toEmail}:${input.kind}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "share_property_link",
      toolName: "share_property_link",
      inputSummary: { propertyId: input.propertyId, kind: input.kind },
      resultSummary: { toEmail },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: `A ${input.kind} invite for ${title} was already sent to ${toEmail} today.` };
      }
      return { ok: false, error: "Could not record the action; no invite was sent." };
    }

    const result = await sendLeadInvite(ctx.db, { userId: ctx.landlordId }, {
      kind: input.kind,
      to: toEmail,
      prospectName: input.prospectName?.trim() || undefined,
      propertyId: input.propertyId,
      note: input.note?.trim() || undefined,
      origin: leadInviteAppOrigin(),
    });

    if (result.ok) {
      await updateAuditResult(ctx, dedupeKey, { toEmail, delivery: "emailed" });
      return {
        ok: true,
        reply: `Emailed the ${input.kind} invite for ${title} to ${toEmail}. Link: ${result.linkUrl}`,
        resultSummary: { delivery: "emailed", propertyId: input.propertyId },
      };
    }
    if (result.status === 503) {
      // Honest fallback: nothing was emailed, but the link itself is valid —
      // hand it to the manager to send manually.
      await updateAuditResult(ctx, dedupeKey, { toEmail, delivery: "link_only" });
      return {
        ok: true,
        reply: `Email isn't configured on this deployment, so nothing was emailed. Share this ${input.kind} link with ${toEmail} yourself: ${result.linkUrl}`,
        resultSummary: { delivery: "link_only", propertyId: input.propertyId },
      };
    }
    await updateAuditResult(ctx, dedupeKey, { toEmail, delivery: "failed" }, { clearDedupeKey: true });
    return { ok: false, error: `The invite email could not be sent: ${result.error}` };
  },
});

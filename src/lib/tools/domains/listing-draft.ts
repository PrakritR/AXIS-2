import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";
import {
  LISTING_CREATION_CHECKLIST,
  buildListingSubmissionFromDraftInput,
  upsertManagerListingDraft,
  type ListingDraftToolInput,
} from "@/lib/listing-draft-agent.server";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

const listingDraftFields = {
  buildingName: z.string().min(1).describe("Listing title / building name."),
  address: z.string().min(1).describe("Street address."),
  zip: z.string().optional().describe("ZIP code."),
  neighborhood: z.string().optional().describe("Neighborhood shown on the listing."),
  beds: z.number().int().min(1).max(20).describe("Number of bedrooms / rentable rooms."),
  baths: z.number().min(0).max(20).describe("Number of bathrooms."),
  monthlyRentUsd: z.number().positive().describe("Monthly rent in US dollars (first room or entire home)."),
  tagline: z.string().optional().describe("Short headline for the listing card."),
  houseOverview: z.string().optional().describe("2–4 sentence description of the home."),
  amenitiesText: z.string().optional().describe("Amenities, one per line or comma-separated."),
  petFriendly: z.boolean().optional().describe("Whether pets are allowed."),
  housePhotoUrls: z
    .array(z.string().min(1))
    .max(24)
    .optional()
    .describe("Public listing-photos URLs from chat uploads or prior tools."),
  placeCategory: z
    .enum(["shared_home", "entire_home"])
    .optional()
    .describe("shared_home = rooms; entire_home = whole unit."),
  unitLabel: z.string().optional().describe("Unit label when relevant, e.g. 'Unit B'."),
  securityDepositUsd: z.number().min(0).optional(),
  applicationFeeUsd: z.number().min(0).optional(),
};

async function loadOwnedDraftSubmission(
  ctx: AgentContext,
  draftId: string,
): Promise<{ submission: ManagerListingSubmissionV1 } | null> {
  const { data, error } = await ctx.db
    .from("manager_property_records")
    .select("row_data, status")
    .eq("id", draftId.trim())
    .eq("manager_user_id", ctx.landlordId)
    .maybeSingle();
  if (error || !data?.row_data) return null;
  const row = data.row_data as { submission?: unknown };
  const raw = row.submission;
  if (!raw || typeof raw !== "object") return null;
  return { submission: normalizeManagerListingSubmissionV1(raw as ManagerListingSubmissionV1) };
}

function previewFields(input: ListingDraftToolInput) {
  return [
    { label: "Title", value: input.buildingName.trim() },
    { label: "Address", value: input.address.trim() },
    ...(input.neighborhood?.trim() ? [{ label: "Neighborhood", value: input.neighborhood.trim() }] : []),
    { label: "Beds / Baths", value: `${input.beds} bd / ${input.baths} ba` },
    { label: "Rent", value: `$${Math.round(input.monthlyRentUsd)}/mo` },
    ...(input.tagline?.trim() ? [{ label: "Tagline", value: input.tagline.trim() }] : []),
    ...(input.housePhotoUrls?.length
      ? [{ label: "Photos", value: `${input.housePhotoUrls.length} house photo(s)` }]
      : []),
    { label: "Saved as", value: "Draft — finish in Properties or submit for admin review when ready" },
  ];
}

export const getListingCreationChecklistTool = defineTool({
  name: "get_listing_creation_checklist",
  description:
    "Read the step-by-step checklist for building a quality listing through chat: required fields, recommended copy, photo handling, and when to call create_listing_draft.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async () => LISTING_CREATION_CHECKLIST,
});

export const createListingDraftTool = defineWriteTool({
  name: "create_listing_draft",
  description:
    "Create a rich property listing DRAFT from facts gathered in chat (address, rent, beds/baths, description, amenities, and housePhotoUrls from uploaded images). Saves status 'draft' so the manager can review in Properties → Add listing; does not publish live.",
  inputSchema: z.object(listingDraftFields).strict(),
  preview: async (_ctx, input) => {
    if (!input.housePhotoUrls?.length) {
      throw new Error("Add at least one house photo (manager attaches images in chat) before creating the draft.");
    }
    return {
      kind: "create_listing_draft",
      title: "Create listing draft",
      summary: `Save a draft listing for "${input.buildingName.trim()}" at ${input.address.trim()}.`,
      fields: previewFields(input),
      confirmLabel: "Create draft",
    };
  },
  handler: async (ctx, input) => {
    if (!input.housePhotoUrls?.length) {
      throw new Error("At least one house photo URL is required.");
    }
    const dedupeKey = `create_listing_draft:${ctx.landlordId}:${input.address.trim().toLowerCase()}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "create_listing_draft",
      toolName: "create_listing_draft",
      inputSummary: { address: input.address.trim(), buildingName: input.buildingName.trim() },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { reply: "A listing draft for this address was already created today." };
      throw new Error("Could not record the action; no draft was saved.");
    }

    const submission = buildListingSubmissionFromDraftInput(input);
    let propertyId: string;
    try {
      ({ propertyId } = await upsertManagerListingDraft(ctx.db, ctx.landlordId, submission));
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { error: "save_failed" }, { clearDedupeKey: true });
      throw new Error(e instanceof Error ? e.message : "The draft could not be saved.");
    }

    await updateAuditResult(ctx, dedupeKey, { propertyId });
    return {
      reply: `Saved a draft listing for "${input.buildingName.trim()}" (${propertyId}). Open Properties to review photos, rooms, and submit for publishing when ready.`,
      resultSummary: { propertyId, status: "draft" },
    };
  },
});

const updateListingDraftInputSchema = z
  .object({
    draftPropertyId: z.string().min(1).describe("Draft property id to update."),
    ...listingDraftFields,
  })
  .partial({
    buildingName: true,
    address: true,
    beds: true,
    baths: true,
    monthlyRentUsd: true,
  })
  .strict();

function mergeDraftInput(
  input: z.infer<typeof updateListingDraftInputSchema>,
  loaded: ManagerListingSubmissionV1,
): ListingDraftToolInput {
  const existingRent = loaded.rooms[0]?.monthlyRent ?? 0;
  const existingBaths = Number(loaded.listingTotalBathroomsId) || 1;
  const photoUrls = input.housePhotoUrls?.length
    ? [...new Set([...loaded.housePhotoDataUrls, ...input.housePhotoUrls])]
    : loaded.housePhotoDataUrls;
  return {
    buildingName: input.buildingName ?? loaded.buildingName,
    address: input.address ?? loaded.address,
    zip: input.zip ?? loaded.zip,
    neighborhood: input.neighborhood ?? loaded.neighborhood,
    beds: input.beds ?? loaded.listingBedroomSlots ?? 1,
    baths: input.baths ?? existingBaths,
    monthlyRentUsd: input.monthlyRentUsd ?? existingRent,
    tagline: input.tagline ?? loaded.tagline,
    houseOverview: input.houseOverview ?? loaded.houseOverview,
    amenitiesText: input.amenitiesText ?? loaded.amenitiesText,
    petFriendly: input.petFriendly ?? loaded.petFriendly,
    housePhotoUrls: photoUrls.length ? photoUrls : undefined,
    placeCategory: input.placeCategory,
    unitLabel: input.unitLabel,
    securityDepositUsd: input.securityDepositUsd,
    applicationFeeUsd: input.applicationFeeUsd,
  };
}

export const updateListingDraftTool = defineWriteTool({
  name: "update_listing_draft",
  description:
    "Update an existing listing draft (status draft) with more photos, copy, or pricing from chat. Pass draftPropertyId from a prior create_listing_draft or list_properties.",
  inputSchema: updateListingDraftInputSchema,
  preview: async (ctx, input) => {
    const loaded = await loadOwnedDraftSubmission(ctx, input.draftPropertyId);
    if (!loaded) throw new Error("No draft listing with that id was found for this account.");

    const merged = mergeDraftInput(input, loaded.submission);
    if (!merged.monthlyRentUsd || merged.monthlyRentUsd <= 0) {
      throw new Error("monthlyRentUsd is required when the draft has no rent set yet.");
    }

    return {
      kind: "update_listing_draft",
      title: "Update listing draft",
      summary: `Update draft "${merged.buildingName}" (${input.draftPropertyId}).`,
      fields: previewFields(merged),
      confirmLabel: "Update draft",
    };
  },
  handler: async (ctx, input) => {
    const loaded = await loadOwnedDraftSubmission(ctx, input.draftPropertyId);
    if (!loaded) throw new Error("No draft listing with that id was found.");

    const merged = mergeDraftInput(input, loaded.submission);

    const submission = buildListingSubmissionFromDraftInput(merged, loaded.submission);
    const dedupeKey = `update_listing_draft:${ctx.landlordId}:${input.draftPropertyId}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "update_listing_draft",
      toolName: "update_listing_draft",
      inputSummary: { draftPropertyId: input.draftPropertyId },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { reply: "That draft update was already applied today." };
      throw new Error("Could not record the action.");
    }

    try {
      await upsertManagerListingDraft(ctx.db, ctx.landlordId, submission, input.draftPropertyId);
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { error: "save_failed" }, { clearDedupeKey: true });
      throw new Error(e instanceof Error ? e.message : "The draft could not be updated.");
    }

    await updateAuditResult(ctx, dedupeKey, { draftPropertyId: input.draftPropertyId });
    return {
      reply: `Updated the draft listing "${submission.buildingName}". Continue in Properties when ready to publish.`,
      resultSummary: { propertyId: input.draftPropertyId },
    };
  },
});

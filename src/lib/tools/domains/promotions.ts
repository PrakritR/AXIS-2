import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import {
  normalizePromotionTemplate,
  PROMOTION_TEMPLATE_OPTIONS,
  PROMOTION_TONE_OPTIONS,
  type ManagerPromotionRow,
  type PromotionTemplate,
} from "@/lib/promotion-flyer";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";

const TEMPLATE_IDS = PROMOTION_TEMPLATE_OPTIONS.map((t) => t.id) as [PromotionTemplate, ...PromotionTemplate[]];

function templateLabel(template: PromotionTemplate): string {
  return PROMOTION_TEMPLATE_OPTIONS.find((t) => t.id === template)?.label ?? template;
}

/** Stable short FNV-1a hash of normalized text, for dedupe-key components. */
function hashText(text: string): string {
  const s = text.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * Safe projection of a promotion row. The `inputs`/`flyerCopies` payloads carry
 * base64 photo data URLs and are deliberately never returned.
 */
function summarizePromotion(row: ManagerPromotionRow) {
  // A promotion carries flyer copy, marketing text entries, or both; the
  // Promotion page's All/Text/Image pills classify on exactly this distinction.
  const raw = row as unknown as Record<string, unknown>;
  const hasFlyer = Boolean(raw.copy) || (Array.isArray(raw.flyers) && raw.flyers.length > 0);
  const textCount = Array.isArray(raw.textCopies) ? raw.textCopies.length : raw.textCopy ? 1 : 0;
  return {
    id: row.id,
    title: row.title || null,
    propertyId: row.propertyId || null,
    propertyLabel: row.propertyLabel || null,
    status: row.status === "generated" ? "generated" : "draft",
    template: normalizePromotionTemplate(row.template),
    hasFlyer,
    textCount,
    updatedAt: row.updatedAt || null,
  };
}

/** Server-side read of one of the landlord's OWN promotion rows, by id. */
async function loadOwnedPromotion(ctx: AgentContext, promotionId: string): Promise<ManagerPromotionRow | null> {
  const { data, error } = await ctx.db
    .from("manager_promotion_records")
    .select("id, row_data")
    .eq("manager_user_id", ctx.landlordId)
    .eq("id", promotionId)
    .limit(1);
  if (error) throw new Error(error.message);
  const rec = (data ?? [])[0] as { row_data: unknown } | undefined;
  return rec?.row_data ? (rec.row_data as ManagerPromotionRow) : null;
}

const UNOWNED_PROMOTION_ERROR =
  "No promotion with that id belongs to this landlord. Use list_promotions to get valid promotion ids.";

/** Resolve a property id against the landlord's OWN records; returns its display label. */
async function resolveOwnedPropertyLabel(
  ctx: AgentContext,
  propertyId: string,
): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  const { data, error } = await ctx.db
    .from("manager_property_records")
    .select("id, row_data, property_data")
    .eq("manager_user_id", ctx.landlordId)
    .eq("id", propertyId)
    .limit(1);
  if (error) throw new Error(error.message);
  const rec = (data ?? [])[0] as { id: string; row_data: unknown; property_data: unknown } | undefined;
  if (!rec) {
    return {
      ok: false,
      error: `Property ${propertyId} is not one of this landlord's properties. Use list_properties or find_records to get a valid property id.`,
    };
  }
  const src = (rec.property_data ?? rec.row_data ?? {}) as Record<string, unknown>;
  const label = [src.title, src.buildingName, src.name, src.address].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return { ok: true, label: label?.trim() ?? rec.id };
}

export const listPromotionsTool = defineTool({
  name: "list_promotions",
  description:
    "List the current landlord's marketing promotions from the Promotion page (AI flyer/social campaigns) with id, title, property, status (draft/generated), flyer template, and whether each carries a generated flyer image and/or marketing text. Use for 'what promotions do I have for this listing', 'have I made a flyer for the Ballard house', and to get promotion ids for update_promotion/delete_promotion. Flyer images and generated copy are not returned.",
  kind: "read",
  inputSchema: z
    .object({
      status: z.enum(["draft", "generated"]).optional().describe("Optional filter on promotion status."),
      propertyId: z.string().optional().describe("Optional: only promotions for this property."),
      contentType: z
        .enum(["text", "flyer"])
        .optional()
        .describe("Optional content-type filter, matching the All/Text/Image pills on the Promotion page."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const { data, error } = await ctx.db
      .from("manager_promotion_records")
      .select("row_data")
      .eq("manager_user_id", ctx.landlordId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const promotions = ((data ?? []) as { row_data: unknown }[])
      .map((r) => r.row_data as ManagerPromotionRow)
      .filter(Boolean)
      .map(summarizePromotion)
      .filter((p) => !input.status || p.status === input.status)
      .filter((p) => !input.propertyId || p.propertyId === input.propertyId)
      .filter((p) => {
        if (input.contentType === "flyer") return p.hasFlyer;
        if (input.contentType === "text") return p.textCount > 0;
        return true;
      });
    return { count: promotions.length, promotions };
  },
});

export const createPromotionTool = defineWriteTool({
  name: "create_promotion",
  description:
    "Create a draft marketing promotion for the landlord. Optionally attach one of their properties (propertyId from list_properties/find_records) and seed notes for the flyer copy. The flyer and social text themselves are generated later on the Promotions page — this only creates the draft.",
  inputSchema: z
    .object({
      title: z.string().min(1).describe("Short promotion title, e.g. 'Spring move-in special'."),
      propertyId: z
        .string()
        .optional()
        .describe("Optional property id (from list_properties) the promotion advertises."),
      template: z
        .enum(TEMPLATE_IDS)
        .optional()
        .describe("Optional flyer layout template; defaults to 'showcase'."),
      notes: z
        .string()
        .optional()
        .describe("Optional property details / selling points to seed the flyer copy with."),
    })
    .strict(),
  preview: async (ctx, input) => {
    let propertyLabel: string | null = null;
    if (input.propertyId?.trim()) {
      const property = await resolveOwnedPropertyLabel(ctx, input.propertyId.trim());
      if (!property.ok) throw new Error(property.error);
      propertyLabel = property.label;
    }
    const template = normalizePromotionTemplate(input.template);
    const lines = [
      { label: "Title", value: input.title.trim() },
      { label: "Property", value: propertyLabel ?? "None (custom details)" },
      { label: "Template", value: templateLabel(template) },
    ];
    if (input.notes?.trim()) lines.push({ label: "Notes", value: input.notes.trim() });
    return {
      kind: "create_promotion",
      title: "Create promotion",
      summary: `Create the draft promotion "${input.title.trim()}"${propertyLabel ? ` for ${propertyLabel}` : ""}. Flyer and social copy are generated on the Promotions page afterwards.`,
      fields: lines,
      confirmLabel: "Create draft",
    };
  },
  handler: async (ctx, input) => {
    const title = input.title.trim();
    const propertyId = input.propertyId?.trim() || null;
    let propertyLabel = "";
    if (propertyId) {
      const property = await resolveOwnedPropertyLabel(ctx, propertyId);
      if (!property.ok) throw new Error(property.error);
      propertyLabel = property.label;
    }

    const dedupeKey = `create_promotion:${ctx.landlordId}:${hashText(`${title}|${propertyId ?? ""}`)}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "create_promotion",
      toolName: "create_promotion",
      inputSummary: { propertyId, template: normalizePromotionTemplate(input.template) },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { reply: "A promotion with this title and property was already created today — nothing new was added." };
      }
      throw new Error("Could not record the action; no promotion was created.");
    }

    const nowIso = new Date().toISOString();
    const row: ManagerPromotionRow = {
      id: `promo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      managerUserId: ctx.landlordId,
      propertyId,
      propertyLabel,
      title,
      theme: "cobalt",
      flyerSize: "letter",
      template: normalizePromotionTemplate(input.template),
      status: "draft",
      inputs: {
        headline: title,
        sellingPoints: "",
        price: "",
        promo: "",
        cta: "",
        contact: "",
        tone: PROMOTION_TONE_OPTIONS[0]!,
        customDetails: input.notes?.trim() ?? "",
        images: [],
      },
      copy: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const { error } = await ctx.db.from("manager_promotion_records").upsert(
      { id: row.id, manager_user_id: ctx.landlordId, row_data: row, updated_at: nowIso },
      { onConflict: "id" },
    );
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { created: false }, { clearDedupeKey: true });
      throw new Error(error.message);
    }
    await updateAuditResult(ctx, dedupeKey, { created: true, promotionId: row.id });
    return { reply: `Created the draft promotion "${title}"${propertyLabel ? ` for ${propertyLabel}` : ""} — open the Promotions page to generate the flyer and social copy.`, resultSummary: { promotionId: row.id } };
  },
});

export const updatePromotionTool = defineWriteTool({
  name: "update_promotion",
  description:
    "Rename one of the landlord's promotions and/or change its status (draft/generated). Pass the promotionId from list_promotions. Flyer content itself is edited on the Promotions page, not here.",
  inputSchema: z
    .object({
      promotionId: z.string().min(1).describe("Id of the promotion to update, from list_promotions."),
      title: z.string().min(1).optional().describe("New promotion title."),
      status: z.enum(["draft", "generated"]).optional().describe("New promotion status."),
    })
    .strict(),
  preview: async (ctx, input) => {
    if (!input.title?.trim() && !input.status) {
      throw new Error("Provide at least one change: a new title or a new status.");
    }
    const current = await loadOwnedPromotion(ctx, input.promotionId.trim());
    if (!current) throw new Error(UNOWNED_PROMOTION_ERROR);
    const lines = [{ label: "Promotion", value: current.title || current.id }];
    if (input.title?.trim()) lines.push({ label: "New title", value: input.title.trim() });
    if (input.status) {
      lines.push({ label: "Status", value: `${current.status === "generated" ? "generated" : "draft"} → ${input.status}` });
    }
    return {
      kind: "update_promotion",
      title: "Update promotion",
      summary: `Update the promotion "${current.title || current.id}".`,
      fields: lines,
      confirmLabel: "Update promotion",
    };
  },
  handler: async (ctx, input) => {
    const promotionId = input.promotionId.trim();
    const current = await loadOwnedPromotion(ctx, promotionId);
    if (!current) throw new Error(UNOWNED_PROMOTION_ERROR);

    const dedupeKey = `update_promotion:${ctx.landlordId}:${promotionId}:${hashText(`${input.title ?? ""}|${input.status ?? ""}`)}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "update_promotion",
      toolName: "update_promotion",
      inputSummary: { promotionId, status: input.status ?? null, titleChanged: Boolean(input.title?.trim()) },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { reply: "This exact promotion update was already applied today — nothing changed." };
      }
      throw new Error("Could not record the action; the promotion was not updated.");
    }

    // Mirror-table write: merge onto the CURRENT row_data, never rebuild it.
    const nowIso = new Date().toISOString();
    const merged: ManagerPromotionRow = {
      ...current,
      title: input.title?.trim() || current.title,
      status: input.status ?? current.status,
      updatedAt: nowIso,
    };
    const { error } = await ctx.db
      .from("manager_promotion_records")
      .update({ row_data: merged, updated_at: nowIso })
      .eq("id", promotionId)
      .eq("manager_user_id", ctx.landlordId);
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { updated: false }, { clearDedupeKey: true });
      throw new Error(error.message);
    }
    await updateAuditResult(ctx, dedupeKey, { updated: true, promotionId });
    return { reply: `Updated the promotion "${merged.title}"${input.status ? ` (status: ${merged.status})` : ""}.`, resultSummary: { promotionId } };
  },
});

export const deletePromotionTool = defineWriteTool({
  name: "delete_promotion",
  description:
    "Permanently delete one of the landlord's promotions, including its generated flyer and text copies. Pass the promotionId from list_promotions.",
  destructive: true,
  inputSchema: z
    .object({
      promotionId: z.string().min(1).describe("Id of the promotion to delete, from list_promotions."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const current = await loadOwnedPromotion(ctx, input.promotionId.trim());
    if (!current) throw new Error(UNOWNED_PROMOTION_ERROR);
    return {
      kind: "delete_promotion",
      title: "Delete promotion",
      summary: `Delete the promotion "${current.title || current.id}"${current.propertyLabel ? ` (${current.propertyLabel})` : ""}.`,
      fields: [
          { label: "Promotion", value: current.title || current.id },
          { label: "Status", value: current.status === "generated" ? "generated" : "draft" },
        ],
      confirmLabel: "Delete promotion",
      warnings: ["This permanently deletes the promotion and any generated flyer and text copies. It cannot be undone."],
    };
  },
  handler: async (ctx, input) => {
    const promotionId = input.promotionId.trim();
    const current = await loadOwnedPromotion(ctx, promotionId);
    if (!current) throw new Error(UNOWNED_PROMOTION_ERROR);

    // One-shot transition: retries return already-done forever.
    const dedupeKey = `delete_promotion:${ctx.landlordId}:${promotionId}`;
    const audit = await writeAuditLog(ctx, {
      action: "delete_promotion",
      toolName: "delete_promotion",
      inputSummary: { promotionId },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { reply: "That promotion was already deleted." };
      throw new Error("Could not record the action; the promotion was not deleted.");
    }

    const { error } = await ctx.db
      .from("manager_promotion_records")
      .delete()
      .eq("id", promotionId)
      .eq("manager_user_id", ctx.landlordId);
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { deleted: false }, { clearDedupeKey: true });
      throw new Error(error.message);
    }
    await updateAuditResult(ctx, dedupeKey, { deleted: true });
    return { reply: `Deleted the promotion "${current.title || promotionId}".`, resultSummary: { promotionId } };
  },
});

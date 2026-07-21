/**
 * Manager document-library tools.
 *
 * The `manager-documents` Storage bucket is PRIVATE: bytes are reachable only
 * through a server-minted signed URL after an ownership check, so this tool
 * returns METADATA ONLY and never a URL or file content. The assistant tells the
 * landlord what exists and where it lives; opening it stays a portal action.
 * Every query is scoped by `manager_user_id = ctx.landlordId`.
 */
import { z } from "zod";
import { defineTool } from "../registry";
import { DOCUMENT_CATEGORIES } from "@/lib/documents/manager-documents";

const MAX_ROWS = 500;

export const listDocumentsTool = defineTool({
  name: "list_documents",
  description:
    "List documents in the current landlord's Document Library (the Documents -> Library tab): display name, category (lease/insurance/tax/notice/invoice/inspection/photo/other), what the document is filed against (property, lease, resident, vendor, or work order), who it is shared with, expiry date, and signature status. Use for 'do I have a copy of the insurance certificate', 'which documents expire this year', 'what have I shared with this resident'. File contents and download links are never returned — the landlord opens documents from the portal.",
  kind: "read",
  inputSchema: z
    .object({
      category: z.enum(DOCUMENT_CATEGORIES).optional().describe("Optional category filter."),
      propertyId: z.string().optional().describe("Optional: only documents filed against this property."),
      search: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring match on the document's display name."),
      expiringOnly: z
        .boolean()
        .optional()
        .describe("When true, return only documents that have an expiry date set."),
    })
    .strict(),
  handler: async (ctx, input) => {
    let query = ctx.db
      .from("manager_documents")
      .select(
        "id, display_name, category, property_id, unit_label, lease_id, resident_email, vendor_id, work_order_id, visibility, expires_at, signature_status, size_bytes, created_at, deleted_at",
      )
      .eq("manager_user_id", ctx.landlordId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (input.category) query = query.eq("category", input.category);
    if (input.propertyId) query = query.eq("property_id", input.propertyId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const search = input.search?.trim().toLowerCase();
    const documents = ((data ?? []) as Record<string, unknown>[])
      // Soft-deleted rows are invisible in the Library, so they must be
      // invisible to the assistant too.
      .filter((d) => !d.deleted_at)
      .filter((d) => !input.expiringOnly || Boolean(d.expires_at))
      .filter((d) => !search || String(d.display_name ?? "").toLowerCase().includes(search))
      .map((d) => ({
        id: String(d.id ?? ""),
        name: String(d.display_name ?? "") || null,
        category: String(d.category ?? "") || null,
        propertyId: (d.property_id as string | null) ?? null,
        unit: (d.unit_label as string | null) ?? null,
        leaseId: (d.lease_id as string | null) ?? null,
        residentEmail: (d.resident_email as string | null) ?? null,
        vendorId: (d.vendor_id as string | null) ?? null,
        workOrderId: (d.work_order_id as string | null) ?? null,
        sharedWith: String(d.visibility ?? "manager"),
        expiresAt: (d.expires_at as string | null) ?? null,
        signatureStatus: (d.signature_status as string | null) ?? null,
        sizeBytes: Number(d.size_bytes ?? 0),
        uploadedAt: (d.created_at as string | null) ?? null,
      }));
    return { count: documents.length, documents };
  },
});

export const listPromotionsTool = defineTool({
  name: "list_promotions",
  description:
    "List the current landlord's marketing promotions from the Promotion page: title, property, content type (a generated flyer image or marketing text), status, and when it was created. Use for 'what promotions do I have for this listing', 'have I made a flyer for the Ballard house'.",
  kind: "read",
  inputSchema: z
    .object({
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
      .select("id, row_data")
      .eq("manager_user_id", ctx.landlordId)
      .order("id", { ascending: true })
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);
    const promotions = ((data ?? []) as { row_data: unknown }[])
      .map((r) => (r.row_data ?? {}) as Record<string, unknown>)
      .map((p) => {
        // A promotion carries flyer copy, marketing text entries, or both; the
        // Promotion page's pills classify on exactly this distinction.
        const hasFlyer = Boolean(p.copy) || (Array.isArray(p.flyers) && p.flyers.length > 0);
        const textEntries = Array.isArray(p.textCopies) ? p.textCopies.length : p.textCopy ? 1 : 0;
        return {
          id: String(p.id ?? ""),
          title: String(p.title ?? "") || null,
          property: String(p.propertyLabel ?? "") || null,
          propertyId: (p.propertyId as string | null) ?? null,
          status: String(p.status ?? "") || null,
          hasFlyer,
          textCount: textEntries,
        };
      })
      .filter((p) => !input.propertyId || p.propertyId === input.propertyId)
      .filter((p) => {
        if (input.contentType === "flyer") return p.hasFlyer;
        if (input.contentType === "text") return p.textCount > 0;
        return true;
      });
    return { count: promotions.length, promotions };
  },
});

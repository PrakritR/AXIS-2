import { z } from "zod";
import { defineTool } from "../registry";

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

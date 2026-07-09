import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_pro_relationship_records",
  scope: (query, user) => {
    const q = query as { or: (expr: string) => unknown };
    if (user.role === "admin") return query;
    return q.or(`manager_user_id.eq.${user.id},related_user_id.eq.${user.id},related_email.eq.${user.email ?? ""}`);
  },
  buildUpsert: (row) => ({
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    // The relationship record produced by proRelationshipRowsFromInvites carries
    // the counterpart's auth id as `linkedUserId` (never `relatedUserId`), so
    // without this fallback related_user_id was always written null — making the
    // row visible ONLY to whoever's browser wrote it (the GET scope matches on
    // manager_user_id OR related_user_id OR related_email). Populating
    // related_user_id from linkedUserId lets the SAME accepted link resolve for
    // BOTH participants (owner ↔ co-manager) and repairs the co-manager→owner
    // inbox scope that keys off these rows.
    related_user_id: row.relatedUserId ?? row.related_user_id ?? row.linkedUserId ?? null,
    related_email: row.relatedEmail ?? row.related_email ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
  assignOwnership: (record, user) =>
    user.role === "admin" ? record : { ...record, manager_user_id: user.id },
});

export const GET = route.GET;
export const POST = route.POST;

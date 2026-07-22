import type { MockProperty } from "@/data/types";
import type { AdminPropertyRow, AdminPropertyBucketIndex } from "@/lib/demo-admin-property-inventory";
import type { ManagerPendingPropertyRow } from "@/lib/demo-property-pipeline";

export type ManagerPropertyRecordStatus =
  | "pending"
  | "live"
  | "review"
  | "request_change"
  | "unlisted"
  | "rejected"
  // Manager saved an in-progress "add property" wizard to finish later. Private
  // to the owner (RLS `select_own`), never published, never in public listings.
  | "draft";

export type ManagerPropertyRecord = {
  id: string;
  manager_user_id: string | null;
  status: ManagerPropertyRecordStatus;
  row_data: unknown;
  property_data: unknown;
  edit_request_note: string | null;
};

export type PropertyPipelineSnapshot = {
  pendingByUser: Record<string, ManagerPendingPropertyRow[]>;
  extrasByUser: Record<string, MockProperty[]>;
  sideGlobal: {
    requestChange: AdminPropertyRow[];
    unlisted: AdminPropertyRow[];
    rejected: AdminPropertyRow[];
    drafts: AdminPropertyRow[];
  };
  sideByUser: Record<
    string,
    {
      requestChange: AdminPropertyRow[];
      unlisted: AdminPropertyRow[];
      rejected: AdminPropertyRow[];
      drafts: AdminPropertyRow[];
    }
  >;
};

function normalizeUserId(userId: string | null | undefined) {
  return String(userId ?? "").trim() || "__axis_legacy__";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function emptyPropertyPipelineSnapshot(): PropertyPipelineSnapshot {
  return { pendingByUser: {}, extrasByUser: {}, sideGlobal: { requestChange: [], unlisted: [], rejected: [], drafts: [] }, sideByUser: {} };
}

function filterSideRows(rows: AdminPropertyRow[], linkedPropertyIds: Set<string>, ownerUserId: string, viewerUserId: string) {
  if (ownerUserId === viewerUserId) return rows;
  return rows.filter((row) => {
    const pid = String(row.listingId ?? row.adminRefId ?? "").trim();
    return pid && linkedPropertyIds.has(pid);
  });
}

/** Keep only the signed-in manager's rows plus explicitly linked owner buckets. */
export function scopePropertyPipelineSnapshotForViewer(
  snapshot: PropertyPipelineSnapshot,
  viewerUserId: string,
  linkedPropertyIds: Iterable<string>,
): PropertyPipelineSnapshot {
  const viewer = viewerUserId.trim();
  if (!viewer) return emptyPropertyPipelineSnapshot();
  const linked = new Set([...linkedPropertyIds].map((id) => id.trim()).filter(Boolean));

  const pendingByUser: PropertyPipelineSnapshot["pendingByUser"] = {};
  for (const [ownerId, rows] of Object.entries(snapshot.pendingByUser)) {
    if (ownerId === viewer) {
      pendingByUser[ownerId] = rows;
      continue;
    }
    const filtered = rows.filter((row) => linked.has(row.id));
    if (filtered.length > 0) pendingByUser[ownerId] = filtered;
  }

  const extrasByUser: PropertyPipelineSnapshot["extrasByUser"] = {};
  for (const [ownerId, rows] of Object.entries(snapshot.extrasByUser)) {
    if (ownerId === viewer) {
      extrasByUser[ownerId] = rows;
      continue;
    }
    const filtered = rows.filter((row) => linked.has(row.id));
    if (filtered.length > 0) extrasByUser[ownerId] = filtered;
  }

  const sideByUser: PropertyPipelineSnapshot["sideByUser"] = {};
  for (const [ownerId, side] of Object.entries(snapshot.sideByUser)) {
    const next = {
      requestChange: filterSideRows(side.requestChange, linked, ownerId, viewer),
      unlisted: filterSideRows(side.unlisted, linked, ownerId, viewer),
      rejected: filterSideRows(side.rejected, linked, ownerId, viewer),
      // Drafts are private to the owner — unlike the other buckets, a linked
      // property grant never exposes one, so this is owner-only by construction
      // rather than by filterSideRows happening to find no matching linked id.
      drafts: ownerId === viewer ? side.drafts ?? [] : [],
    };
    if (
      ownerId === viewer ||
      next.requestChange.length + next.unlisted.length + next.rejected.length + next.drafts.length > 0
    ) {
      sideByUser[ownerId] = next;
    }
  }

  return {
    pendingByUser,
    extrasByUser,
    sideGlobal: { requestChange: [], unlisted: [], rejected: [], drafts: [] },
    sideByUser,
  };
}

export function propertyRowsToSnapshot(records: ManagerPropertyRecord[]): PropertyPipelineSnapshot {
  const snapshot = emptyPropertyPipelineSnapshot();
  for (const record of records) {
    const uid = normalizeUserId(record.manager_user_id);
    if (record.status === "pending") {
      const row = asObject(record.row_data);
      if (!row) continue;
      const pending = {
        ...(row as unknown as ManagerPendingPropertyRow),
        // Keep ownership aligned with the DB column — property_data can lag after transfers.
        submittedByUserId:
          uid !== "__axis_legacy__"
            ? uid
            : (row as unknown as ManagerPendingPropertyRow).submittedByUserId,
      };
      snapshot.pendingByUser[uid] = [...(snapshot.pendingByUser[uid] ?? []), pending];
      continue;
    }
    if (record.status === "live" || record.status === "review") {
      const prop = asObject(record.property_data);
      if (!prop) continue;
      const property = {
        ...(prop as unknown as MockProperty),
        // Stamp the DB owner onto the listing so linked-property resolution and
        // co-manager "owned vs linked" checks agree with manager_property_records.
        ...(uid !== "__axis_legacy__" ? { managerUserId: uid } : {}),
        // Listings are auto-published — `review` is treated as live.
        adminPublishLive: true,
      } as MockProperty;
      snapshot.extrasByUser[uid] = [...(snapshot.extrasByUser[uid] ?? []), property];
      continue;
    }
    const row = asObject(record.row_data);
    if (!row) continue;
    const adminRow = {
      ...(row as unknown as AdminPropertyRow),
      ...(record.edit_request_note?.trim() ? { editRequestNote: record.edit_request_note.trim() } : {}),
    };
    const key = record.status === "request_change" ? "requestChange" : record.status === "draft" ? "drafts" : record.status;
    if (key !== "requestChange" && key !== "unlisted" && key !== "rejected" && key !== "drafts") continue;
    snapshot.sideGlobal[key].push(adminRow);
    const side = (snapshot.sideByUser[uid] ??= { requestChange: [], unlisted: [], rejected: [], drafts: [] });
    side[key].push(adminRow);
  }
  return snapshot;
}

export function statusForBucket(bucket: AdminPropertyBucketIndex): ManagerPropertyRecordStatus {
  if (bucket === 1) return "request_change";
  if (bucket === 2) return "live";
  if (bucket === 3) return "unlisted";
  if (bucket === 4) return "rejected";
  if (bucket === 5) return "draft";
  return "pending";
}

import type { MockProperty } from "@/data/types";
import type { AdminPropertyRow, AdminPropertyBucketIndex } from "@/lib/demo-admin-property-inventory";
import type { ManagerPendingPropertyRow } from "@/lib/demo-property-pipeline";

export type ManagerPropertyRecordStatus = "pending" | "live" | "review" | "request_change" | "unlisted" | "rejected";

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
  };
  sideByUser: Record<
    string,
    {
      requestChange: AdminPropertyRow[];
      unlisted: AdminPropertyRow[];
      rejected: AdminPropertyRow[];
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
  return { pendingByUser: {}, extrasByUser: {}, sideGlobal: { requestChange: [], unlisted: [], rejected: [] }, sideByUser: {} };
}

export function propertyRowsToSnapshot(records: ManagerPropertyRecord[]): PropertyPipelineSnapshot {
  const snapshot = emptyPropertyPipelineSnapshot();
  for (const record of records) {
    const uid = normalizeUserId(record.manager_user_id);
    if (record.status === "pending") {
      const row = asObject(record.row_data);
      if (!row) continue;
      const pending = row as unknown as ManagerPendingPropertyRow;
      snapshot.pendingByUser[uid] = [...(snapshot.pendingByUser[uid] ?? []), pending];
      continue;
    }
    if (record.status === "live" || record.status === "review") {
      const prop = asObject(record.property_data);
      if (!prop) continue;
      const property = prop as unknown as MockProperty;
      snapshot.extrasByUser[uid] = [...(snapshot.extrasByUser[uid] ?? []), property];
      continue;
    }
    const row = asObject(record.row_data);
    if (!row) continue;
    const adminRow = {
      ...(row as unknown as AdminPropertyRow),
      ...(record.edit_request_note?.trim() ? { editRequestNote: record.edit_request_note.trim() } : {}),
    };
    const key = record.status === "request_change" ? "requestChange" : record.status;
    if (key !== "requestChange" && key !== "unlisted" && key !== "rejected") continue;
    snapshot.sideGlobal[key].push(adminRow);
    const side = (snapshot.sideByUser[uid] ??= { requestChange: [], unlisted: [], rejected: [] });
    side[key].push(adminRow);
  }
  return snapshot;
}

export function statusForBucket(bucket: AdminPropertyBucketIndex): ManagerPropertyRecordStatus {
  if (bucket === 1) return "request_change";
  if (bucket === 2) return "live";
  if (bucket === 3) return "unlisted";
  if (bucket === 4) return "rejected";
  return "pending";
}

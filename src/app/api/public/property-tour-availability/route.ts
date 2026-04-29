import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  property_id: string | null;
  record_type: string | null;
  row_data: unknown;
};

type PropertyManagerEntry = {
  userId: string;
  label: string;
};

type PropertyRecordRow = {
  manager_user_id: string | null;
  status: string | null;
  property_data: unknown;
};

function safePropertyId(propertyId: string): string {
  return propertyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function payloadSlots(rowData: unknown): string[] {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return [];
  const payload = (rowData as Record<string, unknown>).payload;
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function propertyMatchKey(row: Record<string, unknown>): string {
  return `${textField(row, "buildingName")}::${textField(row, "address")}`.toLowerCase();
}

function houseKeyFromParts(buildingName: string | null | undefined, address: string | null | undefined): string {
  return `${String(buildingName ?? "").trim()}::${String(address ?? "").trim()}`.toLowerCase();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId")?.trim();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    const requestedHouseKey = houseKeyFromParts(searchParams.get("buildingName"), searchParams.get("address"));

    const safeId = safePropertyId(propertyId);
    const db = createSupabaseServiceRoleClient();

    const { data: propertyRows, error: propertyError } = await db
      .from("manager_property_records")
      .select("manager_user_id, status, property_data");

    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });

    const propertyRecords = ((propertyRows ?? []) as PropertyRecordRow[])
      .map((row) => ({
        managerUserId: row.manager_user_id?.trim() ?? "",
        status: row.status?.trim().toLowerCase() ?? "",
        property: asObject(row.property_data),
      }))
      .filter((row): row is { managerUserId: string; status: string; property: Record<string, unknown> } => Boolean(row.managerUserId && row.property));

    const directMatches = propertyRecords.filter(({ property }) => {
      const id = textField(property, "id");
      const buildingId = textField(property, "buildingId");
      const key = propertyMatchKey(property);
      return (
        id === propertyId ||
        safePropertyId(id) === safeId ||
        buildingId === propertyId ||
        safePropertyId(buildingId) === safeId ||
        (requestedHouseKey !== "::" && key === requestedHouseKey)
      );
    });
    const houseKeys = new Set(directMatches.map(({ property }) => propertyMatchKey(property)).filter(Boolean));
    const matchingPropertyRecords = propertyRecords.filter(
      ({ property }) => directMatches.some((match) => match.property === property) || houseKeys.has(propertyMatchKey(property)),
    );
    const managerIds = [
      ...new Set(
        matchingPropertyRecords.map(({ managerUserId }) => managerUserId),
      ),
    ];
    const propertyIdsByManager = new Map<string, Set<string>>();
    const requestedPropertyIds = new Set([propertyId, safeId].filter(Boolean));
    for (const { managerUserId, property } of matchingPropertyRecords) {
      const ids = propertyIdsByManager.get(managerUserId) ?? new Set<string>();
      for (const value of [textField(property, "id"), textField(property, "buildingId")]) {
        if (!value) continue;
        ids.add(value);
        ids.add(safePropertyId(value));
        requestedPropertyIds.add(value);
        requestedPropertyIds.add(safePropertyId(value));
      }
      propertyIdsByManager.set(managerUserId, ids);
    }

    const propertyAvailabilityRows = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .eq("record_type", "manager_property_availability");

    if (propertyAvailabilityRows.error) {
      return NextResponse.json({ error: propertyAvailabilityRows.error.message }, { status: 500 });
    }

    const { data: globalData, error } = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .eq("record_type", "manager_availability")
      .in("manager_user_id", managerIds.length > 0 ? managerIds : ["__none__"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const propertyRowsForHouse = ((propertyAvailabilityRows.data ?? []) as ScheduleRecordRow[]).filter((row) => {
      const managerUserId = row.manager_user_id?.trim();
      if (!managerUserId) return false;
      const propertyIds = propertyIdsByManager.get(managerUserId);
      const rowPropertyId = row.property_id?.trim() ?? "";
      const safeRowPropertyId = safePropertyId(rowPropertyId);
      const rowId = row.id?.trim() ?? "";
      const directPropertyMatch =
        requestedPropertyIds.has(rowPropertyId) ||
        requestedPropertyIds.has(safeRowPropertyId) ||
        [...requestedPropertyIds].some((propertyKey) => rowId.includes(`_prop_${propertyKey}`));
      if (directPropertyMatch) return true;
      if (!propertyIds || propertyIds.size === 0) return false;
      return (
        propertyIds.has(rowPropertyId) ||
        propertyIds.has(safeRowPropertyId) ||
        [...propertyIds].some((propertyKey) => rowId.includes(`_prop_${propertyKey}`))
      );
    });
    for (const row of propertyRowsForHouse) {
      const managerUserId = row.manager_user_id?.trim();
      if (managerUserId && !managerIds.includes(managerUserId)) managerIds.push(managerUserId);
    }
    const globalRows = ((globalData ?? []) as ScheduleRecordRow[]).filter((row) => {
      const managerUserId = row.manager_user_id?.trim();
      return managerUserId && !propertyRowsForHouse.some((propertyRow) => propertyRow.manager_user_id === managerUserId);
    });
    const rows = [...propertyRowsForHouse, ...globalRows];
    const availabilityManagerIds = [...new Set(rows.map((row) => row.manager_user_id).filter((id): id is string => Boolean(id)))];
    const labelByManagerId = new Map<string, string>();
    if (availabilityManagerIds.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, email, full_name").in("id", availabilityManagerIds);
      for (const profile of (profiles ?? []) as { id?: string | null; email?: string | null; full_name?: string | null }[]) {
        if (!profile.id) continue;
        labelByManagerId.set(profile.id, profile.email?.trim() || profile.full_name?.trim() || "Property manager");
      }
    }

    const slotHosts: Record<string, PropertyManagerEntry[]> = {};
    for (const row of rows) {
      const managerUserId = row.manager_user_id?.trim();
      if (!managerUserId) continue;
      const host = {
        userId: managerUserId,
        label: labelByManagerId.get(managerUserId) ?? "Property manager",
      };
      for (const slot of payloadSlots(row.row_data)) {
        const hosts = slotHosts[slot] ?? [];
        if (!hosts.some((item) => item.userId === host.userId)) {
          hosts.push(host);
        }
        slotHosts[slot] = hosts;
      }
    }

    return NextResponse.json({ slotHosts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load property tour availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

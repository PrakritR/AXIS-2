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
  propertyId?: string;
};

type PropertyRecordRow = {
  manager_user_id: string | null;
  status: string | null;
  property_data: unknown;
};

type TourBlock = {
  start: string;
  end: string;
  slotKey?: string;
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

function rowPayload(rowData: unknown): Record<string, unknown> | null {
  const row = asObject(rowData);
  if (!row) return null;
  return asObject(row.payload) ?? row;
}

function windowsFromPayload(payload: Record<string, unknown>): TourBlock[] {
  const requested = Array.isArray(payload.requestedWindows) ? payload.requestedWindows : [];
  const windows = requested
    .map(asObject)
    .filter((window): window is Record<string, unknown> => Boolean(window))
    .map((window) => ({
      start: textField(window, "start"),
      end: textField(window, "end"),
      slotKey: textField(window, "slotKey") || undefined,
    }))
    .filter((window) => window.start && window.end);
  if (windows.length > 0) return windows;
  const start = textField(payload, "proposedStart") || textField(payload, "start");
  const end = textField(payload, "proposedEnd") || textField(payload, "end");
  if (!start || !end) return [];
  return [{ start, end, slotKey: textField(payload, "slotKey") || undefined }];
}

function slotBlocked(slot: string, blocks: TourBlock[]): boolean {
  return blocks.some((block) => block.slotKey === slot);
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
    const blockedSlotsByManager = new Map<string, TourBlock[]>();
    if (availabilityManagerIds.length > 0) {
      const { data: pendingRows, error: pendingError } = await db
        .from("portal_schedule_records")
        .select("manager_user_id, row_data")
        .eq("record_type", "partner_inquiry_request")
        .in("manager_user_id", availabilityManagerIds);

      if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });

      for (const pending of (pendingRows ?? []) as ScheduleRecordRow[]) {
        const managerUserId = pending.manager_user_id?.trim();
        const payload = rowPayload(pending.row_data);
        if (!managerUserId || !payload) continue;
        if (textField(payload, "status").toLowerCase() !== "pending") continue;
        const blocks = blockedSlotsByManager.get(managerUserId) ?? [];
        blocks.push(...windowsFromPayload(payload));
        blockedSlotsByManager.set(managerUserId, blocks);
      }

      const { data: plannedRow, error: plannedError } = await db
        .from("portal_schedule_records")
        .select("row_data")
        .eq("id", "axis_admin_planned_events_v1")
        .maybeSingle();

      if (plannedError) return NextResponse.json({ error: plannedError.message }, { status: 500 });

      const plannedPayload = asObject(plannedRow?.row_data)?.payload;
      const plannedEvents = Array.isArray(plannedPayload) ? plannedPayload.map(asObject).filter(Boolean) : [];
      for (const event of plannedEvents as Record<string, unknown>[]) {
        if (textField(event, "kind") !== "tour") continue;
        const managerUserId = textField(event, "managerUserId");
        if (!managerUserId || !availabilityManagerIds.includes(managerUserId)) continue;
        const start = textField(event, "start");
        const end = textField(event, "end");
        if (!start || !end) continue;
        const blocks = blockedSlotsByManager.get(managerUserId) ?? [];
        blocks.push({ start, end, slotKey: textField(event, "slotKey") || undefined });
        blockedSlotsByManager.set(managerUserId, blocks);
      }
    }

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
      const hostPropertyId = row.property_id?.trim() || undefined;
      const host = {
        userId: managerUserId,
        label: labelByManagerId.get(managerUserId) ?? "Property manager",
        propertyId: hostPropertyId,
      };
      for (const slot of payloadSlots(row.row_data)) {
        if (slotBlocked(slot, blockedSlotsByManager.get(managerUserId) ?? [])) continue;
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

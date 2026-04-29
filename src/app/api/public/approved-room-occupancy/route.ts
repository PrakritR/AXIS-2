import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function publicApprovedRow(raw: unknown): DemoApplicantRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as DemoApplicantRow;
  if (row.bucket !== "approved") return null;
  const id = text(row.id);
  const propertyId = text(row.assignedPropertyId) || text(row.propertyId) || text(row.application?.propertyId);
  const roomChoice = text(row.assignedRoomChoice) || text(row.application?.roomChoice1);
  const leaseStart = text(row.application?.leaseStart);
  const leaseEnd = text(row.application?.leaseEnd);
  if (!id || !propertyId || !roomChoice || !leaseStart) return null;

  return {
    id,
    bucket: "approved",
    name: "",
    property: "",
    stage: "Approved",
    propertyId,
    assignedPropertyId: text(row.assignedPropertyId) || undefined,
    assignedRoomChoice: roomChoice,
    managerUserId: text(row.managerUserId) || undefined,
    application: {
      propertyId,
      roomChoice1: roomChoice,
      leaseStart,
      leaseEnd,
    },
  } as DemoApplicantRow;
}

export async function GET() {
  try {
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("manager_application_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byId = new Map<string, DemoApplicantRow>();
    for (const record of data ?? []) {
      const row = publicApprovedRow(record.row_data);
      if (row) byId.set(row.id, row);
    }

    return NextResponse.json({ rows: [...byId.values()] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load approved room occupancy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

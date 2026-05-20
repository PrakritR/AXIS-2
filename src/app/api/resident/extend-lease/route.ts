import { NextRequest, NextResponse } from "next/server";
import { formatPacificDate } from "@/lib/pacific-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export const runtime = "nodejs";

function asObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function hasBothSignatures(row: LeasePipelineRow): boolean {
  const mgr = row.managerSignature as Record<string, unknown> | null | undefined;
  const res = row.residentSignature as Record<string, unknown> | null | undefined;
  const legacyName = typeof row.signatureName === "string" ? row.signatureName : null;
  const legacyAt = typeof row.signedAtIso === "string" ? row.signedAtIso : null;
  return Boolean(mgr?.name && mgr?.signedAtIso && ((res?.name && res?.signedAtIso) || (legacyName && legacyAt)));
}

function propertyFromRecord(record: { id: string; property_data: unknown; row_data: unknown }): MockProperty | undefined {
  const pd = asObject(record.property_data);
  if (pd) {
    const id = asString(pd.id) || record.id;
    return {
      id,
      title: asString(pd.title) || asString(pd.buildingName) || "Property",
      tagline: asString(pd.tagline),
      address: asString(pd.address),
      zip: asString(pd.zip),
      neighborhood: asString(pd.neighborhood),
      beds: typeof pd.beds === "number" ? pd.beds : 0,
      baths: typeof pd.baths === "number" ? pd.baths : 0,
      rentLabel: asString(pd.rentLabel),
      available: asString(pd.available),
      petFriendly: Boolean(pd.petFriendly),
      buildingId: asString(pd.buildingId) || id,
      buildingName: asString(pd.buildingName) || asString(pd.title) || "Property",
      unitLabel: asString(pd.unitLabel),
      listingSubmission: pd.listingSubmission as MockProperty["listingSubmission"],
      managerUserId: asString(pd.managerUserId) || undefined,
      adminPublishLive: Boolean(pd.adminPublishLive),
    };
  }
  const rd = asObject(record.row_data);
  if (!rd) return undefined;
  const sub = asObject(rd.submission);
  const buildingName = asString(rd.buildingName) || asString(sub?.buildingName) || "Property";
  return {
    id: record.id,
    title: buildingName,
    tagline: asString(rd.tagline),
    address: asString(rd.address) || asString(sub?.address),
    zip: asString(rd.zip) || asString(sub?.zip),
    neighborhood: asString(rd.neighborhood),
    beds: typeof rd.beds === "number" ? rd.beds : 0,
    baths: typeof rd.baths === "number" ? rd.baths : 0,
    rentLabel: "",
    available: "",
    petFriendly: Boolean(rd.petFriendly),
    buildingId: record.id,
    buildingName,
    unitLabel: asString(rd.unitLabel),
    listingSubmission: sub as MockProperty["listingSubmission"],
    managerUserId: undefined,
    adminPublishLive: false,
  };
}

function formatAvailabilityLabel(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3) return `Available from ${isoDate}`;
  const [y, m, d] = parts as [number, number, number];
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return `Available from ${isoDate}`;
  return `Available from ${formatPacificDate(dt, { year: "numeric", month: "long", day: "numeric" })}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
    const role = String(profile?.role ?? "").toLowerCase();
    if (role && role !== "resident") return NextResponse.json({ error: "Residents only." }, { status: 403 });
    if (!email) return NextResponse.json({ error: "No email on file." }, { status: 400 });

    const body = await req.json() as { newLeaseEnd?: string };
    const newLeaseEnd = (body.newLeaseEnd ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newLeaseEnd)) {
      return NextResponse.json({ error: "Provide a valid newLeaseEnd (YYYY-MM-DD)." }, { status: 400 });
    }

    // Find the resident's fully-signed lease
    const { data: leaseRecords } = await db
      .from("portal_lease_pipeline_records")
      .select("id, row_data, manager_user_id, property_id")
      .eq("resident_email", email)
      .order("updated_at", { ascending: false });

    const leaseRecord = (leaseRecords ?? []).find((r) => {
      const row = asObject(r.row_data) as unknown as LeasePipelineRow | null;
      return row && hasBothSignatures(row) && row.status !== "Voided";
    });

    if (!leaseRecord) return NextResponse.json({ error: "No fully-signed lease found." }, { status: 404 });

    const leaseRow = leaseRecord.row_data as unknown as LeasePipelineRow;
    const currentStart = leaseRow.application?.leaseStart ?? "";
    if (currentStart && newLeaseEnd < currentStart) {
      return NextResponse.json({ error: "New move-out date cannot be before the lease start date." }, { status: 400 });
    }
    const currentEnd = leaseRow.application?.leaseEnd ?? "";
    if (newLeaseEnd === currentEnd) {
      return NextResponse.json({ error: "New move-out date is the same as the current date." }, { status: 400 });
    }

    // Build updated lease row: new leaseEnd, cleared sigs, back to Manager Review
    const updatedApplication = { ...(leaseRow.application ?? {}), leaseEnd: newLeaseEnd };
    const iso = new Date().toISOString();

    // Regenerate lease HTML server-side
    let newHtml: string | null = null;
    try {
      const propertyId = leaseRecord.property_id ?? leaseRow.propertyId ?? "";
      const propertyRecord = propertyId
        ? (await db.from("manager_property_records").select("id, property_data, row_data").eq("id", propertyId).maybeSingle()).data
        : null;
      if (propertyRecord) {
        const prop = propertyFromRecord(propertyRecord as { id: string; property_data: unknown; row_data: unknown });
        if (prop) {
          // Inject property into the context via a mock getPropertyById by temporarily patching application
          const ctx = leaseContextFromApplication({ ...updatedApplication, propertyId });
          // Override the submission with server-side resolved property if context didn't find it
          const finalCtx = ctx.submission ? ctx : {
            ...ctx,
            leasedRoom: prop,
            listingProperty: prop,
            submission: prop.listingSubmission?.v === 1
              ? normalizeManagerListingSubmissionV1(prop.listingSubmission as ManagerListingSubmissionV1)
              : ctx.submission,
          };
          newHtml = buildAiGeneratedLeaseHtml(finalCtx);
        }
      }
    } catch {
      // HTML regeneration is best-effort; manager can regenerate manually
    }

    const updatedRow: Partial<LeasePipelineRow> = {
      ...leaseRow,
      application: updatedApplication,
      managerSignature: null,
      residentSignature: null,
      signatureName: null,
      signedAtIso: null,
      bucket: "manager",
      status: "Manager Review",
      currentActorRole: "manager",
      updatedAtIso: iso,
      updated: "just now",
      ...(newHtml ? { generatedHtml: newHtml, generatedAtIso: iso } : {}),
    };

    const { error: upsertError } = await db.from("portal_lease_pipeline_records").upsert({
      id: leaseRecord.id,
      manager_user_id: leaseRecord.manager_user_id,
      resident_user_id: leaseRow.residentUserId ?? null,
      resident_email: email,
      property_id: leaseRecord.property_id ?? null,
      status: "manager",
      row_data: updatedRow,
      updated_at: iso,
    });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    // Update room availability in the property record
    try {
      const propertyId = leaseRecord.property_id ?? leaseRow.propertyId ?? "";
      const roomChoice = leaseRow.roomChoice ?? leaseRow.application?.roomChoice1 ?? "";
      const sep = "::";
      const sepIdx = roomChoice.indexOf(sep);
      const roomId = sepIdx >= 0 ? roomChoice.slice(sepIdx + sep.length) : null;

      if (propertyId && roomId) {
        const { data: propRecord } = await db
          .from("manager_property_records")
          .select("id, property_data, row_data")
          .eq("id", propertyId)
          .maybeSingle();

        if (propRecord) {
          const pd = asObject(propRecord.property_data);
          if (pd?.listingSubmission) {
            const sub = pd.listingSubmission as ManagerListingSubmissionV1;
            if (sub.v === 1) {
              const norm = normalizeManagerListingSubmissionV1(sub);
              const updatedRooms = norm.rooms.map((r) =>
                r.id === roomId
                  ? { ...r, moveInAvailableDate: newLeaseEnd, availability: formatAvailabilityLabel(newLeaseEnd) }
                  : r,
              );
              const updatedSub = { ...norm, rooms: updatedRooms };
              const updatedPd = { ...pd, listingSubmission: updatedSub };
              await db.from("manager_property_records").update({ property_data: updatedPd, updated_at: iso }).eq("id", propertyId);
            }
          }
        }
      }
    } catch {
      // Availability update is best-effort
    }

    const direction = newLeaseEnd < currentEnd ? "decrease" : "extend";
    return NextResponse.json({ ok: true, newLeaseEnd, direction });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

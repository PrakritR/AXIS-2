import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import {
  fetchRowsForManagerWithLinked,
  linkedPropertyIdsForModule,
} from "@/lib/auth/co-manager-module-scope";
import { managerHasCoManagerPermissionForProperty } from "@/lib/auth/manager-lease-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { HouseholdCharge } from "@/lib/household-charges";
import { enrichHouseholdChargesFromPropertyRecords } from "@/lib/household-charge-payment-eligibility";
import {
  cancelFuturePaymentRemindersForCharge,
  restoreFuturePaymentRemindersForCharge,
} from "@/lib/payment-reminder-lifecycle.server";
import {
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  loadManagerAutomationSettings,
} from "@/lib/payment-automation-settings";
import { ensureChargeDueDateForReminders } from "@/lib/payment-reminder-bootstrap";
import { reconcileDuplicateHouseholdChargeRecords } from "@/lib/reports/ledger-sync";
import { syncLedgerChargeEntry } from "@/lib/reports/ledger-sync";

export const runtime = "nodejs";

function toUuid(id: unknown): string | null {
  if (!id || typeof id !== "string") return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  return null;
}

async function getUserContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const [profileResult, rolesResult] = await Promise.all([
    db.from("profiles").select("email, role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);
  const profile = profileResult.data;
  const admin = await isAdminUser(user.id);
  const roleRows = (rolesResult.data ?? []).map((r) => String(r.role).toLowerCase());
  const legacyRole = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const allRoles = roleRows.length > 0 ? roleRows : (legacyRole ? [legacyRole] : []);
  const isManagerOrOwner = allRoles.some((r) => r === "manager" || r === "owner");
  const resolvedRole = admin ? "admin" : isManagerOrOwner ? "manager" : "resident";
  return {
    db,
    user: {
      id: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      role: resolvedRole,
    },
  };
}

export async function GET() {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { db, user } = ctx;

    let chargeQuery = db
      .from("portal_household_charge_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    let profileQuery = db
      .from("portal_recurring_rent_profile_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (user.role === "admin") {
      // admin sees all
    } else if (user.role === "manager") {
      // Managers see charges they own; also include any where they appear as a resident (edge case)
      chargeQuery = chargeQuery.or(`manager_user_id.eq.${user.id},resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
      profileQuery = profileQuery.or(`manager_user_id.eq.${user.id},resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
    } else {
      // Resident — match by user_id or email
      chargeQuery = chargeQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
      profileQuery = profileQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
    }

    const [chargeResult, profileResult] = await Promise.all([chargeQuery, profileQuery]);
    if (chargeResult.error) return NextResponse.json({ error: chargeResult.error.message }, { status: 500 });
    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });

    type ChargeRecordRow = { id: string; row_data: unknown; updated_at: string | null };
    let chargeRows = (chargeResult.data ?? []) as ChargeRecordRow[];
    if (user.role === "manager") {
      // Co-managers with "payments" access on linked properties also see those charges.
      const linkedPropertyIds = await linkedPropertyIdsForModule(db, user.id, "payments");
      if (linkedPropertyIds.size > 0) {
        const linkedRows = await fetchRowsForManagerWithLinked<ChargeRecordRow>(
          db,
          "portal_household_charge_records",
          user.id,
          linkedPropertyIds,
          { propertyColumns: ["property_id"] },
        );
        const seen = new Set(chargeRows.map((row) => row.id));
        chargeRows = [...chargeRows, ...linkedRows.filter((row) => row.id && !seen.has(row.id))];
      }
    }

    const rawCharges = chargeRows.map((r) => r.row_data as HouseholdCharge);
    const charges = await enrichHouseholdChargesFromPropertyRecords(db, rawCharges);
    const rentProfiles = (profileResult.data ?? []).map((r) => r.row_data);
    return NextResponse.json({ charges, rentProfiles });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { db, user } = ctx;

    if (user.role === "resident") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as {
      action?: string;
      id?: string;
      charges?: Record<string, unknown>[];
      rentProfiles?: Record<string, unknown>[];
    };
    const now = new Date().toISOString();

    if (body.action === "deleteCharge") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (user.role !== "admin") {
        const { data: existing } = await db
          .from("portal_household_charge_records")
          .select("manager_user_id")
          .eq("id", id)
          .maybeSingle();
        if (existing && existing.manager_user_id !== user.id) {
          return NextResponse.json({ error: "Forbidden." }, { status: 403 });
        }
      }
      await db.from("portal_household_charge_records").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }

    const charges = Array.isArray(body.charges) ? body.charges : [];
    const rentProfiles = Array.isArray(body.rentProfiles) ? body.rentProfiles : [];

    if (charges.length > 0) {
      const reminderSettings = await loadManagerAutomationSettings(db, user.id).catch(
        () => DEFAULT_MANAGER_AUTOMATION_SETTINGS,
      );
      const normalizedCharges = charges.map((raw) => {
        if (!raw.id || raw.status === "paid") return raw;
        const charge = raw as HouseholdCharge;
        const prepared = ensureChargeDueDateForReminders(charge, reminderSettings);
        if (prepared.dueDateLabel === charge.dueDateLabel) return raw;
        return { ...raw, dueDateLabel: prepared.dueDateLabel };
      });

      const chargeIds = normalizedCharges.filter((c) => c.id).map((c) => String(c.id));
      const previousStatusById = new Map<string, string | null>();
      const existingOwnerById = new Map<string, string | null>();
      if (chargeIds.length > 0) {
        const { data: existingRows } = await db
          .from("portal_household_charge_records")
          .select("id, status, manager_user_id")
          .in("id", chargeIds);
        for (const row of existingRows ?? []) {
          previousStatusById.set(String(row.id), typeof row.status === "string" ? row.status : null);
          existingOwnerById.set(String(row.id), row.manager_user_id ? String(row.manager_user_id) : null);
        }
      }

      // Security: the client mirrors its FULL charge list (incl. an owner's rows a
      // co-manager can now SEE) on every write. Never reassign a row owned by
      // another manager to the caller, and require the payments EDIT level to
      // touch a foreign row — otherwise a co-manager's mirror would silently
      // steal/overwrite the owner's charges (adversarial-review CRITICAL).
      const editableForeignProperty = new Map<string, boolean>();
      const canEditForeign = async (propertyId: string | null): Promise<boolean> => {
        const pid = (propertyId ?? "").trim();
        if (!pid) return false;
        if (editableForeignProperty.has(pid)) return editableForeignProperty.get(pid)!;
        const ok = await managerHasCoManagerPermissionForProperty(db, user.id, pid, "payments", "edit");
        editableForeignProperty.set(pid, ok);
        return ok;
      };

      const mappedRows: Array<{
        id: string;
        manager_user_id: string | null;
        resident_user_id: string | null;
        resident_email: string | null;
        property_id: string | null;
        kind: string | null;
        status: string | null;
        row_data: Record<string, unknown>;
        updated_at: string;
      }> = [];
      for (const c of normalizedCharges) {
        if (!c.id) continue;
        const id = String(c.id);
        const propertyId = typeof c.propertyId === "string" ? c.propertyId : null;
        const existingOwner = existingOwnerById.get(id) ?? null;
        let managerUserId: string | null;
        if (user.role === "admin") {
          managerUserId = toUuid(c.managerUserId) ?? user.id;
        } else if (existingOwner && existingOwner !== user.id) {
          // Foreign row: only writable with payments EDIT on its property, and
          // the owner is always preserved (never flipped to the caller).
          if (!(await canEditForeign(propertyId))) continue;
          managerUserId = existingOwner;
        } else {
          managerUserId = user.id;
        }
        mappedRows.push({
          id,
          manager_user_id: managerUserId,
          resident_user_id: toUuid(c.residentUserId),
          resident_email: typeof c.residentEmail === "string" ? c.residentEmail.trim().toLowerCase() : null,
          property_id: propertyId,
          kind: typeof c.kind === "string" ? c.kind : null,
          status: typeof c.status === "string" ? c.status : null,
          row_data: c,
          updated_at: now,
        });
      }
      const rows = mappedRows;
      if (rows.length > 0) {
        const { error } = await db.from("portal_household_charge_records").upsert(rows, { onConflict: "id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await reconcileDuplicateHouseholdChargeRecords(
          db,
          user.role === "admin" ? undefined : user.id,
        ).catch(() => undefined);
        for (const c of normalizedCharges) {
          if (!c.id) continue;
          const chargeId = String(c.id);
          const nextStatus = typeof c.status === "string" ? c.status : null;
          if (!nextStatus) continue;
          const managerId = user.role === "admin" ? toUuid(c.managerUserId) ?? user.id : user.id;
          const prevStatus = previousStatusById.get(chargeId) ?? null;
          if (nextStatus === "paid" && prevStatus !== "paid") {
            await cancelFuturePaymentRemindersForCharge(db, managerId, chargeId).catch(() => undefined);
          } else if (nextStatus === "pending" && prevStatus === "paid") {
            await restoreFuturePaymentRemindersForCharge(db, managerId, chargeId).catch(() => undefined);
          }
          await syncLedgerChargeEntry(db, c as HouseholdCharge);
        }
      }
    }

    if (rentProfiles.length > 0) {
      const rows = rentProfiles
        .filter((p) => p.id)
        .map((p) => ({
          id: String(p.id),
          manager_user_id: user.role === "admin" ? toUuid(p.managerUserId) ?? user.id : user.id,
          resident_user_id: toUuid(p.residentUserId),
          resident_email: typeof p.residentEmail === "string" ? p.residentEmail.trim().toLowerCase() : null,
          property_id: typeof p.propertyId === "string" ? p.propertyId : null,
          active: p.active !== false,
          row_data: p,
          updated_at: now,
        }));
      if (rows.length > 0) {
        const { error } = await db.from("portal_recurring_rent_profile_records").upsert(rows, { onConflict: "id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

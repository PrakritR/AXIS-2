import { NextResponse } from "next/server";
import { resolveApplicationFeeItemization, resolveApplicationFeeProperty } from "@/lib/application-fee-checkout.server";
import { previewApplicationFeeWaiverCode } from "@/lib/application-fee-waiver";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  propertyId?: string;
  managerUserId?: string;
  /** Optional — when present, also reports whether the code currently looks redeemable. */
  waiverCode?: string;
  /** True once a waiver code has already been redeemed server-side — skips re-validating it, just zeroes the fee. */
  feeWaived?: boolean;
  /** "manual" (Zelle/Venmo/other) never carries a Stripe service fee; defaults to "card". */
  channel?: "card" | "manual";
};

/**
 * Read-only itemization the applicant sees BEFORE paying: application fee,
 * any service fee they are bearing (plan-based), and the total. Creates no
 * Stripe object. Optionally previews a waiver code without redeeming it.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`application-fee-preview:${clientIpFrom(req)}`, 60, 60_000).ok) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    const body = (await req.json()) as Body;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const managerUserId = typeof body.managerUserId === "string" ? body.managerUserId.trim() : "";
    if (!propertyId || !managerUserId) {
      return NextResponse.json({ error: "propertyId and managerUserId are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const resolved = await resolveApplicationFeeProperty(db, { propertyId, managerUserId });
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
    }

    const channel = body.channel === "manual" ? "manual" : "card";
    // The deposit rides along in the SAME charge only when the manager opted
    // into `holdingDepositTiming: "at_application"` for this listing — the
    // default ("after_approval") shows fee-only here, unchanged.
    const combined = resolved.value.holdingDepositTiming === "at_application" && resolved.value.holdingDepositCents > 0;
    const holdingDepositCents = combined ? resolved.value.holdingDepositCents : 0;

    const waiverCode = typeof body.waiverCode === "string" ? body.waiverCode.trim() : "";
    const waiver = waiverCode ? await previewApplicationFeeWaiverCode(db, managerUserId, waiverCode) : null;
    // A redeemed waiver code only ever waives the FEE (it is an "application fee
    // waiver code" by name and by table) — any holding deposit due at
    // application still stands, itemized on its own. `body.feeWaived` covers
    // the case where the code was already consumed earlier in this session, so
    // this call does not need to re-validate it against the (now incremented)
    // usage count.
    const feeWaivedForPreview = body.feeWaived === true || waiver?.ok === true;
    const itemization = await resolveApplicationFeeItemization(
      db,
      managerUserId,
      feeWaivedForPreview ? 0 : resolved.value.applicationFeeCents,
      channel,
      holdingDepositCents,
    );

    return NextResponse.json({
      applicationFeeCents: feeWaivedForPreview ? 0 : itemization.applicationFeeCents,
      applicationFeeWaivedByCode: feeWaivedForPreview,
      holdingDepositCents: itemization.holdingDepositCents,
      serviceFeeCents: itemization.serviceFeeCents,
      totalCents: itemization.totalCents,
      feePayer: itemization.feePayer,
      waiver: waiver ? { valid: waiver.ok, error: waiver.ok ? undefined : waiver.error } : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load application fee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

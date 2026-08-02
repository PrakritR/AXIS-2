import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { ACTIVE_PORTAL_COOKIE } from "@/lib/auth/portal-access";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { provisionResidentAccountByEmail } from "@/lib/auth/provision-resident-account";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  attachInboxThreadsToResident,
  linkAllTourInquiriesForEmail,
  linkTourInquiryToResident,
  loadTourInquiryById,
} from "@/lib/tour-resident-link.server";
import { normalizeE164 } from "@/lib/twilio";

export const runtime = "nodejs";

const GENERIC_FAILURE = "Could not create your account. Check your details and try again.";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  tourInquiryId?: string;
  handoff?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Opt-in resident account creation from a tour booking handoff.
 * Rate-limited and does not reveal whether an email already has an account.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`tour-resident-register:${clientIpFrom(req)}`, 10, 60_000).ok) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone = normalizeE164(typeof body.phone === "string" ? body.phone : "");
    const tourInquiryId = typeof body.tourInquiryId === "string" ? body.tourInquiryId.trim() : "";
    const handoff = typeof body.handoff === "string" ? body.handoff.trim() : "";

    if (!email.includes("@") || password.length < 8) {
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
    }
    if (!tourInquiryId && handoff !== "message") {
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
    }
    if (tourInquiryId && !phone) {
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    if (tourInquiryId) {
      const inquiry = await loadTourInquiryById(supabase, tourInquiryId);
      if (!inquiry) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
      }
      const inquiryEmail =
        typeof inquiry.email === "string" ? inquiry.email.trim().toLowerCase() : "";
      if (!inquiryEmail || inquiryEmail !== email) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
      }
    }

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "resident", full_name: fullName || undefined },
    });

    let userId: string;

    if (createErr) {
      const exists =
        createErr.message.toLowerCase().includes("already") ||
        createErr.message.toLowerCase().includes("registered");
      if (!exists) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
      }
      const existingId = await findAuthUserIdByEmail(supabase, email);
      if (!existingId) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
      }
      const pwCheck = await assertPasswordMatchesExistingAuthUser(email, password);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
      }
      userId = existingId;
    } else {
      if (!created?.user?.id) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
      }
      userId = created.user.id;
    }

    const provisioned = await provisionResidentAccountByEmail(supabase, {
      userId,
      email,
      fullName,
      phone,
      inheritFromApplication: false,
    });
    if (!provisioned.ok) {
      return NextResponse.json({ error: GENERIC_FAILURE }, { status: provisioned.status });
    }

    await ensureProfileRoleRow(supabase, userId, "resident");

    if (tourInquiryId) {
      const linkResult = await linkTourInquiryToResident(supabase, {
        userId,
        inquiryId: tourInquiryId,
        email,
      });
      if (!linkResult.ok) {
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: linkResult.status });
      }
      await linkAllTourInquiriesForEmail(supabase, { userId, email });
    } else {
      await attachInboxThreadsToResident(supabase, userId, email);
    }

    track("resident_account_created", userId, {
      source: tourInquiryId ? "tour_booking" : "property_message",
      ...(tourInquiryId ? { inquiry_id: tourInquiryId } : {}),
    });

    const redirectTo = handoff === "message" ? "/resident/communication" : "/resident/tour/pending";
    const res = NextResponse.json({
      ok: true,
      redirectTo,
    });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(ACTIVE_PORTAL_COOKIE, "resident", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure,
    });
    return res;
  } catch {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import {
  completeProspectHandoffForUser,
  prospectHandoffSuccessResponse,
} from "@/lib/auth/complete-prospect-handoff.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  tourInquiryId?: string;
  handoff?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  nextPath?: string;
};

/** Link tour/message prospect activity after password or OAuth sign-in lands in the portal. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const tourInquiryId = typeof body.tourInquiryId === "string" ? body.tourInquiryId.trim() : "";
    const handoff = typeof body.handoff === "string" ? body.handoff.trim() : "";
    if (!tourInquiryId && handoff !== "message") {
      return NextResponse.json({ error: "Missing prospect handoff." }, { status: 400 });
    }

    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const authEmail = user.email?.trim().toLowerCase() ?? "";
    const prospectEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const contactEmail =
      handoff === "message"
        ? authEmail
        : prospectEmail.includes("@")
          ? prospectEmail
          : authEmail;
    if (!contactEmail.includes("@")) {
      return NextResponse.json({ error: "Profile email is required." }, { status: 400 });
    }

    const service = createSupabaseServiceRoleClient();
    const handoffResult = await completeProspectHandoffForUser(service, {
      userId: user.id,
      email: contactEmail,
      authEmail,
      fullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined,
      phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
      tourInquiryId: tourInquiryId || undefined,
      handoff: handoff === "message" ? "message" : undefined,
      nextPath: typeof body.nextPath === "string" ? body.nextPath.trim() : undefined,
    });
    if (!handoffResult.ok) {
      return NextResponse.json({ error: handoffResult.error }, { status: handoffResult.status });
    }

    return prospectHandoffSuccessResponse(handoffResult.redirectTo);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not link your prospect activity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

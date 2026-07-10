import { NextResponse } from "next/server";
import {
  consumeResidentSetupTokenOnApplication,
  findApplicationForResidentSetup,
} from "@/lib/auth/resident-setup-token";
import { provisionResidentAccountByEmail } from "@/lib/auth/provision-resident-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { axisId?: string; token?: string };

/**
 * Complete resident OAuth signup — requires the emailed setup token + axis id.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const axisId = typeof body.axisId === "string" ? body.axisId.trim() : "";

    if (!token || !axisId) {
      return NextResponse.json(
        {
          error:
            "Resident accounts are created from the setup link in your application email. Apply first, then check your inbox.",
        },
        { status: 403 },
      );
    }

    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const lookup = await findApplicationForResidentSetup(service, { token, axisId });
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const oauthEmail = user.email.trim().toLowerCase();
    if (oauthEmail !== lookup.email) {
      return NextResponse.json(
        { error: "Sign in with the same Google account email you used on your application." },
        { status: 403 },
      );
    }

    const fullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : lookup.name;

    const result = await provisionResidentAccountByEmail(service, {
      userId: user.id,
      email: oauthEmail,
      fullName,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await service.from("profiles").update({ manager_id: lookup.axisId }).eq("id", user.id);
    await consumeResidentSetupTokenOnApplication(service, lookup.row);

    return NextResponse.json({
      ok: true,
      axisId: lookup.axisId,
      linkedApplication: true,
      redirectTo: "/resident/applications",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

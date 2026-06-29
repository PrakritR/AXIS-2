import { NextResponse } from "next/server";
import { resolveShareableAppOrigin } from "@/lib/app-url";
import { supabaseGoogleOAuthRedirectUri } from "@/lib/auth/google-oauth-redirect";
import {
  httpsOAuthCallbackUrls,
  nativeOAuthSetupHint,
  nativeSupabaseRedirectUrls,
} from "@/lib/auth/native-oauth-redirect-urls";

export const runtime = "nodejs";

type ProviderSettings = {
  external?: {
    google?: boolean;
  };
};

/**
 * Best-effort check whether Google OAuth is enabled in the linked Supabase project.
 * Supabase exposes this on the public auth settings endpoint.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? null;
  if (!supabaseUrl) {
    return NextResponse.json({
      googleEnabled: null,
      supabaseUrl: null,
      googleRedirectUri: null,
      appCallbackUrl: null,
      hint: "Set NEXT_PUBLIC_SUPABASE_URL in your environment.",
      googleRedirectHint: null,
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({
        googleEnabled: null,
        supabaseUrl,
        hint: "Could not read Supabase auth settings.",
      });
    }
    const settings = (await res.json()) as ProviderSettings;
    const googleEnabled = settings.external?.google === true;
    const appOrigin = resolveShareableAppOrigin();
    const googleRedirectUri = supabaseGoogleOAuthRedirectUri(supabaseUrl);
    const httpsCallbacks = httpsOAuthCallbackUrls(appOrigin);
    const nativeCallbacks = nativeSupabaseRedirectUrls();
    return NextResponse.json({
      googleEnabled,
      supabaseUrl,
      googleRedirectUri,
      appCallbackUrl: httpsCallbacks[0],
      httpsCallbackUrls: httpsCallbacks,
      nativeCallbackUrls: nativeCallbacks,
      hint: googleEnabled
        ? null
        : `After enabling Google, allowlist ${httpsCallbacks[0]} in Supabase URL configuration.`,
      nativeRedirectHint: nativeOAuthSetupHint(),
      googleRedirectHint: googleRedirectUri
        ? `If Google shows redirect_uri_mismatch, add this exact URI in Google Cloud → Credentials → OAuth client → Authorized redirect URIs: ${googleRedirectUri}`
        : null,
    });
  } catch {
    return NextResponse.json({
      googleEnabled: null,
      supabaseUrl,
      hint: "Could not reach Supabase auth settings.",
    });
  }
}

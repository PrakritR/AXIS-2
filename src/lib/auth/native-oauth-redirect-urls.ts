import { NATIVE_OAUTH_CALLBACK_URL, nativeOAuthCallbackUrl } from "@/lib/auth/native-oauth-callback";
import { partnerPricingOAuthCallbackUrl, residentSignupOAuthCallbackUrl } from "@/lib/auth/oauth-redirect";
import { resolveShareableAppOrigin } from "@/lib/app-url";

/** Custom-scheme callbacks Supabase Auth must allowlist for the native shell. */
export function nativeSupabaseRedirectUrls(): string[] {
  return [
    NATIVE_OAUTH_CALLBACK_URL,
    nativeOAuthCallbackUrl("/auth/callback/partner-pricing"),
    nativeOAuthCallbackUrl("/auth/callback/resident-signup"),
    // Wildcard covers any future fixed callback paths under auth/callback/*
    "com.axisseattlehousing.app://auth/callback/**",
  ];
}

/** HTTPS callbacks used when universal/app links return OAuth to the main WebView. */
export function httpsOAuthCallbackUrls(origin?: string): string[] {
  const base = (origin ?? resolveShareableAppOrigin()).trim().replace(/\/$/, "");
  return [
    `${base}/auth/callback`,
    partnerPricingOAuthCallbackUrl(base),
    residentSignupOAuthCallbackUrl(base),
  ];
}

export function nativeOAuthSetupHint(): string {
  const native = nativeSupabaseRedirectUrls()[0];
  const https = httpsOAuthCallbackUrls()[0];
  return (
    `In Supabase → Authentication → URL configuration → Redirect URLs, add: ${native} ` +
    `(or com.axisseattlehousing.app://auth/callback/**) and ${https}. ` +
    `Without these, Google sign-in returns to the marketing homepage instead of the portal.`
  );
}

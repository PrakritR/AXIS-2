/** iOS bundle ID — must match capacitor.config.ts appId and Xcode PRODUCT_BUNDLE_IDENTIFIER. */
export const IOS_BUNDLE_ID = "com.axisseattlehousing.app";

export function supabaseAppleOAuthRedirectUri(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return `${url}/auth/v1/callback`;
}

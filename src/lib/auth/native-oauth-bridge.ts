import { NATIVE_OAUTH_SCHEME } from "@/lib/auth/native-oauth-callback";
import { NextResponse, type NextRequest } from "next/server";

/** Query flag on HTTPS OAuth callbacks opened in the system browser during native sign-in. */
export const NATIVE_OAUTH_BRIDGE_PARAM = "native_bridge";

export function appendNativeOAuthBridgeParam(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(NATIVE_OAUTH_BRIDGE_PARAM, "1");
  return parsed.toString();
}

/** Same OAuth callback URL without the bridge flag — completes sign-in in a normal browser. */
export function httpsCallbackWithoutBridgeParam(callbackUrl: URL): string {
  const parsed = new URL(callbackUrl.toString());
  parsed.searchParams.delete(NATIVE_OAUTH_BRIDGE_PARAM);
  return parsed.toString();
}

/** Map an https /auth/callback URL to the app custom scheme (Capacitor deep link). */
export function httpsCallbackToNativeSchemeUrl(callbackUrl: URL): string {
  const params = new URLSearchParams(callbackUrl.searchParams);
  params.delete(NATIVE_OAUTH_BRIDGE_PARAM);
  const query = params.toString();
  const pathParts = callbackUrl.pathname.replace(/^\//, "").split("/").filter(Boolean);
  const host = pathParts[0] ?? "auth";
  const rest = pathParts.slice(1).join("/");
  const schemePath = rest ? `/${rest}` : "";
  return `${NATIVE_OAUTH_SCHEME}://${host}${schemePath}${query ? `?${query}` : ""}${callbackUrl.hash}`;
}

export function shouldRenderNativeOAuthBridge(request: NextRequest): boolean {
  const userAgent = request.headers.get("user-agent") ?? "";
  // In-app WebView must exchange the code on /auth/callback — never bounce to custom scheme.
  if (/Capacitor/i.test(userAgent)) return false;
  if (request.nextUrl.searchParams.get(NATIVE_OAUTH_BRIDGE_PARAM) !== "1") return false;
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  return Boolean(code || error);
}

export function nativeOAuthBridgeResponse(callbackUrl: URL): NextResponse {
  const schemeUrl = httpsCallbackToNativeSchemeUrl(callbackUrl);
  // Server redirect for Android Custom Tabs — SFSafariViewController cannot follow
  // custom-scheme navigations. iOS OAuth uses ASWebAuthenticationSession instead.
  return NextResponse.redirect(schemeUrl, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function maybeNativeOAuthBridgeResponse(request: NextRequest): NextResponse | null {
  if (!shouldRenderNativeOAuthBridge(request)) return null;
  return nativeOAuthBridgeResponse(request.nextUrl);
}

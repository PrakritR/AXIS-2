import {
  isNativeApplePluginAvailable,
  NATIVE_APPLE_REBUILD_MESSAGE,
  runNativeAppleSignIn,
  canUseNativeAppleSignIn,
} from "@/lib/auth/native-apple-sign-in";
import { startOAuthSignIn, type StartOAuthSignInParams, type StartOAuthSignInResult } from "@/lib/auth/start-oauth-sign-in";

/** Native iOS uses identityToken + signInWithIdToken; web uses Supabase OAuth redirect. */
export async function startAppleSignIn(params: StartOAuthSignInParams): Promise<StartOAuthSignInResult> {
  params.onBeforeRedirect?.();

  if (canUseNativeAppleSignIn()) {
    if (!isNativeApplePluginAvailable()) {
      return { ok: false, message: NATIVE_APPLE_REBUILD_MESSAGE };
    }
    const result = await runNativeAppleSignIn(params.supabase, {
      nextPath: params.nextPath,
      viaContinue: params.viaContinue,
      fixedCallbackPath: params.fixedCallbackPath,
      intent: params.intent,
    });
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true };
  }

  return startOAuthSignIn({ ...params, provider: "apple" });
}

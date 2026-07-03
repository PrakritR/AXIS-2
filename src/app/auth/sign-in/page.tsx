import { NativeAuthHub } from "@/components/auth/native-auth-hub";

/**
 * The single universal auth surface for every account type (web + native): one page with
 * the Manager/Resident choice and the Sign in / Create account toggle, Google + email in
 * one place — the same unified hub the native app uses. Defaults to Sign in.
 */
export default function SignInPage() {
  return <NativeAuthHub defaultMode="sign-in" />;
}

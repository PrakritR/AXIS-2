import { NativeAuthHub } from "@/components/auth/native-auth-hub";

/**
 * Universal sign-in surface (web + native): role toggle, OAuth, and email/password —
 * same NativeAuthHub shell as create-account.
 */
export default function SignInPage() {
  return <NativeAuthHub defaultMode="sign-in" />;
}

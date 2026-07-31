import { NativeAuthHub } from "@/components/auth/native-auth-hub";

/**
 * Universal sign-in surface (web + native): OAuth and email/password.
 * Account creation is role-agnostic at /auth/create-account, then /auth/get-started.
 */
export default function SignInPage() {
  return <NativeAuthHub defaultMode="sign-in" />;
}

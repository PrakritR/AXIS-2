import { NativeAuthHub } from "@/components/auth/native-auth-hub";

/**
 * Universal sign-in surface (web + native): Google + email/password, with create-account
 * and back-to-home links in the footer — no mode toggle on this page.
 */
export default function SignInPage() {
  return <NativeAuthHub defaultMode="sign-in" />;
}

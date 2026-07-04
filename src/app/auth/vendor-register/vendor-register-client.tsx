"use client";

import posthog from "posthog-js";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FIELD_LABEL_CLASS } from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Vendor account creation from a manager's invite link — email comes pre-filled and locked. */
export default function VendorRegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = useMemo(() => (searchParams.get("email") ?? "").trim().toLowerCase(), [searchParams]);
  const invitedName = useMemo(() => (searchParams.get("name") ?? "").trim(), [searchParams]);

  const [email, setEmail] = useState(invitedEmail);
  const [fullName, setFullName] = useState(invitedName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim().includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/vendor-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() || undefined }),
      });
      const body = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not create vendor account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        router.push("/auth/sign-in");
        return;
      }
      if (signInData?.user) posthog.identify(signInData.user.id);
      router.push(body.redirectTo?.startsWith("/") ? body.redirectTo : "/vendor/dashboard");
    } catch {
      setError("Could not create vendor account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <AuthCard>
        <h1 className="text-xl font-semibold text-foreground">Become an Axis vendor</h1>
        <p className="mt-1 text-sm text-muted">Create your account to see work orders offered to you.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-email">
              Email
            </label>
            <Input
              id="vendor-email"
              type="email"
              className="mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={Boolean(invitedEmail)}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-name">
              Full name
            </label>
            <Input
              id="vendor-name"
              type="text"
              className="mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-password">
              Password
            </label>
            <PasswordInput
              id="vendor-password"
              className="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button
            type="button"
            className="w-full rounded-full py-3 text-base font-semibold"
            onClick={submit}
            disabled={busy}
            data-attr="vendor-signup-submit"
            event="vendor_signup_submitted"
          >
            {busy ? "Creating account…" : "Create vendor account"}
          </Button>
        </div>
      </AuthCard>
    </main>
  );
}

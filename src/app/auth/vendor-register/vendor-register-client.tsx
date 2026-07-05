"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { HideOnNative } from "@/components/native/hide-on-native";
import { VendorSignupForm } from "@/components/auth/vendor-signup-form";
import Link from "next/link";

/** Vendor account creation — from a manager's invite link (?token=…) or public self-serve signup. */
export default function VendorRegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [checkingInvite, setCheckingInvite] = useState(Boolean(inviteToken));
  const [inviteInvalid, setInviteInvalid] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/vendor-register?token=${encodeURIComponent(inviteToken)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as { email?: string; name?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setInviteInvalid(true);
          return;
        }
        setInviteEmail(body.email ?? "");
        setInviteFullName(body.name ?? "");
      } catch {
        if (!cancelled) setInviteInvalid(true);
      } finally {
        if (!cancelled) setCheckingInvite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  if (checkingInvite) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading your invite…</p>
        </AuthCard>
      </main>
    );
  }

  if (inviteInvalid) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AuthCard>
          <h1 className="text-xl font-semibold text-foreground">Invite link invalid</h1>
          <p className="mt-2 text-sm text-muted">
            This vendor invite link is invalid or has expired. Ask your property manager to resend it, or
            sign up without an invite below.
          </p>
          <Button
            type="button"
            className="mt-6 w-full rounded-full py-2.5 text-[15px] font-semibold"
            onClick={() => router.push("/auth/vendor-register")}
          >
            Sign up as a vendor
          </Button>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <AuthCard>
        <h1 className="text-xl font-semibold text-foreground">Become an Axis vendor</h1>
        <p className="mt-1 text-sm text-muted">Create your account to see work orders offered to you.</p>

        <div className="mt-6">
          <VendorSignupForm inviteToken={inviteToken || undefined} initialEmail={inviteEmail} initialFullName={inviteFullName} />
        </div>

        <HideOnNative>
          <p className="mt-5 text-center text-[12px] text-muted">
            <Link
              className="font-semibold text-muted transition hover:text-foreground"
              href="/"
              data-attr="auth-back-to-home"
            >
              ← Back to home
            </Link>
          </p>
        </HideOnNative>
      </AuthCard>
    </main>
  );
}

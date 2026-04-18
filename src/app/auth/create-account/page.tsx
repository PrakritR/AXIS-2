"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { parseAuthRole, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isValidAdminRegisterKey } from "@/lib/auth/resolve-portal-role";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function Req() {
  return <span className="text-danger"> *</span>;
}

function CreateAccountContent() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleFromUrl = useMemo(() => parseAuthRole(searchParams.get("role")), [searchParams]);
  const [role, setRole] = useState<AuthRole>(roleFromUrl);
  const [ownerInviteRef, setOwnerInviteRef] = useState(searchParams.get("slot") ?? "");
  const [adminKey, setAdminKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  useEffect(() => {
    setOwnerInviteRef(searchParams.get("slot") ?? "");
  }, [searchParams]);

  const submit = async () => {
    if (role === "manager") {
      showToast("Managers complete Stripe checkout first, then set a password on the next screen.");
      router.push("/partner/pricing");
      return;
    }

    if (!email.trim() || password.length < 8) {
      showToast("Enter a valid email and password (8+ characters).");
      return;
    }

    if (role === "admin") {
      if (!isValidAdminRegisterKey(adminKey)) {
        showToast("Invalid admin registration key.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/auth/register-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            adminKey,
            fullName: fullName.trim() || undefined,
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not create admin.");
          return;
        }
        showToast("Admin created. Sign in with your email.");
        router.push("/auth/sign-in");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (role === "resident" && !applicationId.trim()) {
      showToast("Application ID is required.");
      return;
    }

    if (role === "owner" && !ownerInviteRef.trim()) {
      showToast("Invite reference is required to create an owner account.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            application_id: applicationId.trim(),
            invite_ref: ownerInviteRef.trim(),
          },
        },
      });
      if (error) {
        showToast(error.message);
        return;
      }
      const uid = data.user?.id;
      if (!uid) {
        showToast("Check your email to confirm your account, then sign in.");
        router.push("/auth/sign-in");
        return;
      }

      const { error: insErr } = await supabase.from("profiles").insert({
        id: uid,
        email: email.trim().toLowerCase(),
        role,
        full_name: fullName.trim() || null,
        application_approved: role === "owner",
      });
      if (insErr) {
        showToast(insErr.message);
        return;
      }

      showToast("Account created. You can sign in once email confirmation completes (if enabled).");
      router.push("/auth/sign-in");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign up failed";
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Create account</h1>

      <div className="mt-7">
        <label className="text-xs font-semibold text-[#334155]" htmlFor="account-type">
          Portal type
        </label>
        <Select
          id="account-type"
          className="mt-1.5"
          value={role}
          onChange={(e) => setRole(parseAuthRole(e.target.value))}
        >
          <option value="resident">Resident</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
        </Select>
      </div>

      <div className="mt-6 rounded-2xl border border-[#e0e4ec] bg-[#f8fafc] p-4 text-sm leading-relaxed text-slate-600">
        {role === "resident" ? (
          <>
            Use your application email and Application ID. After signup, an Axis manager can mark your application
            approved so the full resident portal unlocks.
          </>
        ) : role === "manager" ? (
          <>
            Managers must pay on{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/partner/pricing">
              Partner pricing
            </Link>{" "}
            (Stripe). After payment succeeds you will set your password on the next step.
          </>
        ) : role === "owner" ? (
          <>
            Owner signup is invite-only. Use the invite reference from your manager link together with the email they
            expect for your properties.
          </>
        ) : (
          <>Admin accounts require a registration key from your organization.</>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {role === "admin" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="admin-key">
              Admin registration key
              <Req />
            </label>
            <PasswordInput
              id="admin-key"
              className="mt-1.5"
              autoComplete="off"
              placeholder="Key from your organization"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
            />
          </div>
        ) : null}
        {role === "resident" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="app">
              Application ID
              <Req />
            </label>
            <Input
              id="app"
              className="mt-1.5"
              placeholder="APP-recXXXXXXXXXXXXXXXXX"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            />
          </div>
        ) : null}
        {role === "manager" || role === "owner" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="name">
              Full name
            </label>
            <Input
              id="name"
              className="mt-1.5"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        ) : null}
        {role === "owner" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="invite">
              Invite reference
              <Req />
            </label>
            <Input
              id="invite"
              className="mt-1.5"
              placeholder="From your manager link, e.g. slot id"
              value={ownerInviteRef}
              onChange={(e) => setOwnerInviteRef(e.target.value)}
            />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
            Email
            <Req />
          </label>
          <Input
            id="email"
            className="mt-1.5"
            placeholder="Your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Create password
            <Req />
          </label>
          <PasswordInput
            id="pw"
            className="mt-1.5"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? "Working…" : "Create account"}
      </Button>

      <div className="mt-6 flex justify-center">
        <Link className="text-sm font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
          ← Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}

function CreateAccountFallback() {
  return (
    <AuthCard>
      <p className="text-center text-sm text-slate-600">Loading…</p>
    </AuthCard>
  );
}

export default function CreateAccountPage() {
  return (
    <Suspense fallback={<CreateAccountFallback />}>
      <CreateAccountContent />
    </Suspense>
  );
}

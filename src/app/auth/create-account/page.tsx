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

type ManagerCheckoutPreview = {
  managerId: string;
  email: string;
  fullName: string | null;
};

function CreateAccountContent() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = useMemo(() => searchParams.get("session_id")?.trim() ?? "", [searchParams]);
  const roleFromUrl = useMemo(() => parseAuthRole(searchParams.get("role")), [searchParams]);
  const [role, setRole] = useState<AuthRole>(roleFromUrl);
  const [ownerInviteRef, setOwnerInviteRef] = useState(searchParams.get("slot") ?? "");
  const [adminKey, setAdminKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutPreview, setCheckoutPreview] = useState<ManagerCheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [managerIdInput, setManagerIdInput] = useState("");

  useEffect(() => {
    setRole(sessionIdFromUrl ? "manager" : roleFromUrl);
  }, [roleFromUrl, sessionIdFromUrl]);

  useEffect(() => {
    setOwnerInviteRef(searchParams.get("slot") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (role !== "manager" || !sessionIdFromUrl) {
      setCheckoutPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setConfirmPassword("");
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setCheckoutPreview(null);

    void fetch(`/api/auth/manager-checkout-preview?session_id=${encodeURIComponent(sessionIdFromUrl)}`)
      .then(async (res) => {
        const body = (await res.json()) as ManagerCheckoutPreview & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? "Could not load checkout session.");
        }
        if (!cancelled) {
          setCheckoutPreview({
            managerId: body.managerId,
            email: body.email,
            fullName: body.fullName ?? null,
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPreviewError(e instanceof Error ? e.message : "Could not load checkout session.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [role, sessionIdFromUrl]);

  const managerPostCheckout = role === "manager" && !!sessionIdFromUrl && !!checkoutPreview;
  const managerNeedsPricing = role === "manager" && !sessionIdFromUrl;
  const isAxisIntentSignup = sessionIdFromUrl.startsWith("axis_intent_");

  const submit = async () => {
    if (managerPostCheckout && checkoutPreview) {
      if (password.length < 8) {
        showToast("Enter a valid password (8+ characters).");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/auth/manager-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdFromUrl, password }),
        });
        const body = (await res.json()) as { error?: string; managerId?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not create account.");
          return;
        }
        showToast(`Account ready. Manager ID ${body.managerId ?? checkoutPreview.managerId}. Sign in with your email.`);
        router.push("/auth/sign-in");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sign up failed";
        showToast(msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (role === "manager" && sessionIdFromUrl && !checkoutPreview) {
      showToast(previewLoading ? "Still loading checkout details…" : "Fix checkout session or start from Partner pricing.");
      return;
    }

    // Manager activating via Manager ID (no session)
    if (role === "manager" && !sessionIdFromUrl) {
      if (!managerIdInput.trim() || !email.trim()) {
        showToast("Enter your Manager ID and email.");
        return;
      }
      if (password.length < 8) {
        showToast("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/auth/manager-activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerId: managerIdInput.trim(), email: email.trim(), password }),
        });
        const body = (await res.json()) as { error?: string; managerId?: string };
        if (!res.ok) { showToast(body.error ?? "Could not activate account."); return; }
        showToast(`Account activated. Manager ID: ${body.managerId ?? managerIdInput}. Sign in with your email.`);
        router.push("/auth/sign-in");
      } catch { showToast("Network error."); }
      finally { setBusy(false); }
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

      const { error: roleErr } = await supabase.from("profile_roles").upsert(
        { user_id: uid, role },
        { onConflict: "user_id,role" },
      );
      if (roleErr) {
        showToast(roleErr.message);
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

  const readOnlyInputClass = "mt-1.5 bg-[#f1f5f9] text-slate-800 cursor-default";

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
          disabled={!!sessionIdFromUrl}
          onChange={(e) => setRole(parseAuthRole(e.target.value))}
        >
          <option value="resident">Resident</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
        </Select>
      </div>

      <div className="mt-6 rounded-2xl border border-[#e0e4ec] bg-[#f8fafc] p-4 text-sm leading-relaxed text-slate-600">
        {managerPostCheckout ? (
          <>
            {isAxisIntentSignup ? (
              <>
                Your <span className="font-semibold text-slate-800">Manager ID</span> is reserved for this signup—use it
                like an Application ID when you need support. Set a password below to finish your manager account.
              </>
            ) : (
              <>
                Payment confirmed. Your <span className="font-semibold text-slate-800">Manager ID</span> is tied to this
                checkout—use it like an Application ID when you need support. Set a password below to finish your manager
                account.
              </>
            )}
          </>
        ) : role === "resident" ? (
          <>
            Use your application email and Application ID. After signup, an Axis manager can mark your application
            approved so the full resident portal unlocks.
          </>
        ) : role === "manager" ? (
          <>
            Start from{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/partner/pricing">
              Partner pricing
            </Link>
            : choose <span className="font-semibold text-slate-800">Free</span> (no payment) or a paid plan (checkout). You
            will return here with your Manager ID to set your password.
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

      {role === "manager" && sessionIdFromUrl && previewLoading ? (
        <p className="mt-6 text-center text-sm text-slate-600">Loading checkout details…</p>
      ) : null}

      {role === "manager" && sessionIdFromUrl && previewError ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>{previewError}</p>
          <Link className="mt-3 inline-block font-semibold text-primary hover:underline" href="/partner/pricing">
            Back to Partner pricing
          </Link>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {managerPostCheckout && checkoutPreview ? (
          <>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="manager-id">
                Manager ID
              </label>
              <Input
                id="manager-id"
                readOnly
                className={`font-mono text-[13px] ${readOnlyInputClass}`}
                value={checkoutPreview.managerId}
                tabIndex={-1}
              />
            </div>
            {checkoutPreview.fullName ? (
              <div>
                <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-name">
                  Full name
                </label>
                <Input id="mgr-name" readOnly className={readOnlyInputClass} value={checkoutPreview.fullName} tabIndex={-1} />
              </div>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-email">
                Email
                <Req />
              </label>
              <Input
                id="mgr-email"
                readOnly
                className={readOnlyInputClass}
                type="email"
                value={checkoutPreview.email}
                tabIndex={-1}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-pw">
                Create password
                <Req />
              </label>
              <PasswordInput
                id="mgr-pw"
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-pw2">
                Confirm password
                <Req />
              </label>
              <PasswordInput
                id="mgr-pw2"
                className="mt-1.5"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </>
        ) : managerNeedsPricing ? (
          <>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-id-input">
                Manager ID
              </label>
              <Input
                id="mgr-id-input"
                className="mt-1.5 font-mono"
                placeholder="MGR-XXXXXXXX"
                value={managerIdInput}
                onChange={(e) => setManagerIdInput(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                From your account setup email or the Manager ID page after checkout.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-email-input">
                Email <Req />
              </label>
              <Input
                id="mgr-email-input"
                className="mt-1.5"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-pw-activate">
                Create password <Req />
              </label>
              <PasswordInput
                id="mgr-pw-activate"
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="mgr-pw2-activate">
                Confirm password <Req />
              </label>
              <PasswordInput
                id="mgr-pw2-activate"
                className="mt-1.5"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {false ? (
        <Button type="button" className="mt-8 w-full rounded-full py-3 text-base font-semibold" onClick={() => router.push("/partner/pricing")}>
          Continue to Partner pricing
        </Button>
      ) : (
        <Button
          type="button"
          className="mt-8 w-full rounded-full py-3 text-base font-semibold"
          onClick={() => void submit()}
          disabled={
            busy ||
            (role === "manager" && !!sessionIdFromUrl && (previewLoading || !!previewError || !checkoutPreview))
          }
        >
          {busy ? "Working…" : "Create account"}
        </Button>
      )}

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

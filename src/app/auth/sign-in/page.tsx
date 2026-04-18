"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { resolvePortalRoleFromEmail } from "@/lib/auth/resolve-portal-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function portalLabel(role: ReturnType<typeof resolvePortalRoleFromEmail>) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  if (role === "owner") return "Owner portal";
  return "Admin portal";
}

export default function SignInPage() {
  const { showToast, openModal } = useAppUi();
  const router = useRouter();
  const [email, setEmail] = useState("");

  const handleSignIn = () => {
    if (!email.trim()) {
      showToast("Enter your email to continue.");
      return;
    }
    const role = resolvePortalRoleFromEmail(email);
    showToast(`Signed in to ${portalLabel(role)} (demo).`);
    router.push(portalDashboardPath(role));
  };

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Portal sign-in</h1>
      <p className="mx-auto mt-3 max-w-sm text-center text-xs leading-relaxed text-slate-500">
        One sign-in for every portal. In this demo, your{" "}
        <span className="font-semibold text-slate-600">email address</span> decides where you land: use the local part{" "}
        <span className="font-mono text-[11px] text-slate-700">admin</span>,{" "}
        <span className="font-mono text-[11px] text-slate-700">manager</span>,{" "}
        <span className="font-mono text-[11px] text-slate-700">owner</span>, or{" "}
        <span className="font-mono text-[11px] text-slate-700">resident</span>, or add a tag like{" "}
        <span className="font-mono text-[11px] text-slate-700">you+manager@…</span> before the @.
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            className="mt-1.5"
            placeholder="you@example.com or you+manager@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Password
          </label>
          <Input id="pw" className="mt-1.5" type="password" placeholder="••••••••" autoComplete="current-password" />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
        <button
          type="button"
          className="shrink-0 font-semibold text-primary hover:opacity-90"
          onClick={() => openModal({ title: "Message Axis", body: "Messaging is not wired yet." })}
        >
          Message Axis
        </button>
      </div>

      <Button type="button" className="mt-6 w-full rounded-full py-3 text-base font-semibold" onClick={handleSignIn}>
        Sign in
      </Button>

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/create-account">
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}

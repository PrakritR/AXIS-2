"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalSwitcher, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useMemo, useState } from "react";

function titleFor(role: AuthRole) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  return "Admin portal";
}

function Req() {
  return <span className="text-danger"> *</span>;
}

export default function CreateAccountPage() {
  const { showToast } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");
  const title = useMemo(() => titleFor(role), [role]);

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">{title}</h1>

      <div className="mt-7">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <Link className="mt-5 inline-flex text-sm font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
        ← Back to sign in
      </Link>

      <div className="mt-6 rounded-2xl border border-[#e0e4ec] bg-[#f8fafc] p-4 text-sm leading-relaxed text-slate-600">
        {role === "resident" ? (
          <>
            Use the email and Application ID from your application. You can create your account before paying—if an
            application fee applies, complete it from the payment prompt after you apply or anytime under{" "}
            <span className="font-semibold text-[#0f172a]">Payments</span> in the portal.
          </>
        ) : role === "manager" ? (
          <>
            Create your manager portal account after choosing a plan on{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/partner/pricing">
              Pricing
            </Link>
            . Manager ID is optional if you are starting fresh.
          </>
        ) : (
          <>
            Admin accounts are invite-only in production. This scaffold lets you click through the admin UI without
            real permissions.
          </>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {role === "resident" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="app">
              Application ID
              <Req />
            </label>
            <Input id="app" className="mt-1.5" placeholder="APP-recXXXXXXXXXXXXXXXXX" />
          </div>
        ) : null}
        {role === "manager" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="mid">
              Manager ID (optional)
            </label>
            <Input id="mid" className="mt-1.5" placeholder="MGR-XXXXXXXXXXXXXXXX — leave blank to start fresh" />
          </div>
        ) : null}
        {role === "manager" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="name">
              Full name
            </label>
            <Input id="name" className="mt-1.5" placeholder="Your full name" />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
            Email
            <Req />
          </label>
          <Input id="email" className="mt-1.5" placeholder="Same email as your application" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Create password
            <Req />
          </label>
          <Input id="pw" className="mt-1.5" type="password" placeholder="Minimum 6 characters" />
        </div>
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => showToast("Account created (demo)")}
      >
        Create account
      </Button>
    </AuthCard>
  );
}

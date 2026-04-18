"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalSwitcher, parseAuthRole, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function titleFor(role: AuthRole) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  return "Admin portal";
}

function Req() {
  return <span className="text-danger"> *</span>;
}

function CreateAccountContent() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const roleFromUrl = useMemo(() => parseAuthRole(searchParams.get("role")), [searchParams]);
  const [role, setRole] = useState<AuthRole>(roleFromUrl);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  const title = useMemo(() => titleFor(role), [role]);

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">{title}</h1>

      <div className="mt-7">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <Link
        className="mt-5 inline-flex text-sm font-semibold text-primary hover:opacity-90"
        href={`/auth/sign-in?role=${encodeURIComponent(role)}`}
      >
        ← Back to sign in
      </Link>

      <div className="mt-6 rounded-2xl border border-[#e0e4ec] bg-[#f8fafc] p-4 text-sm leading-relaxed text-slate-600">
        {role === "resident" ? (
          <>
            Use your application email and Application ID. Finish your application and pay any application fee when
            prompted, or pay later under <span className="font-semibold text-[#0f172a]">Payments</span> in the portal.
          </>
        ) : role === "manager" ? (
          <>
            Create your manager portal account after you choose a plan on{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/partner/pricing">
              Use our software
            </Link>
            . Your Manager ID is provided after you create a subscription and pay.
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
              Manager ID
            </label>
            <Input id="mid" className="mt-1.5" placeholder="From your subscription email; leave blank if not subscribed yet" />
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

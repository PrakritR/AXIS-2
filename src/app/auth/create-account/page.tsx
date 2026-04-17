"use client";

import { PortalSwitcher, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useMemo, useState } from "react";

function titleFor(role: AuthRole) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  return "Admin portal";
}

export default function CreateAccountPage() {
  const { showToast } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");
  const title = useMemo(() => titleFor(role), [role]);

  return (
    <Card className="p-8">
      <h1 className="text-center text-2xl font-semibold">{title}</h1>
      <div className="mt-6">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <Link className="mt-6 inline-flex text-sm font-semibold text-primary" href="/auth/sign-in">
        ← Back to sign in
      </Link>

      <div className="mt-6 rounded-3xl border border-border bg-slate-50 p-4 text-sm text-muted">
        {role === "resident" ? (
          <>
            Use the email and Application ID from your application. You can create your account before paying—if an
            application fee applies, complete it from the payment prompt after you apply or anytime under{" "}
            <span className="font-semibold text-foreground">Payments</span> in the portal.
          </>
        ) : role === "manager" ? (
          <>
            Create your manager portal account after choosing a plan on{" "}
            <Link className="font-semibold text-primary" href="/partner/pricing">
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

      <div className="mt-6 space-y-3">
        {role === "resident" ? (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="app">
              Application ID *
            </label>
            <Input id="app" className="mt-2" placeholder="APP-recXXXXXXXXXXXXXXXXX" />
          </div>
        ) : null}
        {role === "manager" ? (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="mid">
              Manager ID (optional)
            </label>
            <Input id="mid" className="mt-2" placeholder="MGR-XXXXXXXXXXXXXXXX" />
          </div>
        ) : null}
        {role === "manager" ? (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="name">
              Full name
            </label>
            <Input id="name" className="mt-2" placeholder="Your full name" />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="email">
            Email *
          </label>
          <Input id="email" className="mt-2" placeholder="Same email as your application" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="pw">
            Create password *
          </label>
          <Input id="pw" className="mt-2" type="password" placeholder="Minimum 6 characters" />
        </div>
      </div>

      <Button type="button" className="mt-6 w-full" onClick={() => showToast("Account created (demo)")}>
        Create account
      </Button>
    </Card>
  );
}

"use client";

import { PortalSwitcher, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const { showToast } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");

  return (
    <Card className="p-8">
      <h1 className="text-center text-2xl font-semibold">Reset password</h1>
      <p className="mt-2 text-center text-sm text-muted">Choose the portal you use most often (demo only).</p>

      <div className="mt-6">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <div className="mt-6">
        <label className="text-xs font-semibold text-muted" htmlFor="email">
          Email
        </label>
        <Input id="email" className="mt-2" placeholder="you@example.com" />
      </div>

      <Button type="button" className="mt-6 w-full" onClick={() => showToast("Reset email sent (demo)")}>
        Send reset link
      </Button>

      <Link className="mt-6 inline-flex w-full justify-center text-sm font-semibold text-primary" href="/auth/sign-in">
        ← Back to sign in
      </Link>
    </Card>
  );
}

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

function homeFor(role: AuthRole) {
  if (role === "resident") return "/resident/dashboard";
  if (role === "manager") return "/manager/dashboard";
  return "/admin/dashboard";
}

export default function SignInPage() {
  const { showToast, openModal } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");

  const title = useMemo(() => titleFor(role), [role]);

  return (
    <Card className="p-8">
      <h1 className="text-center text-2xl font-semibold">{title}</h1>
      <div className="mt-6">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="email">
            Email
          </label>
          <Input id="email" className="mt-2" placeholder="you@example.com" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="pw">
            Password
          </label>
          <Input id="pw" className="mt-2" type="password" placeholder="••••••••" />
        </div>
      </div>

      <Link className="mt-4 inline-block text-sm font-semibold text-primary" href="/auth/forgot-password">
        Forgot password
      </Link>

      <Button
        type="button"
        className="mt-6 w-full"
        onClick={() => showToast(`Signed in to ${title} (demo)`)}
      >
        Sign in
      </Button>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          className="font-semibold text-primary"
          onClick={() => openModal({ title: "Message Axis", body: "Messaging is not wired yet." })}
        >
          Message Axis
        </button>
        <Link className="font-semibold text-primary" href={homeFor(role)}>
          Enter portal UI →
        </Link>
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link className="font-semibold text-primary" href="/auth/create-account">
          Create account
        </Link>
      </div>
    </Card>
  );
}

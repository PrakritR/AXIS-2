"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { parseAuthRole, portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isValidAdminRegisterKey } from "@/lib/auth/resolve-portal-role";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  useEffect(() => {
    setOwnerInviteRef(searchParams.get("slot") ?? "");
  }, [searchParams]);

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
        ) : role === "owner" ? (
          <>
            Owner signup is invite-only. Open the link your manager sent from the{" "}
            <span className="font-semibold text-[#0f172a]">Owners</span> tab, then use the same email they configured for
            your linked properties. One owner can work with multiple managers across different homes.
          </>
        ) : (
          <>Admin accounts require authorization from the Axis team.</>
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
        {role === "manager" || role === "owner" ? (
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="name">
              Full name
            </label>
            <Input id="name" className="mt-1.5" placeholder="Your full name" />
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
          <Input id="email" className="mt-1.5" placeholder="Same email as your application" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Create password
            <Req />
          </label>
          <PasswordInput id="pw" className="mt-1.5" autoComplete="new-password" placeholder="Minimum 6 characters" />
        </div>
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => {
          if (role === "admin" && !isValidAdminRegisterKey(adminKey)) {
            showToast("Invalid admin registration key.");
            return;
          }
          if (role === "owner" && !ownerInviteRef.trim()) {
            showToast("Invite reference is required to create an owner account.");
            return;
          }
          showToast("Account created successfully.");
          router.push(portalDashboardPath(role));
        }}
      >
        Create account
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

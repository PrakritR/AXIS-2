"use client";

import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ROLE_ORDER: AuthRole[] = ["admin", "manager", "resident", "owner"];

const SHORT_LABEL: Record<AuthRole, string> = {
  admin: "Admin",
  manager: "Manager",
  resident: "Resident",
  owner: "Owner",
};

/**
 * Marketing nav: when signed out, link to sign-in. When signed in, show one button per portal role on this account.
 */
export function PublicNavbarPortalStrip({
  className = "",
  onInteract,
}: {
  className?: string;
  /** e.g. close mobile drawer before navigating */
  onInteract?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [signedIn, setSignedIn] = useState(false);
  const [roles, setRoles] = useState<AuthRole[] | null>(null);
  const [busy, setBusy] = useState<AuthRole | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setSignedIn(false);
      setRoles(null);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch("/api/auth/portal-roles", { credentials: "include" });
      const body = (await res.json()) as { roles?: AuthRole[] };
      if (res.ok && body.roles?.length) {
        setRoles(body.roles);
      } else {
        setRoles([]);
      }
    } catch {
      setRoles([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const goPortal = async (role: AuthRole) => {
    onInteract?.();
    setBusy(role);
    try {
      const res = await fetch("/api/auth/set-active-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not open portal.");
        return;
      }
      router.push(portalDashboardPath(role));
      router.refresh();
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn) {
    return (
      <Link
        href="/auth/sign-in"
        onClick={() => onInteract?.()}
        className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] ${className}`}
        style={{
          background: "linear-gradient(135deg, #007aff, #339cff)",
          boxShadow: "0 4px 20px rgba(0,122,255,0.32)",
        }}
      >
        Portal
      </Link>
    );
  }

  const visible = ROLE_ORDER.filter((r) => roles?.includes(r));

  if (visible.length === 0) {
    return (
      <Link
        href="/auth/sign-in"
        onClick={() => onInteract?.()}
        className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-[14px] font-semibold text-white ${className}`}
        style={{
          background: "linear-gradient(135deg, #007aff, #339cff)",
          boxShadow: "0 4px 20px rgba(0,122,255,0.32)",
        }}
      >
        Portal
      </Link>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-end gap-1.5 ${className}`}>
      {visible.map((r) => (
        <button
          key={r}
          type="button"
          title={`Open ${SHORT_LABEL[r]} portal`}
          disabled={busy !== null}
          onClick={() => void goPortal(r)}
          className="rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 sm:text-[13px]"
        >
          {busy === r ? "…" : SHORT_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

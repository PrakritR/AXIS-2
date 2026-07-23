"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Self-service account deletion entry (App Store Guideline 5.1.1(v)). Reachable
 * on web AND inside the native iOS/Android shell. A user can only ever delete
 * their OWN account — the route resolves the target from the session, never the
 * client. Two-step: red entry → explicit confirmation modal → permanent delete →
 * signed out.
 */
export function PortalDeleteAccountButton({ className }: { className?: string }) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/delete-my-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error || "Couldn't delete your account. Please try again.");
        setBusy(false);
        return;
      }
      try {
        posthog.reset();
      } catch {
        /* analytics reset is best-effort */
      }
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* server route already cleared the session */
      }
      router.push("/auth/sign-in?deleted=1");
      router.refresh();
    } catch {
      showToast("Couldn't delete your account. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        data-attr="portal-delete-account"
        onClick={() => setOpen(true)}
      >
        Delete account
      </button>

      <Modal
        open={open}
        title="Delete account"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void deleteAccount()}
              data-attr="portal-delete-account-confirm"
            >
              {busy ? "Deleting…" : "Yes, permanently delete"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-foreground">
          <p className="font-semibold text-danger">
            This permanently deletes your account. This can&apos;t be undone.
          </p>
          <p>
            Deleting removes your login, your profile, and the portal data associated with your
            account: properties, applications, leases, payments, messages, documents, and any
            co-manager links you own. Afterwards this email is free to register a new account.
          </p>
          <p className="text-muted">
            Records required for legal or financial compliance (for example, payment history held by
            our payment processor, Stripe) may be retained as required by law.
          </p>
        </div>
      </Modal>
    </>
  );
}

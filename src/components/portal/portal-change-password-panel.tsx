"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { passwordResetCallbackUrl, resolveBrowserAppOrigin } from "@/lib/auth/password-reset-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PortalChangePasswordPanel({
  accountEmail,
  accountLabel = "this account",
}: {
  accountEmail: string;
  accountLabel?: string;
}) {
  const { showToast } = useAppUi();
  const email = accountEmail.trim();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const changePassword = async () => {
    if (!email) {
      showToast("Sign in to change your password.");
      return;
    }
    if (!oldPassword.trim()) {
      showToast("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match.");
      return;
    }
    if (oldPassword === newPassword) {
      showToast("Choose a new password that is different from your current one.");
      return;
    }

    setPasswordBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      if (verifyError) {
        showToast("Current password is incorrect.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showToast(error.message || "Could not update password.");
        return;
      }

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated.");
    } catch {
      showToast("Could not update password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const sendResetLink = async () => {
    if (!email) {
      showToast("No email on file for this account.");
      return;
    }
    setResetBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = passwordResetCallbackUrl(resolveBrowserAppOrigin());
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        showToast(error.message || "Could not send reset link.");
        return;
      }
      showToast(`Reset link sent to ${email}. Check your inbox.`);
    } catch {
      showToast("Could not send reset link.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <p className="text-sm font-semibold text-foreground">Change password</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Update the password used for {accountLabel}. Enter your current password, or use the email reset link below.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="text-xs font-semibold text-muted" htmlFor="portal-old-password">
            Current password
          </label>
          <PasswordInput
            id="portal-old-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            disabled={passwordBusy || resetBusy}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted" htmlFor="portal-new-password">
            New password
          </label>
          <PasswordInput
            id="portal-new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={passwordBusy || resetBusy}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted" htmlFor="portal-confirm-password">
            Confirm new password
          </label>
          <PasswordInput
            id="portal-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={passwordBusy || resetBusy}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={passwordBusy || resetBusy}
          onClick={() => void changePassword()}
        >
          {passwordBusy ? "Updating…" : "Update password"}
        </Button>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-semibold text-muted">Forgot your current password?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          We&apos;ll email a secure link to <span className="font-medium text-muted">{email || "your account email"}</span> so you
          can choose a new password.
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={resetBusy || passwordBusy || !email}
            onClick={() => void sendResetLink()}
          >
            {resetBusy ? "Sending…" : "Send reset link to email"}
          </Button>
        </div>
      </div>
    </div>
  );
}

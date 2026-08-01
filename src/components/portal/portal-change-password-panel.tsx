"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import {
  PortalSettingsFormBody,
  PortalSettingsGroup,
  PortalSettingsSection,
} from "@/components/portal/portal-settings-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { requestPasswordReset } from "@/lib/auth/request-password-reset";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PortalChangePasswordPanel({ accountEmail }: { accountEmail: string }) {
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
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        showToast(result.message);
        return;
      }
      showToast(`Reset link sent to ${email}. Check your inbox.`);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <PortalSettingsSection
      title="Login & security"
      description="Update your password or request a reset link."
      action={
        <Button
          type="button"
          variant="primary"
          className="px-4 text-[13px]"
          disabled={passwordBusy || resetBusy}
          onClick={() => void changePassword()}
        >
          {passwordBusy ? "Updating…" : "Update password"}
        </Button>
      }
    >
      <PortalSettingsGroup>
        <PortalSettingsFormBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground" htmlFor="portal-old-password">
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
              <label className="text-sm font-medium text-foreground" htmlFor="portal-new-password">
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
              <label className="text-sm font-medium text-foreground" htmlFor="portal-confirm-password">
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

          <p className="text-sm leading-relaxed text-muted">
            Forgot your current password?{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2 transition hover:opacity-80 disabled:opacity-60"
              disabled={resetBusy || passwordBusy || !email}
              onClick={() => void sendResetLink()}
            >
              {resetBusy ? "Sending…" : "Send a reset link to your email"}
            </button>
          </p>
        </PortalSettingsFormBody>
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );
}

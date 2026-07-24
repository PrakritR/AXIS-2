"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";

type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
  syncEnabled: boolean;
  configured: boolean;
  schemaReady?: boolean;
  perManager?: boolean;
  googleAuthUser?: boolean;
  missingSecret?: boolean;
  oauthRedirectUri?: string;
};

function formatGcalConnectError(reason: string | null): string {
  if (!reason) {
    return "Could not connect Google Calendar. Check redirect URI in Google Cloud.";
  }
  const decoded = decodeURIComponent(reason);
  const lower = decoded.toLowerCase();
  if (lower.includes("access_denied") || lower.includes("verification process")) {
    return (
      "Google blocked sign-in because the OAuth app is in Testing mode. Publish it to Production in Google Cloud → " +
      "OAuth consent screen (privacy policy + terms required), or temporarily add your email under Test users."
    );
  }
  return `Could not connect Google Calendar: ${decoded}`;
}

export function GoogleCalendarConnectPanel({
  onConnectionChange,
  presentation = "card",
}: {
  onConnectionChange?: () => void;
  presentation?: "card" | "dialog";
}) {
  const { showToast } = useAppUi();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const calendarCallbackUri =
    status?.oauthRedirectUri ??
    (typeof window !== "undefined" ? `${window.location.origin}/api/portal/google-calendar/callback` : "");
  const inDialog = presentation === "dialog";

  const load = useCallback(async () => {
    try {
      await fetch("/api/portal/google-calendar/link-session", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
      const res = await fetch(
        `/api/portal/google-calendar?origin=${encodeURIComponent(window.location.origin)}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as GoogleCalendarStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyRedirectUri = useCallback(async () => {
    if (!calendarCallbackUri) return;
    try {
      await navigator.clipboard.writeText(calendarCallbackUri);
      showToast("Redirect URI copied.");
    } catch {
      showToast("Could not copy. Add this URI in Google Cloud: " + calendarCallbackUri);
    }
  }, [calendarCallbackUri, showToast]);

  const connect = useCallback(() => {
    if (!status?.configured) {
      showToast("Google Calendar OAuth is not configured on this server.");
      return;
    }
    const origin = encodeURIComponent(window.location.origin);
    showToast("Opening Google sign-in…");
    window.location.assign(`/api/portal/google-calendar/connect?origin=${origin}`);
  }, [showToast, status?.configured]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (!gcal) return;
    if (gcal === "connected") showToast("Google Calendar connected.");
    if (gcal === "error") {
      const reason = params.get("reason");
      showToast(formatGcalConnectError(reason));
    }
    params.delete("gcal");
    params.delete("reason");
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
    void load();
    onConnectionChange?.();
  }, [load, onConnectionChange, showToast]);

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/google-calendar", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Could not disconnect.");
      await load();
      onConnectionChange?.();
      showToast("Google Calendar disconnected.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSync = async (next: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/google-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ syncEnabled: next }),
      });
      if (!res.ok) throw new Error("Could not update sync setting.");
      await load();
      onConnectionChange?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update sync setting.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return inDialog ? <p className="text-sm text-muted">Loading…</p> : null;
  }

  const shellClass = inDialog ? "space-y-4" : "rounded-lg border border-border bg-card p-4 shadow-sm";

  return (
    <div className={shellClass} data-attr="google-calendar-connect-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {status.connected && status.email ? (
            <p className="text-sm font-medium text-foreground">{status.email}</p>
          ) : status.missingSecret ? (
            <p className="text-sm text-muted">
              Linked via Google sign-in, but server is missing GOOGLE_CALENDAR_CLIENT_SECRET. Add it to
              .env.local and restart the dev server.
            </p>
          ) : (
            <p className="text-sm text-muted">
              {status.configured
                ? status.googleAuthUser
                  ? "You signed in with Google. Grant calendar access to sync tours and events."
                  : "Connect your Google account to sync tours and events."
                : status.googleAuthUser
                  ? "You signed in with Google. Link calendar access below, or sign in again and approve calendar permissions when prompted."
                  : "Sign in with Continue with Google (not email/password) to link your personal calendar automatically."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {status.connected ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled={busy || !status.configured} onClick={connect}>
              {status.googleAuthUser ? "Grant calendar access" : "Connect"}
            </Button>
          )}
        </div>
      </div>
      {!status.connected && status.configured ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] text-muted">
            Add this exact URI in Google Cloud → Credentials → OAuth client → Authorized redirect URIs
            {status.oauthRedirectUri &&
            typeof window !== "undefined" &&
            status.oauthRedirectUri !== `${window.location.origin}/api/portal/google-calendar/callback`
              ? " (shared callback host — works from any dev port):"
              : ` (port ${typeof window !== "undefined" ? window.location.port || "80" : ""}):`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[11px] text-muted">{calendarCallbackUri}</code>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void copyRedirectUri()}>
              Copy
            </Button>
          </div>
        </div>
      ) : null}
      {status.connected ? (
        <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={status.syncEnabled}
            disabled={busy}
            onChange={(e) => void toggleSync(e.target.checked)}
            data-attr="google-calendar-sync-toggle"
          />
          <span className="text-xs text-muted">Two-way sync — Google events here; confirmed tours on Google.</span>
        </label>
      ) : null}
    </div>
  );
}

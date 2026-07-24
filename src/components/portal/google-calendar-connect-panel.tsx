"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { runOAuthSignIn } from "@/lib/auth/run-oauth-sign-in";

type GoogleCalendarStatus = {
  connected: boolean;
  email: string | null;
  syncEnabled: boolean;
  configured: boolean;
  schemaReady?: boolean;
  perManager?: boolean;
  googleAuthUser?: boolean;
  missingSecret?: boolean;
};

function debugCalendarPanel(location: string, message: string, data: Record<string, unknown>): void {
  // #region agent log
  fetch("http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "81cbea" },
    body: JSON.stringify({
      sessionId: "81cbea",
      location,
      message,
      data,
      timestamp: Date.now(),
      hypothesisId: "H1-H3",
      runId: "auto-link-v5",
    }),
  }).catch(() => undefined);
  // #endregion
}

export function GoogleCalendarConnectPanel({ onConnectionChange }: { onConnectionChange?: () => void }) {
  const { showToast } = useAppUi();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const autoConnectStarted = useRef(false);
  const calendarCallbackUri =
    typeof window !== "undefined" ? `${window.location.origin}/api/portal/google-calendar/callback` : "";

  const load = useCallback(async () => {
    try {
      await fetch("/api/portal/google-calendar/link-session", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
      const res = await fetch("/api/portal/google-calendar", { credentials: "include" });
      if (!res.ok) {
        debugCalendarPanel("google-calendar-connect-panel.tsx", "status fetch failed", {
          status: res.status,
        });
        return;
      }
      const data = (await res.json()) as GoogleCalendarStatus;
      setStatus(data);
      debugCalendarPanel("google-calendar-connect-panel.tsx", "status loaded", {
        connected: data.connected,
        configured: data.configured,
        schemaReady: data.schemaReady,
        googleAuthUser: data.googleAuthUser,
        missingSecret: data.missingSecret,
      });
    } catch (error) {
      debugCalendarPanel("google-calendar-connect-panel.tsx", "status load error", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    sessionStorage.removeItem("gcal-auto-connect");
    void load();
  }, [load]);

  const connectWithDedicatedOAuth = useCallback(() => {
    debugCalendarPanel("google-calendar-connect-panel.tsx", "connect via dedicated oauth", {
      origin: window.location.origin,
      redirectUri: calendarCallbackUri,
    });
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `/api/portal/google-calendar/connect?origin=${origin}`;
  }, [calendarCallbackUri]);

  const connectWithGoogleSignIn = useCallback(async () => {
    setBusy(true);
    debugCalendarPanel("google-calendar-connect-panel.tsx", "connect via supabase oauth", {
      configured: status?.configured,
      googleAuthUser: status?.googleAuthUser,
    });
    const result = await runOAuthSignIn({
      provider: "google",
      intent: "manager",
      nextPath: "/portal/calendar",
      viaContinue: false,
    });
    if (!result.ok) {
      showToast(result.message);
      setBusy(false);
    }
  }, [showToast, status?.configured, status?.googleAuthUser]);

  const connect = useCallback(() => {
    if (status?.configured) {
      connectWithDedicatedOAuth();
      return;
    }
    void connectWithGoogleSignIn();
  }, [connectWithDedicatedOAuth, connectWithGoogleSignIn, status?.configured]);

  useEffect(() => {
    if (!status || status.connected || !status.configured || status.schemaReady === false) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal")) return;
    if (autoConnectStarted.current) return;
    autoConnectStarted.current = true;
    debugCalendarPanel("google-calendar-connect-panel.tsx", "auto-start dedicated oauth", {
      googleAuthUser: status.googleAuthUser,
    });
    connectWithDedicatedOAuth();
  }, [status, connectWithDedicatedOAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (!gcal) return;
    if (gcal === "connected") showToast("Google Calendar connected.");
    if (gcal === "error") {
      showToast(
        `Could not connect Google Calendar. In Google Cloud → Credentials → OAuth client, add Authorized redirect URI: ${calendarCallbackUri}`,
      );
    }
    params.delete("gcal");
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
    void load();
    onConnectionChange?.();
  }, [calendarCallbackUri, load, onConnectionChange, showToast]);

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

  if (!status) return null;

  if (!status.configured && !status.connected) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm" data-attr="google-calendar-connect-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Your personal Google Calendar</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {status.googleAuthUser
                ? "You signed in with Google. Link calendar access below, or sign in again and approve calendar permissions when prompted."
                : "Sign in with Continue with Google (not email/password) to link your personal calendar automatically."}
              {status.missingSecret
                ? " Calendar sync is not enabled on this server yet — your admin only needs to configure it once for all managers."
                : null}
            </p>
          </div>
          <Button type="button" variant="primary" disabled={busy} onClick={() => void connect()}>
            {status.googleAuthUser ? "Grant calendar access" : "Continue with Google"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm" data-attr="google-calendar-connect-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Your personal Google Calendar</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {status.connected
              ? "Linked to your Google account. Only your calendar is tied to this PropLane login."
              : "Click Connect to authorize your Google Calendar. You can keep your current PropLane login."}
          </p>
          {!status.connected && calendarCallbackUri ? (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              <span className="font-medium text-foreground">One-time Google Cloud setup:</span> add this Authorized
              redirect URI to your OAuth client, then click Connect:
              <code className="mt-1 block break-all rounded bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                {calendarCallbackUri}
              </code>
            </p>
          ) : null}
          {status.connected && status.email ? (
            <p className="mt-1 text-xs font-medium text-foreground">{status.email}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status.connected ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled={busy} onClick={connect}>
              Connect my Google Calendar
            </Button>
          )}
        </div>
      </div>
      {status.connected ? (
        <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-border pt-3">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={status.syncEnabled}
            disabled={busy}
            onChange={(e) => void toggleSync(e.target.checked)}
            data-attr="google-calendar-sync-toggle"
          />
          <span className="text-xs text-muted">
            <span className="font-medium text-foreground">Two-way sync</span> — show Google events here and add confirmed
            PropLane tours to Google Calendar.
          </span>
        </label>
      ) : null}
    </div>
  );
}

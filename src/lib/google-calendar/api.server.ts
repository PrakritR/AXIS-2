import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type GoogleCalendarConnection,
  isGoogleCalendarOAuthConfigured,
  loadGoogleCalendarConnection,
  resolveGoogleCalendarOAuthConfig,
  saveGoogleCalendarConnection,
} from "@/lib/google-calendar/settings";
import { GOOGLE_CALENDAR_OAUTH_SCOPES } from "@/lib/google-calendar/scopes";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function clientId(): string {
  const id = resolveGoogleCalendarOAuthConfig()?.clientId;
  if (!id) throw new Error("Google Calendar is not configured.");
  return id;
}

function clientSecret(): string {
  const secret = resolveGoogleCalendarOAuthConfig()?.clientSecret;
  if (!secret) throw new Error("Google Calendar is not configured.");
  return secret;
}

function stateSecret(): string {
  return clientSecret();
}

/** OAuth redirect host — override when multiple dev ports share one Google redirect URI. */
export function resolveGoogleCalendarRedirectOrigin(browserOrigin: string): string {
  const override = process.env.GOOGLE_CALENDAR_REDIRECT_ORIGIN?.trim().replace(/\/$/, "");
  if (override) return override;
  return browserOrigin.replace(/\/$/, "");
}

export function googleCalendarOAuthRedirectUri(browserOrigin: string): string {
  return `${resolveGoogleCalendarRedirectOrigin(browserOrigin)}/api/portal/google-calendar/callback`;
}

export type GoogleCalendarOAuthState = {
  userId: string;
  returnOrigin: string;
};

export function buildGoogleCalendarOAuthUrl(browserOrigin: string, managerUserId: string): string {
  const returnOrigin = browserOrigin.replace(/\/$/, "");
  const redirectUri = googleCalendarOAuthRedirectUri(browserOrigin);
  const state = signOAuthState(managerUserId, returnOrigin);
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function signOAuthState(managerUserId: string, returnOrigin: string): string {
  const payload = JSON.stringify({ uid: managerUserId, t: Date.now(), returnOrigin });
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): GoogleCalendarOAuthState | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep < 0) {
      debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
        hypothesisId: "H17",
        reason: "no_separator",
      });
      return null;
    }
    const payload = decoded.slice(0, sep);
    const sig = decoded.slice(sep + 1);
    const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
        hypothesisId: "H17",
        reason: "bad_signature",
      });
      return null;
    }
    const parsed = JSON.parse(payload) as { uid?: string; t?: number; returnOrigin?: string };
    if (!parsed.uid || typeof parsed.t !== "number") {
      debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
        hypothesisId: "H17",
        reason: "bad_payload",
      });
      return null;
    }
    if (Date.now() - parsed.t > 15 * 60 * 1000) {
      debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
        hypothesisId: "H17",
        reason: "expired",
      });
      return null;
    }
    const returnOrigin =
      typeof parsed.returnOrigin === "string" && parsed.returnOrigin.trim()
        ? parsed.returnOrigin.trim().replace(/\/$/, "")
        : null;
    if (!returnOrigin) {
      debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
        hypothesisId: "H17",
        reason: "missing_return_origin",
      });
      return null;
    }
    return { userId: parsed.uid, returnOrigin };
  } catch (error) {
    debugGoogleCalendarLog("api.server.ts:verifyOAuthState", "state verify failed", {
      hypothesisId: "H17",
      reason: "parse_error",
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function exchangeGoogleCalendarCode(
  db: SupabaseClient,
  managerUserId: string,
  code: string,
  browserOrigin: string,
): Promise<GoogleCalendarConnection> {
  const redirectUri = googleCalendarOAuthRedirectUri(browserOrigin);
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = data.error_description?.trim() || data.error || "Could not connect Google Calendar.";
    // #region agent log
    const { debugGoogleCalendarLog } = await import("@/lib/google-calendar/debug-log.server");
    debugGoogleCalendarLog("api.server.ts:exchangeGoogleCalendarCode", "token exchange failed", {
      hypothesisId: "H10",
      error: data.error,
      errorDescription: data.error_description,
      redirectUri,
      browserOrigin,
      managerSuffix: managerUserId.slice(-6),
    });
    // #endregion
    throw new Error(detail);
  }

  const email = await fetchGoogleAccountEmail(data.access_token);
  const expiresAt =
    typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

  const existing = await loadGoogleCalendarConnection(db, managerUserId);
  return saveGoogleCalendarConnection(db, managerUserId, {
    connected: true,
    email,
    syncEnabled: true,
    refreshToken: data.refresh_token ?? existing.refreshToken,
    accessToken: data.access_token,
    accessTokenExpiresAt: expiresAt,
    calendarId: existing.calendarId ?? "primary",
  });
}

async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email?.trim() || null;
}

async function refreshAccessToken(connection: GoogleCalendarConnection): Promise<{
  accessToken: string;
  expiresAt: string | null;
}> {
  if (!connection.refreshToken) throw new Error("Google Calendar session expired. Reconnect.");
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? "Could not refresh Google Calendar session.");
  }
  const expiresAt =
    typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
  return { accessToken: data.access_token, expiresAt };
}

export async function getGoogleCalendarAccessToken(
  db: SupabaseClient,
  managerUserId: string,
): Promise<{ connection: GoogleCalendarConnection; accessToken: string }> {
  if (!isGoogleCalendarOAuthConfigured()) {
    throw new Error("Google Calendar is not configured.");
  }
  let connection = await loadGoogleCalendarConnection(db, managerUserId);
  if (!connection.connected || !connection.refreshToken) {
    throw new Error("Google Calendar is not connected.");
  }
  const expiresAt = connection.accessTokenExpiresAt ? Date.parse(connection.accessTokenExpiresAt) : 0;
  const needsRefresh = !connection.accessToken || !expiresAt || expiresAt < Date.now() + 60_000;
  if (needsRefresh) {
    const refreshed = await refreshAccessToken(connection);
    connection = await saveGoogleCalendarConnection(db, managerUserId, {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: refreshed.expiresAt,
    });
  }
  if (!connection.accessToken) throw new Error("Google Calendar session expired. Reconnect.");
  return { connection, accessToken: connection.accessToken };
}

export type GoogleCalendarApiEvent = {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  htmlLink?: string;
};

export function isGoogleCalendarApiDisabledError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("calendar api") && (normalized.includes("disabled") || normalized.includes("has not been used"));
}

export function classifyGoogleCalendarEventsFetchError(message: string): {
  warning: string;
  hint: string;
} | null {
  const normalized = message.toLowerCase();
  if (isGoogleCalendarApiDisabledError(message)) {
    return {
      warning: "calendar_api_disabled",
      hint: "Enable the Google Calendar API in Google Cloud Console, then refresh this page.",
    };
  }
  if (normalized.includes("not configured")) {
    return {
      warning: "calendar_oauth_not_configured",
      hint: "Server is missing Google Calendar OAuth credentials. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET, then restart the dev server.",
    };
  }
  if (normalized.includes("not connected") || normalized.includes("reconnect") || normalized.includes("expired")) {
    return {
      warning: "calendar_not_connected",
      hint: "Google Calendar is not linked yet. Use Continue with Google when creating your manager account, or connect from the Google Calendar button.",
    };
  }
  return null;
}

export async function listGoogleCalendarEvents(
  db: SupabaseClient,
  managerUserId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarApiEvent[]> {
  const { connection, accessToken } = await getGoogleCalendarAccessToken(db, managerUserId);
  if (!connection.syncEnabled) return [];
  const calendarId = encodeURIComponent(connection.calendarId ?? "primary");
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = (await res.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Could not load Google Calendar events.");
  }
  return (data.items ?? [])
    .map((item) => {
      const start = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00` : "");
      const end = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T23:59:59` : "");
      if (!item.id || !start || !end) return null;
      return {
        id: item.id,
        summary: item.summary?.trim() || "Google Calendar event",
        description: item.description?.trim() || undefined,
        start,
        end,
        htmlLink: item.htmlLink,
      } satisfies GoogleCalendarApiEvent;
    })
    .filter(Boolean) as GoogleCalendarApiEvent[];
}

export async function createGoogleCalendarEvent(
  db: SupabaseClient,
  managerUserId: string,
  input: {
    title: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
  },
): Promise<void> {
  const { connection, accessToken } = await getGoogleCalendarAccessToken(db, managerUserId);
  if (!connection.syncEnabled) return;
  const calendarId = encodeURIComponent(connection.calendarId ?? "primary");
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Could not create Google Calendar event.");
  }
}

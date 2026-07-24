import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import type { OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";
import {
  maybeLinkGoogleCalendarFromOAuthSession,
  signedInWithGoogle,
} from "@/lib/google-calendar/link-from-auth.server";
import {
  isGoogleCalendarOAuthConfigured,
  loadGoogleCalendarConnection,
} from "@/lib/google-calendar/settings";

export type ManagerCalendarLinkOutcome = {
  connected: boolean;
  linked: boolean;
  reason: string;
  /** Dedicated calendar OAuth when inline tokens were unavailable. */
  connectPath: string | null;
};

export function buildGoogleCalendarConnectPath(requestOrigin: string): string {
  const origin = requestOrigin.replace(/\/$/, "");
  return `/api/portal/google-calendar/connect?origin=${encodeURIComponent(origin)}`;
}

/** After manager provisioning, persist Google Calendar tokens from the sign-in session when possible. */
export async function finalizeManagerGoogleCalendarLink(
  db: SupabaseClient,
  user: User,
  session: Session | null,
  requestOrigin: string,
  opts?: { intent?: OAuthSignInIntent | null; nextPath?: string | null },
): Promise<ManagerCalendarLinkOutcome> {
  const managerSuffix = user.id.slice(-6);
  const canConnect = signedInWithGoogle(user) && isGoogleCalendarOAuthConfigured();
  const connectPath = canConnect ? buildGoogleCalendarConnectPath(requestOrigin) : null;

  if (!signedInWithGoogle(user)) {
    return { connected: false, linked: false, reason: "not_google", connectPath: null };
  }

  if (!session) {
    const existing = await loadGoogleCalendarConnection(db, user.id);
    const connected = existing.connected && Boolean(existing.refreshToken);
    return {
      connected,
      linked: false,
      reason: "no_session",
      connectPath: connected ? null : connectPath,
    };
  }

  const linkResult = await maybeLinkGoogleCalendarFromOAuthSession(db, user, session, {
    intent: opts?.intent ?? "manager",
    nextPath: opts?.nextPath ?? null,
  });

  const connection = await loadGoogleCalendarConnection(db, user.id);
  const connected = connection.connected && Boolean(connection.refreshToken);

  debugGoogleCalendarLog("link-after-manager-provision.server.ts", "manager calendar link", {
    hypothesisId: "H16",
    managerSuffix,
    linked: linkResult.linked,
    reason: linkResult.reason,
    connected,
    hasRefresh: Boolean(session.provider_refresh_token),
  });

  return {
    connected,
    linked: linkResult.linked,
    reason: linkResult.reason,
    connectPath: connected ? null : connectPath,
  };
}

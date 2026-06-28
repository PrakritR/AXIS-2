/** Post-Google-OAuth route that links a manager purchase to the signed-in user. */
export function managerOauthFinishPath(sessionId: string): string {
  return `/auth/manager-oauth-finish?session_id=${encodeURIComponent(sessionId)}`;
}

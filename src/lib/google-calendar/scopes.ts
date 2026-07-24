/** Google OAuth scopes for per-manager calendar sync (sign-in + calendar connect). */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Google OAuth scopes requested only when a user explicitly connects Gmail payment tracking. */
export const GMAIL_PAYMENTS_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

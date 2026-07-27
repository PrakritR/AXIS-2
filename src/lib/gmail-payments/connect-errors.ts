/** User-facing copy when Gmail payment OAuth fails (Testing mode, blocked app, etc.). */
export function formatGmailPaymentsConnectError(reason: string | null): string {
  if (!reason?.trim()) {
    return (
      "Could not link Gmail. Use Step 4 below to forward Venmo or Zelle receipt emails to your PropLane address instead."
    );
  }
  let decoded = reason.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw reason */
  }
  const lower = decoded.toLowerCase();
  if (
    lower.includes("access_denied") ||
    lower.includes("blocked") ||
    lower.includes("verification") ||
    lower.includes("sensitive") ||
    lower.includes("has not completed the google verification")
  ) {
    return (
      "Google blocked Gmail access for this app (gmail.readonly is a restricted scope). " +
      "In Google Cloud → OAuth consent screen, add your email under Test users or publish to Production with verification. " +
      "You do not need Link Gmail to accept payments: complete Step 4 and forward receipt emails to your PropLane address."
    );
  }
  return `${decoded} You can still use Step 4 forwarding below.`;
}

export function isGmailPaymentsOAuthBlocked(reason: string | null): boolean {
  if (!reason?.trim()) return false;
  let decoded = reason.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  const lower = decoded.toLowerCase();
  return (
    lower.includes("access_denied") ||
    lower.includes("blocked") ||
    lower.includes("verification") ||
    lower.includes("sensitive")
  );
}

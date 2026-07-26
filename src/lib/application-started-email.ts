/**
 * Email sent when a guest starts (but has not submitted) a rental application.
 */

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const APPLICATION_STARTED_EMAIL_SUBJECT = "Continue your PropLane rental application";

export function buildApplicationStartedEmailBody(params: {
  applicantName?: string;
  propertyTitle?: string;
  resumeUrl: string;
  signupUrl: string;
}): string {
  const greeting = params.applicantName?.trim() ? `Hi ${params.applicantName.trim()},` : "Hi,";
  const propertyLine = params.propertyTitle?.trim() ? ` for ${params.propertyTitle.trim()}` : "";
  return [
    greeting,
    "",
    `You started a rental application${propertyLine} on PropLane.`,
    "",
    "Continue where you left off:",
    params.resumeUrl,
    "",
    "When you are ready, create your resident portal account with the same email (or sign in with Google using that email):",
    params.signupUrl,
    "",
    "— PropLane",
  ].join("\n");
}

export function buildApplicationStartedEmailHtml(params: {
  applicantName?: string;
  propertyTitle?: string;
  resumeUrl: string;
  signupUrl: string;
}): string {
  const greeting = params.applicantName?.trim() ? `Hi ${escapeHtmlText(params.applicantName.trim())},` : "Hi,";
  const propertyLine = params.propertyTitle?.trim()
    ? ` for <strong>${escapeHtmlText(params.propertyTitle.trim())}</strong>`
    : "";
  const resumeHref = escapeHtmlAttr(params.resumeUrl);
  const signupHref = escapeHtmlAttr(params.signupUrl);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;background:#f8fafc">
<div style="max-width:36rem;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
<p style="margin:0 0 12px 0">${greeting}</p>
<p style="margin:0 0 16px 0">You started a rental application${propertyLine} on PropLane.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 16px 0">
<tr><td style="border-radius:10px;background:#2563eb">
<a href="${resumeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Continue application</a>
</td></tr></table>
<p style="margin:0 0 8px 0;font-size:13px;color:#64748b">Create your resident account with the same email, or sign in with Google using that email:</p>
<p style="margin:0 0 16px 0;font-size:13px"><a href="${signupHref}" style="color:#2563eb">${escapeHtmlText(params.signupUrl)}</a></p>
<p style="margin:0;font-size:13px;color:#64748b">— PropLane</p>
</div>
</body>
</html>`;
}

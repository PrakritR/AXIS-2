/**
 * Confirmation email for self-serve vendor signup (no manager invite) — the vendor must
 * click through before Supabase will let them sign in, so an attacker typing someone
 * else's email can create a pending user but never confirm or use it.
 */

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const VENDOR_SIGNUP_CONFIRM_SUBJECT = "Confirm your PropLane vendor account";

export function buildVendorSignupConfirmEmailBody(params: { fullName?: string; confirmLink: string }): string {
  const greeting = params.fullName?.trim() ? `Hi ${params.fullName.trim()},` : "Hi,";
  const lines = [
    greeting,
    "",
    "Confirm your email to finish creating your PropLane vendor account.",
    "",
    "Confirm your email:",
    params.confirmLink,
    "",
    "If you didn't request this, you can ignore this email.",
    "",
    "— PropLane",
  ];
  return lines.join("\n");
}

export function buildVendorSignupConfirmEmailHtml(params: { fullName?: string; confirmLink: string }): string {
  const greeting = params.fullName?.trim() ? `Hi ${escapeHtmlText(params.fullName.trim())},` : "Hi,";
  const href = escapeHtmlAttr(params.confirmLink);
  const urlPlain = escapeHtmlText(params.confirmLink);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;background:#f8fafc">
<div style="max-width:36rem;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
<p style="margin:0 0 12px 0">${greeting}</p>
<p style="margin:0 0 16px 0">Confirm your email to finish creating your PropLane vendor account.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 16px 0">
<tr><td style="border-radius:10px;background:#2563eb">
<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Confirm your email</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#64748b">Or copy this link: <span style="word-break:break-all;color:#334155">${urlPlain}</span></p>
<p style="margin:16px 0 0 0;color:#64748b;font-size:14px">If you didn't request this, you can ignore this email.</p>
<p style="margin:8px 0 0 0;color:#64748b;font-size:14px">— PropLane</p>
</div>
</body>
</html>`;
}

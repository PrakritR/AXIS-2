/**
 * Branded password-reset email. PropLane sends this itself (Resend) rather than
 * leaning on Supabase's default "Supabase Auth" template, so the link can point at
 * `/auth/confirm?token_hash=…` — see `password-reset-url.ts` for why the hosted
 * template's PKCE link cannot be opened in a second browser.
 */

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const PASSWORD_RESET_SUBJECT = "Reset your PropLane password";

export function buildPasswordResetEmailBody(params: { resetLink: string }): string {
  return [
    "Hi,",
    "",
    "Use the link below to choose a new PropLane password. It expires in about an hour and can only be used once.",
    "",
    "Choose a new password:",
    params.resetLink,
    "",
    "If you didn't request this, you can ignore this email — your password stays unchanged.",
    "",
    "— PropLane",
  ].join("\n");
}

export function buildPasswordResetEmailHtml(params: { resetLink: string }): string {
  const href = escapeHtmlAttr(params.resetLink);
  const urlPlain = escapeHtmlText(params.resetLink);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;background:#f8fafc">
<div style="max-width:36rem;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
<p style="margin:0 0 12px 0">Hi,</p>
<p style="margin:0 0 16px 0">Use the button below to choose a new PropLane password. It expires in about an hour and can only be used once.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 16px 0">
<tr><td style="border-radius:10px;background:#2563eb">
<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Choose a new password</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#64748b">Or copy this link: <span style="word-break:break-all;color:#334155">${urlPlain}</span></p>
<p style="margin:16px 0 0 0;color:#64748b;font-size:14px">If you didn't request this, you can ignore this email — your password stays unchanged.</p>
<p style="margin:8px 0 0 0;color:#64748b;font-size:14px">— PropLane</p>
</div>
</body>
</html>`;
}

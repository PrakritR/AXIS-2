/**
 * Welcome email for approved applicants — server-side send (Resend) and optional mailto fallback.
 */

export const RESIDENT_WELCOME_EMAIL_SUBJECT = "Your Axis resident portal — account setup";

export function residentAccountCreationUrl(origin: string, axisId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/create-account?role=resident&axis_id=${encodeURIComponent(axisId.trim())}`;
}

/** Full invitation text (e.g. copy/paste); too long for reliable mailto URLs in most clients. */
export function buildResidentWelcomeEmailBody(params: {
  residentName?: string;
  axisId: string;
  signupUrl: string;
}): string {
  const greeting = params.residentName?.trim() ? `Hi ${params.residentName.trim()},` : "Hi,";
  const id = params.axisId.trim();
  return [
    greeting,
    "",
    "Welcome to Axis Housing. Your rental application has been approved.",
    "",
    `Your Axis ID: ${id}`,
    "",
    "Create your resident portal account here:",
    params.signupUrl,
    "",
    "What you can do in the resident portal:",
    "• Lease signing — review and sign your lease when your property sends it for signature.",
    "• Payments — see rent and charges, payment amounts, and any fines or fees your manager records.",
    "• Work orders — submit maintenance requests and follow updates.",
    "• Move-in — your earliest move-in date, access instructions, parking, and other details for your room (once your listing includes them).",
    "",
    "Use the same email address you used on your rental application when you create your account.",
    "",
    "— Axis Housing",
  ].join("\n");
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** HTML version for transactional email providers. */
export function buildResidentWelcomeEmailHtml(params: {
  residentName?: string;
  axisId: string;
  signupUrl: string;
}): string {
  const greeting = params.residentName?.trim()
    ? `Hi ${escapeHtmlText(params.residentName.trim())},`
    : "Hi,";
  const id = escapeHtmlText(params.axisId.trim());
  const href = escapeHtmlAttr(params.signupUrl);
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;max-width:36rem">
<p>${greeting}</p>
<p>Welcome to Axis Housing. Your rental application has been approved.</p>
<p><strong>Your Axis ID:</strong> ${id}</p>
<p><a href="${href}">Create your resident portal account</a></p>
<p>You can use the portal for lease signing, payments, work orders, and move-in details your property shares with you.</p>
<p>Use the same email address you used on your rental application when you create your account.</p>
<p style="color:#64748b">— Axis Housing</p>
</body>
</html>`;
}

/** Shorter body so mailto: stays under typical browser/mail-client URL limits. */
function buildResidentWelcomeMailtoBody(params: {
  residentName?: string;
  axisId: string;
  signupUrl: string;
}): string {
  const greeting = params.residentName?.trim() ? `Hi ${params.residentName.trim()},` : "Hi,";
  const id = params.axisId.trim();
  return [
    greeting,
    "",
    "Your rental application was approved. Create your resident portal account using this link:",
    "",
    params.signupUrl,
    "",
    `Your Axis ID: ${id}`,
    "",
    "Use the same email address you used on your rental application when you sign up.",
    "",
    "— Axis Housing",
  ].join("\n");
}

export function buildResidentWelcomeMailtoHref(params: {
  residentEmail: string;
  residentName?: string;
  axisId: string;
  origin: string;
}): string {
  const signupUrl = residentAccountCreationUrl(params.origin, params.axisId);
  const body = buildResidentWelcomeMailtoBody({
    residentName: params.residentName,
    axisId: params.axisId,
    signupUrl,
  });
  const subject = encodeURIComponent(RESIDENT_WELCOME_EMAIL_SUBJECT);
  const encBody = encodeURIComponent(body);
  const to = encodeURIComponent(params.residentEmail.trim());
  return `mailto:${to}?subject=${subject}&body=${encBody}`;
}

/**
 * Opens the default mail client. Uses a real <a> click so SPA navigators do not swallow mailto:
 * the way `window.location.href = mailto` sometimes can in client-rendered apps.
 */
export function openMailtoHref(href: string): void {
  if (typeof document === "undefined") return;
  try {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener noreferrer";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.setAttribute("aria-hidden", "true");
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    if (typeof window !== "undefined") window.location.assign(href);
  }
}

export function openResidentWelcomeMailto(params: {
  residentEmail: string;
  residentName?: string;
  axisId: string;
  origin: string;
}): void {
  openMailtoHref(buildResidentWelcomeMailtoHref(params));
}

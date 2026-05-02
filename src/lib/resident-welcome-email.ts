/**
 * Welcome email for approved applicants — opens the manager's mail client with a prefilled message.
 * (No transactional email provider in this demo; mailto is reliable everywhere.)
 */

export function residentAccountCreationUrl(origin: string, axisId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/create-account?role=resident&axis_id=${encodeURIComponent(axisId.trim())}`;
}

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

export function buildResidentWelcomeMailtoHref(params: {
  residentEmail: string;
  residentName?: string;
  axisId: string;
  origin: string;
}): string {
  const signupUrl = residentAccountCreationUrl(params.origin, params.axisId);
  const body = buildResidentWelcomeEmailBody({
    residentName: params.residentName,
    axisId: params.axisId,
    signupUrl,
  });
  const subject = encodeURIComponent("Your Axis resident portal — account setup");
  const encBody = encodeURIComponent(body);
  const to = encodeURIComponent(params.residentEmail.trim());
  return `mailto:${to}?subject=${subject}&body=${encBody}`;
}

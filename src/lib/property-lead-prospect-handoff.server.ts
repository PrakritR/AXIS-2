import { resolveEmailLinkBaseUrl } from "@/lib/app-url";
import { sendResidentOutboundSms } from "@/lib/resident-outbound-sms.server";

async function deliverEmail(to: string[], subject: string, text: string): Promise<void> {
  const recipients = to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  if (recipients.length === 0) return;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;
  const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, text }),
  }).catch(() => undefined);
}

function buildCreateAccountUrl(input: {
  origin: string;
  email: string;
  name?: string;
  phone?: string;
}): string {
  const params = new URLSearchParams({
    role: "resident",
    next: "/resident/communication/active",
    handoff: "message",
  });
  params.set("email", input.email.trim().toLowerCase());
  const name = input.name?.trim();
  if (name) params.set("name", name);
  const phone = input.phone?.trim();
  if (phone) params.set("phone", phone);
  return `${input.origin.replace(/\/$/, "")}/auth/create-account?${params.toString()}`;
}

/** Email (+ optional SMS) nudging a guest to create a resident account after a listing message. */
export async function notifyProspectPropertyMessageHandoff(input: {
  name: string;
  email: string;
  phone?: string;
  smsConsent: boolean;
  propertyTitle: string;
  topic: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return;

  const origin = resolveEmailLinkBaseUrl();
  const createAccountUrl = buildCreateAccountUrl({
    origin,
    email,
    name: input.name,
    phone: input.phone,
  });
  const greeting = input.name.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const subject = `We received your message — ${input.topic}`;
  const text = [
    greeting,
    "",
    `Thanks for reaching out about ${input.propertyTitle}. Your message was sent to the property manager.`,
    "",
    "Create a free PropLane resident account to read replies in Communication and keep this conversation in one place:",
    createAccountUrl,
    "",
    "— PropLane",
  ].join("\n");

  await deliverEmail([email], subject, text);

  const phone = input.phone?.trim();
  if (input.smsConsent === true && phone) {
    await sendResidentOutboundSms({
      to: phone,
      text: `PropLane: we received your message about ${input.propertyTitle}. Create your free account to read replies: ${createAccountUrl} Reply STOP to opt out, HELP for help.`,
    }).catch(() => undefined);
  }
}

/** Outbound email log persisted through the backend record API. */

export type DemoOutboundMail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
};

/** Records an outbound email event for admin/debug visibility. */
export function logDemoOutboundEmail(to: string, subject: string, body: string) {
  const row: DemoOutboundMail = {
    id: crypto.randomUUID(),
    to: to.trim(),
    subject: subject.trim(),
    body: body.trim(),
    sentAt: new Date().toISOString(),
  };
  if (typeof window === "undefined") return;
  void fetch("/api/portal-outbound-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

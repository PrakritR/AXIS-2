/** Demo-only outbound “email” log (sessionStorage). Real product would call an email API. */
const KEY = "axis_demo_outbound_mail_v1";

export type DemoOutboundMail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
};

function readAll(): DemoOutboundMail[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as DemoOutboundMail[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: DemoOutboundMail[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* ignore */
  }
}

/** Records a simulated email (visible in devtools sessionStorage under axis_demo_outbound_mail_v1). */
export function logDemoOutboundEmail(to: string, subject: string, body: string) {
  const row: DemoOutboundMail = {
    id: crypto.randomUUID(),
    to: to.trim(),
    subject: subject.trim(),
    body: body.trim(),
    sentAt: new Date().toISOString(),
  };
  const next = [...readAll(), row];
  writeAll(next);
}

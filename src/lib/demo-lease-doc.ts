import type { HouseUnit, RentalApplication } from "@/lib/demo-application-house";

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fullAddress(h: HouseUnit) {
  const line2 = h.unit ? `, Unit ${h.unit}` : "";
  return `${h.street}${line2}, ${h.city}, ${h.state} ${h.zip}`;
}

/** Build token map from application + linked house (house may be null — still returns safe strings). */
export function leaseTokenMap(app: RentalApplication, house: HouseUnit | null): Record<string, string> {
  const h = house;
  return {
    TENANT_FULL_NAME: app.fullLegalName,
    TENANT_EMAIL: app.email,
    TENANT_PHONE: app.phone,
    APPLICATION_ID: app.id,
    APPLICATION_DATE: new Date(app.submittedAt).toLocaleDateString(undefined, { dateStyle: "medium" }),
    LEASE_EFFECTIVE_DATE: h ? new Date(h.leaseStart).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—",
    LANDLORD_ENTITY: h?.landlordDisplayName ?? "—",
    PROPERTY_FULL_ADDRESS: h ? fullAddress(h) : "—",
    UNIT_NUMBER: h?.unit?.trim() ? h.unit : "—",
    LEASE_START: h ? h.leaseStart : "—",
    LEASE_END: h ? h.leaseEnd : "—",
    MONTHLY_RENT: h ? money(h.monthlyRentCents) : "—",
    SECURITY_DEPOSIT: h ? money(h.securityDepositCents) : "—",
    MANAGER_CONTACT: h?.managerContactLine ?? "—",
  };
}

export function fillLeaseTemplate(templateHtml: string, app: RentalApplication, house: HouseUnit | null): string {
  const map = leaseTokenMap(app, house);
  return templateHtml.replace(PLACEHOLDER, (_, key: string) => map[key] ?? `{{${key}}}`);
}

/** Fetch from Next.js `public/assets/lease-example.html` → `/assets/lease-example.html`. */
export async function fetchLeaseTemplate(): Promise<string> {
  try {
    const res = await fetch("/assets/lease-example.html", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } catch {
    return FALLBACK_LEASE_TEMPLATE;
  }
}

export function openPrintableLease(htmlFilled: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
  if (!w) return false;
  w.document.open();
  w.document.write(htmlFilled);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  }, 300);
  return true;
}

export function downloadLeaseHtmlFile(filename: string, htmlFilled: string) {
  const blob = new Blob([htmlFilled], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^a-z0-9._-]+/gi, "_");
  a.click();
  URL.revokeObjectURL(url);
}

const FALLBACK_LEASE_TEMPLATE = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Lease</title></head><body>
<h1>Residential Lease Agreement</h1>
<p>Tenant: {{TENANT_FULL_NAME}} · {{TENANT_EMAIL}} · {{TENANT_PHONE}}</p>
<p>Premises: {{PROPERTY_FULL_ADDRESS}} Unit {{UNIT_NUMBER}}</p>
<p>Term: {{LEASE_START}} to {{LEASE_END}} · Rent {{MONTHLY_RENT}} · Deposit {{SECURITY_DEPOSIT}}</p>
<p>Landlord: {{LANDLORD_ENTITY}} · {{MANAGER_CONTACT}}</p>
<p>Ref {{APPLICATION_ID}} submitted {{APPLICATION_DATE}}</p>
</body></html>`;

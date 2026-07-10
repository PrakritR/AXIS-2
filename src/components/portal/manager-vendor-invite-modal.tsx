"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { vendorInviteSubject } from "@/lib/vendor-invite-email";

export function ManagerVendorInviteModal({
  open,
  vendor,
  managerLabel,
  onClose,
  onSent,
  showToast,
}: {
  open: boolean;
  vendor: ManagerVendorRow | null;
  managerLabel?: string;
  onClose: () => void;
  onSent: () => void;
  showToast: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !vendor) return;
    setEmail(vendor.email.trim());
    setPhone(vendor.phone?.trim() ?? "");
    setPreferredLanguage(vendor.preferredLanguage ?? "");
    setBusy(false);
  }, [open, vendor]);

  async function send() {
    if (!vendor) return;
    const vendorEmail = email.trim().toLowerCase();
    if (!vendorEmail || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(vendorEmail)) {
      showToast("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/portal/send-vendor-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          vendorId: vendor.id,
          vendorName: vendor.name,
          vendorEmail,
          phone: phone.trim(),
          preferredLanguage,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        mailtoHref?: string;
      };
      if (!res.ok || data.ok === false) {
        if (data.mailtoHref) {
          window.open(data.mailtoHref, "_blank");
          showToast(data.error ?? "Email delivery isn't configured — opened your email client instead.");
          onSent();
          return;
        }
        showToast(data.error ?? "Could not send invite.");
        return;
      }
      onSent();
    } catch {
      showToast("Could not send invite.");
    } finally {
      setBusy(false);
    }
  }

  const managerName = managerLabel?.trim() || "Your property manager";

  return (
    <Modal open={open} title="Send vendor invite" onClose={onClose} panelClassName="max-w-md" dense>
      {vendor ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Send <span className="font-medium text-foreground">{vendor.name}</span> an email inviting them to{" "}
            <span className="font-medium text-foreground">sign up for Axis</span> as a vendor. They&apos;ll get a link to
            create their account and connect to your vendor list.
          </p>
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="vendor-invite-email">
              Email address
            </label>
            <Input
              id="vendor-invite-email"
              type="email"
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@example.com"
              autoComplete="email"
              data-attr="vendor-invite-email"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="vendor-invite-phone">
              Phone (for job texts)
            </label>
            <Input
              id="vendor-invite-phone"
              type="tel"
              className="mt-1"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(206) 555-0100"
              autoComplete="tel"
              data-attr="vendor-invite-phone"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="vendor-invite-language">
              Preferred language
            </label>
            <Select
              id="vendor-invite-language"
              className="mt-1"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              data-attr="vendor-invite-language"
            >
              <option value="">Select…</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </Select>
          </div>
          <div className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-xs text-muted">
            <p className="font-semibold text-foreground">{vendorInviteSubject(managerName)}</p>
            <p className="mt-1 leading-relaxed">
              The message explains how to sign up for Axis, view work orders, and message {managerName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full"
              disabled={busy}
              data-attr="vendor-invite-send"
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send invite email"}
            </Button>
            <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

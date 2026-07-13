"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAppUi } from "@/components/providers/app-ui-provider";

type TextNotificationSettings = {
  phone: string | null;
  phoneVerifiedAt: string | null;
  smsConfigured: boolean;
};

const SAFE_DEFAULTS: TextNotificationSettings = {
  phone: null,
  phoneVerifiedAt: null,
  smsConfigured: false,
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reusable "Text notifications" verification block for residents and vendors.
 *
 * Reuses the user-generic `/api/manager/phone` route (POST send code → PUT
 * confirm) — the SAME endpoint the manager panel uses — so a resident/vendor
 * can verify their phone and receive SMS notifications. Demo mode simulates the
 * flow without touching the real API.
 */
export function PortalTextNotificationsBlock({
  dataAttrPrefix,
  demo = false,
}: {
  /** Kebab prefix for data-attr hooks, e.g. "resident" / "vendor". */
  dataAttrPrefix: string;
  /** Demo sandbox: simulate the flow instead of hitting the real API. */
  demo?: boolean;
}) {
  const { showToast } = useAppUi();
  const [settings, setSettings] = useState<TextNotificationSettings | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) {
      // Simulated: SMS "configured" so the inputs are demoable, nothing verified.
      setSettings({ phone: null, phoneVerifiedAt: null, smsConfigured: true });
      return;
    }
    let active = true;
    void fetch("/api/manager/phone", { credentials: "include" })
      .then(async (res) =>
        res.ok ? ((await res.json()) as TextNotificationSettings) : SAFE_DEFAULTS,
      )
      .catch(() => SAFE_DEFAULTS)
      .then((data) => {
        if (active) setSettings(data);
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const sendCode = async () => {
    if (demo) {
      setCodeSent(true);
      setCodeInput("");
      showToast("Code sent (simulated in this demo).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/manager/phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      if (!res.ok) {
        showToast(await readApiError(res, "Could not send the code."));
        return;
      }
      setCodeSent(true);
      setCodeInput("");
      showToast("Code sent — check your texts.");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (demo) {
      setSettings((s) => ({
        ...(s ?? SAFE_DEFAULTS),
        phone: phoneInput,
        phoneVerifiedAt: new Date().toISOString(),
      }));
      setEditingPhone(false);
      setCodeSent(false);
      setCodeInput("");
      setPhoneInput("");
      showToast("Phone verified (simulated in this demo).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/manager/phone", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      if (!res.ok) {
        showToast(await readApiError(res, "Could not verify the code."));
        return;
      }
      const body = (await res.json()) as { ok?: boolean; phone?: string };
      setSettings((s) => ({
        ...(s ?? SAFE_DEFAULTS),
        phone: body.phone ?? phoneInput,
        phoneVerifiedAt: new Date().toISOString(),
      }));
      setEditingPhone(false);
      setCodeSent(false);
      setCodeInput("");
      setPhoneInput("");
      showToast("Phone verified.");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const verified = Boolean(settings?.phoneVerifiedAt) && !editingPhone;
  const smsConfigured = settings?.smsConfigured ?? false;

  return (
    <PortalCollapsibleSection
      title="Text notifications"
      subtitle="Verify your mobile number to get maintenance and message updates by text."
      surfaceMuted={false}
      contentClassName="space-y-3 px-4 pb-5"
      toggleDataAttr={`${dataAttrPrefix}-text-notifications-toggle`}
    >
      {settings === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : verified ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Mobile number</p>
            <span className="font-mono text-sm text-foreground">{settings.phone}</span>
            <Badge tone="success">Verified</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 min-h-0 shrink-0 rounded-full px-3 text-xs"
            data-attr={`${dataAttrPrefix}-text-notifications-change`}
            onClick={() => {
              setPhoneInput("");
              setCodeInput("");
              setCodeSent(false);
              setEditingPhone(true);
            }}
          >
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label
              className="text-xs font-semibold text-muted"
              htmlFor={`${dataAttrPrefix}-text-notifications-phone`}
            >
              Mobile number
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${dataAttrPrefix}-text-notifications-phone`}
                className="max-w-56"
                placeholder="(206) 555-0123"
                inputMode="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                disabled={busy || !smsConfigured}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 min-h-0 shrink-0 rounded-full px-4 text-xs"
                data-attr={`${dataAttrPrefix}-text-notifications-send-code`}
                disabled={busy || !smsConfigured || !phoneInput.trim()}
                onClick={() => void sendCode()}
              >
                {busy && !codeSent ? "Sending…" : codeSent ? "Resend code" : "Send code"}
              </Button>
            </div>
          </div>
          {codeSent ? (
            <div className="space-y-2">
              <label
                className="text-xs font-semibold text-muted"
                htmlFor={`${dataAttrPrefix}-text-notifications-code`}
              >
                6-digit code
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id={`${dataAttrPrefix}-text-notifications-code`}
                  className="max-w-36 font-mono"
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="primary"
                  className="h-9 min-h-0 shrink-0 rounded-full px-4 text-xs"
                  data-attr={`${dataAttrPrefix}-text-notifications-verify`}
                  disabled={busy || codeInput.length !== 6}
                  onClick={() => void verifyCode()}
                >
                  {busy ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </div>
          ) : null}
          {smsConfigured ? null : (
            <p className="text-xs text-muted">
              Text notifications aren&apos;t available yet — they&apos;ll turn on once your property
              manager connects texting.
            </p>
          )}
        </div>
      )}
    </PortalCollapsibleSection>
  );
}

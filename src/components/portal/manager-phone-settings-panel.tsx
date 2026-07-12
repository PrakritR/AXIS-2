"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAppUi } from "@/components/providers/app-ui-provider";

type PhoneSettings = {
  phone: string | null;
  phoneVerifiedAt: string | null;
  forwardInbound: boolean;
  workNumber: string | null;
  smsConfigured: boolean;
};

const SAFE_DEFAULTS: PhoneSettings = {
  phone: null,
  phoneVerifiedAt: null,
  forwardInbound: true,
  workNumber: null,
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

/** Settings card for the manager's Axis work number, personal phone verification, and reply forwarding. */
export function ManagerPhoneSettingsPanel() {
  const { showToast } = useAppUi();
  const [settings, setSettings] = useState<PhoneSettings | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/manager/phone", { credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as PhoneSettings) : SAFE_DEFAULTS))
      .catch(() => SAFE_DEFAULTS)
      .then((data) => {
        if (active) setSettings(data);
      });
    return () => {
      active = false;
    };
  }, []);

  const sendCode = async () => {
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

  const toggleForward = async (next: boolean) => {
    const prev = settings;
    if (!prev) return;
    setSettings({ ...prev, forwardInbound: next });
    try {
      const res = await fetch("/api/manager/phone", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwardInbound: next }),
      });
      if (!res.ok) {
        showToast(await readApiError(res, "Could not save the preference."));
        setSettings((s) => (s ? { ...s, forwardInbound: prev.forwardInbound } : s));
      }
    } catch {
      showToast("Network error.");
      setSettings((s) => (s ? { ...s, forwardInbound: prev.forwardInbound } : s));
    }
  };

  const verified = Boolean(settings?.phoneVerifiedAt) && !editingPhone;
  const smsConfigured = settings?.smsConfigured ?? false;

  return (
    <PortalCollapsibleSection
      title="Phone & text messages"
      subtitle="Texts to residents and vendors send from your PropLane work number. Replies land in your Inbox and email — and can be forwarded to your phone."
      surfaceMuted={false}
      contentClassName="space-y-4 px-4 pb-5"
      toggleDataAttr="manager-phone-settings-toggle"
    >
      {settings === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-foreground">Work number</p>
            {settings.workNumber ? (
              <p className="font-mono text-sm text-foreground">{settings.workNumber}</p>
            ) : (
              <p className="text-sm text-muted">Not provisioned yet</p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            {verified ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Personal phone</p>
                  <span className="font-mono text-sm text-foreground">{settings.phone}</span>
                  <Badge tone="success">Verified</Badge>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 min-h-0 shrink-0 rounded-full px-3 text-xs"
                  data-attr="manager-phone-change"
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
                  <label className="text-xs font-semibold text-muted" htmlFor="manager-phone-input">
                    Personal phone
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="manager-phone-input"
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
                      data-attr="manager-phone-send-code"
                      disabled={busy || !smsConfigured || !phoneInput.trim()}
                      onClick={() => void sendCode()}
                    >
                      {busy && !codeSent ? "Sending…" : codeSent ? "Resend code" : "Send code"}
                    </Button>
                  </div>
                </div>
                {codeSent ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted" htmlFor="manager-phone-code-input">
                      6-digit code
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="manager-phone-code-input"
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
                        data-attr="manager-phone-verify"
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
                    SMS isn&apos;t configured yet — verification will be available once Twilio is connected.
                  </p>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <span className="min-w-0 text-sm font-semibold text-foreground">Forward replies to my phone</span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border"
              checked={settings.forwardInbound}
              onChange={(e) => void toggleForward(e.target.checked)}
              data-attr="manager-phone-forward-toggle"
            />
          </label>
        </>
      )}
    </PortalCollapsibleSection>
  );
}

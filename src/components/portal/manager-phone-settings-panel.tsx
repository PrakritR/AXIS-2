"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** Settings card for the manager's PropLane work number and reply forwarding. The personal phone comes from the profile card above. */
export function ManagerPhoneSettingsPanel() {
  const { showToast } = useAppUi();
  const [settings, setSettings] = useState<PhoneSettings | null>(null);
  const [provisioning, setProvisioning] = useState(false);

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

  const provisionNumber = async () => {
    setProvisioning(true);
    try {
      const res = await fetch("/api/manager/phone/provision", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        showToast(await readApiError(res, "Could not get a work number."));
        return;
      }
      const body = (await res.json()) as { number?: string };
      if (body.number) {
        setSettings((s) => ({ ...(s ?? SAFE_DEFAULTS), workNumber: body.number ?? null }));
        showToast(`Work number ready: ${body.number}`);
      } else {
        showToast("Work number provisioned.");
      }
    } catch {
      showToast("Network error.");
    } finally {
      setProvisioning(false);
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

  const smsConfigured = settings?.smsConfigured ?? false;
  const personalPhone = String(settings?.phone ?? "").trim();

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Work number</p>
            {settings.workNumber ? (
              <p className="font-mono text-sm text-foreground">{settings.workNumber}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted">Not provisioned yet</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 min-h-0 shrink-0 rounded-full px-3 text-xs"
                  data-attr="manager-phone-provision"
                  disabled={provisioning || !smsConfigured}
                  onClick={() => void provisionNumber()}
                >
                  {provisioning ? "Getting a number…" : "Get a work number"}
                </Button>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <span className="min-w-0 text-sm font-semibold text-foreground">
              Forward replies to my phone
              {personalPhone ? (
                <span className="ml-2 font-mono text-sm font-normal text-muted">{personalPhone}</span>
              ) : (
                <span className="mt-1 block text-xs font-normal text-muted">
                  Add your phone number in the profile section above to receive forwarded texts.
                </span>
              )}
            </span>
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

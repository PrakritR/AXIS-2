"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

type ProviderStatus = {
  googleEnabled: boolean | null;
  supabaseUrl: string | null;
  googleRedirectUri: string | null;
  appCallbackUrl: string | null;
  hint: string | null;
  googleRedirectHint: string | null;
};

export function GoogleSignInSetupNote() {
  const { showToast } = useAppUi();
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/oauth-providers")
      .then((res) => res.json())
      .then((payload: ProviderStatus) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        showToast(`${label} copied.`);
      } catch {
        showToast(`Could not copy ${label.toLowerCase()}.`);
      }
    },
    [showToast],
  );

  if (!status) return null;

  if (status.googleEnabled === false) {
    return (
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100">
        <p className="font-semibold text-amber-50">Google sign-in is not enabled in Supabase.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-100/90">
          <li>
            Open Supabase → Authentication → Providers → Google and enable it with your Google OAuth client ID and
            secret.
          </li>
          <li>
            In Google Cloud Console, add this redirect URI under your OAuth client → Authorized redirect URIs:
          </li>
        </ol>
        {status.googleRedirectUri ? (
          <RedirectUriRow
            label="Google redirect URI"
            value={status.googleRedirectUri}
            onCopy={() => void copy(status.googleRedirectUri!, "Google redirect URI")}
          />
        ) : null}
        <p className="mt-2 text-xs text-amber-100/80">
          Also allowlist <code className="font-mono">{status.appCallbackUrl ?? "/auth/callback"}</code> in Supabase URL
          configuration.
        </p>
      </div>
    );
  }

  if (!status.googleRedirectUri) return null;

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-left text-sm text-muted">
      <p className="font-semibold text-foreground">Google sign-in setup</p>
      <p className="mt-1 text-xs leading-relaxed">
        If you see <span className="font-semibold text-foreground">redirect_uri_mismatch</span>, paste this URI in
        Google Cloud → Credentials → your OAuth client → <span className="font-semibold">Authorized redirect URIs</span>
        (not your website URL).
      </p>
      <RedirectUriRow
        label="Authorized redirect URI"
        value={status.googleRedirectUri}
        onCopy={() => void copy(status.googleRedirectUri!, "Google redirect URI")}
      />
      <p className="mt-2 text-xs">
        Supabase callback allowlist:{" "}
        <code className="rounded bg-accent/50 px-1 py-0.5 font-mono text-[11px] text-foreground">
          {status.appCallbackUrl}
        </code>
      </p>
    </div>
  );
}

function RedirectUriRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="mt-3 space-y-1">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="block flex-1 break-all rounded-lg border border-border/60 bg-card px-2 py-1.5 font-mono text-[11px] text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="btn-metallic shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

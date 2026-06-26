"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function OnboardQrCode({ url, label }: { url: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((value) => {
        if (!cancelled) setDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-2">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR code for ${label} manager onboarding`}
          width={220}
          height={220}
          className="rounded-xl border border-border bg-white p-2"
        />
      ) : (
        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted">
          Generating QR…
        </div>
      )}
      <p className="text-center text-xs text-muted">Scan to open sign-up</p>
    </div>
  );
}

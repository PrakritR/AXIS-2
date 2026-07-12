"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharePayload = {
  displayName: string;
  mimeType: string;
  url: string;
  expiresAt: string;
};

export default function SharedDocumentPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`/api/share/documents/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json()) as SharePayload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Link expired or invalid.");
        if (!cancelled) setPayload(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load document.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Link unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
        <p className="text-sm text-slate-600">Loading shared document…</p>
      </main>
    );
  }

  const expires = new Date(payload.expiresAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">{payload.displayName}</h1>
      <p className="mt-1 text-sm text-slate-600">Shared securely via PropLane · expires {expires}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          href={`/api/share/documents/${encodeURIComponent(token)}?download=1`}
        >
          Download
        </a>
        <a
          className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
          href={payload.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open preview
        </a>
      </div>
      {payload.mimeType.startsWith("image/") || payload.mimeType === "application/pdf" ? (
        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {payload.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payload.url} alt={payload.displayName} className="max-h-[70vh] w-full object-contain" />
          ) : (
            <iframe title={payload.displayName} src={payload.url} className="h-[70vh] w-full" />
          )}
        </div>
      ) : null}
    </main>
  );
}

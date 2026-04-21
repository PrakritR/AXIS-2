"use client";

import { AuthCard } from "@/components/auth/auth-card";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Preview = { managerId: string; email: string; fullName: string | null };

function Step({ n, label, done }: { n: number; label: string; done?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-primary text-white" : "border-2 border-primary/30 text-primary/60"
        }`}
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10 3 5 9 2 6" />
          </svg>
        ) : (
          n
        )}
      </span>
      <p className={`text-sm leading-relaxed ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{label}</p>
    </div>
  );
}

function ManagerIdContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id") ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) { setError("No session ID found."); setLoading(false); return; }
    fetch(`/api/auth/manager-checkout-preview?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: Preview & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        setPreview({ managerId: data.managerId, email: data.email, fullName: data.fullName ?? null });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load session."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const copy = () => {
    if (!preview) return;
    void navigator.clipboard.writeText(preview.managerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-slate-500">Loading your account details…</p>
      </AuthCard>
    );
  }

  if (error || !preview) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-rose-600">{error ?? "Something went wrong."}</p>
        <div className="mt-6 flex justify-center">
          <Link className="text-sm font-semibold text-primary hover:underline" href="/partner/pricing">
            ← Back to pricing
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-[#0f172a]">Axis Pro account reserved</h1>
        {preview.fullName ? (
          <p className="mt-1 text-sm text-slate-500">Welcome, {preview.fullName}</p>
        ) : null}
      </div>

      {/* Axis ID display */}
      <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Your Axis ID</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-mono text-2xl font-bold tracking-wide text-[#0d1f4e]">{preview.managerId}</p>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Save this — you'll need it to access support or activate your account later.</p>
      </div>

      {/* Steps */}
      <div className="mt-7 space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 mb-4">Account setup steps</p>
        <Step n={1} label="Reserve your Axis ID" done />
        <Step n={2} label="Set a password to activate your portal" />
        <Step n={3} label="Sign in to Axis Pro Portal" />
      </div>

      <button
        type="button"
        onClick={() =>
          router.push(`/auth/create-account?role=manager&session_id=${encodeURIComponent(sessionId)}`)
        }
        className="mt-7 w-full rounded-full py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.25)] transition-all hover:brightness-105 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        Set up my account →
      </button>

      <p className="mt-5 text-center text-sm text-slate-400">
        Already set a password?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ManagerIdPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-slate-500">Loading…</p></AuthCard>}>
      <ManagerIdContent />
    </Suspense>
  );
}
